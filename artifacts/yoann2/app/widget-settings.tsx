import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { usePause } from '@/contexts/PauseContext';
import { useColors } from '@/hooks/useColors';
import {
  type ShiftClockouts,
  formatDuration,
  formatHHMM,
  getShiftWindow,
  loadClockouts,
  longShiftDate,
  saveClockout,
} from '@/utils/pauseStorage';
import { cancelShiftNotifications, scheduleShiftNotifications } from '@/utils/notificationScheduler';
import { updateTodoWidget } from '@/widgets/updateWidget';
import {
  DEFAULT_WIDGET_SETTINGS,
  getWidgetSettings,
  saveWidgetSettings,
  type DaySchedule,
  type WidgetSettings,
} from '@/widgets/widgetSettings';

// Ordre d'affichage Lun..Dim ; valeur = index dans workSchedule (0=Dim..6=Sam)
const DAY_ROWS: { label: string; idx: number }[] = [
  { label: 'Lundi', idx: 1 },
  { label: 'Mardi', idx: 2 },
  { label: 'Mercredi', idx: 3 },
  { label: 'Jeudi', idx: 4 },
  { label: 'Vendredi', idx: 5 },
  { label: 'Samedi', idx: 6 },
  { label: 'Dimanche', idx: 0 },
];

const COLOR_PALETTE = [
  '#FFC107', '#FF9800', '#FF5722', '#F44336', '#E91E63',
  '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#FFFFFF',
  '#795548', '#9E9E9E', '#607D8B', '#CCAA44', '#444444',
];

const BG_PALETTE = [
  '#FFC107',
  '#121212',
];

const FONT_SIZES = [
  { label: 'Petit', value: 13 },
  { label: 'Moyen', value: 16 },
  { label: 'Grand', value: 19 },
];

export default function WidgetSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, appointments } = useApp();
  const { activePause, sessions, startPause, stopPause, clearAllPauseSessions, workSchedule: pauseSchedule, todayShiftDate } = usePause();

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [clockoutInputs, setClockoutInputs] = useState<ShiftClockouts>({});
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    getWidgetSettings().then(s => setSettings(s));
  }, []);

  useEffect(() => {
    loadClockouts().then(co => setClockoutInputs(co));
  }, []);

  useEffect(() => {
    setExpandedShifts(s => new Set([...s, todayShiftDate]));
  }, [todayShiftDate]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveWidgetSettings(settings);
      await updateTodoWidget(tasks, appointments);
      try {
        if (settings.shiftNotif) {
          await scheduleShiftNotifications(settings.workSchedule);
        } else {
          await cancelShiftNotifications();
        }
      } catch {
        // La planification des notifs ne doit pas bloquer l'enregistrement
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer les paramètres du widget.");
    } finally {
      setSaving(false);
    }
  }

  function updateDay(idx: number, patch: Partial<DaySchedule>) {
    setSettings(s => ({
      ...s,
      workSchedule: s.workSchedule.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
  }

  // Normalise une saisie d'heure vers "HH:MM" valide, sinon renvoie un fallback.
  function normalizeTime(raw: string, fallback: string): string {
    const m = raw.trim().match(/^(\d{1,2})[:hH]?(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const mi = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
        return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      }
    }
    return fallback;
  }

  function getScheduledStart(shiftDate: string): string {
    const dayIdx = new Date(shiftDate + 'T12:00:00').getDay();
    const sched = settings.workSchedule[dayIdx];
    return !sched || sched.off ? '' : sched.start;
  }

  function getScheduledEnd(shiftDate: string): string {
    const dayIdx = new Date(shiftDate + 'T12:00:00').getDay();
    const sched = settings.workSchedule[dayIdx];
    return !sched || sched.off ? '' : sched.end;
  }

  async function handleClockoutBlur(shiftDate: string) {
    const raw = clockoutInputs[shiftDate]?.trim() ?? '';
    if (!raw) {
      await saveClockout(shiftDate, null);
      setClockoutInputs(c => { const n = { ...c }; delete n[shiftDate]; return n; });
      return;
    }
    const fallback = getScheduledEnd(shiftDate) || '23:59';
    const normalized = normalizeTime(raw, fallback);
    setClockoutInputs(c => ({ ...c, [shiftDate]: normalized }));
    await saveClockout(shiftDate, normalized);
  }

  async function pickBgImage() {
    setPickingImage(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const srcW = asset.width;
        const srcH = asset.height;

        const TARGET_W = 640;
        const TARGET_H = 320;

        const srcAspect = srcW / srcH;
        const tgtAspect = TARGET_W / TARGET_H;

        let scaleW: number;
        let scaleH: number;
        if (srcAspect > tgtAspect) {
          scaleH = TARGET_H;
          scaleW = Math.round(srcW * (TARGET_H / srcH));
        } else {
          scaleW = TARGET_W;
          scaleH = Math.round(srcH * (TARGET_W / srcW));
        }

        const cropX = Math.round((scaleW - TARGET_W) / 2);
        const cropY = Math.round((scaleH - TARGET_H) / 2);

        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [
            { resize: { width: scaleW, height: scaleH } },
            { crop: { originX: cropX, originY: cropY, width: TARGET_W, height: TARGET_H } },
          ],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        const uri = `data:image/jpeg;base64,${manipResult.base64}`;
        setSettings(s => ({ ...s, bgImageUri: uri }));
      }
    } finally {
      setPickingImage(false);
    }
  }

  function removeBgImage() {
    setSettings(s => ({ ...s, bgImageUri: undefined }));
  }

  function ColorGrid({
    value,
    palette,
    onChange,
  }: {
    value: string;
    palette: string[];
    onChange: (c: string) => void;
  }) {
    return (
      <View style={styles.palette}>
        {palette.map(c => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[
              styles.paletteCell,
              { backgroundColor: c },
              value === c && styles.paletteCellSelected,
            ]}
          >
            {value === c && (
              <MaterialCommunityIcons
                name="check"
                size={16}
                color={c === '#FFFFFF' || c === '#CCAA44' || c === '#8BC34A' || c === '#FFC107' ? '#000' : '#fff'}
              />
            )}
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Paramètres du widget</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        >
          <Text style={[styles.saveTxt, { color: colors.primaryForeground }]}>
            {saving ? '…' : 'Appliquer'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Preview */}
        <View style={[
          styles.previewBox,
          { borderColor: colors.border, overflow: 'hidden' },
          settings.bgImageUri
            ? {}
            : { backgroundColor: settings.bgColor },
        ]}>
          {settings.bgImageUri ? (
            <Image
              source={{ uri: settings.bgImageUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : null}
          <View style={[
            styles.previewInner,
            settings.bgImageUri ? { backgroundColor: 'rgba(0,0,0,0.55)' } : {},
          ]}>
            <Text style={[styles.previewSub, { color: '#9E9E9E' }]}>💼 Travail aujourd'hui</Text>
            <Text style={[styles.previewTitle, { color: settings.primaryColor, fontSize: settings.taskFontSize }]}>
              15h00 - 01h00
            </Text>
            <Text style={[styles.previewSub, { color: settings.primaryColor }]}>
              📌 Prochain : Médecin · 10h
            </Text>
            <View style={styles.previewBar}>
              {['↺', '📝', '💡', '📅', '🏠'].map((l, i) => (
                <Text key={i} style={[styles.previewBarItem, { color: '#9E9E9E', fontSize: 14 }]}>{l}</Text>
              ))}
            </View>
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Heures de travail</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
          {DAY_ROWS.map(({ label, idx }) => {
            const day = settings.workSchedule[idx];
            if (!day) return null;
            return (
              <View key={idx} style={styles.dayRow}>
                <Text style={[styles.dayLabel, { color: colors.foreground }]}>{label}</Text>
                {day.off ? (
                  <Text style={[styles.reposTxt, { color: colors.mutedForeground }]}>Repos</Text>
                ) : (
                  <View style={styles.timeGroup}>
                    <TextInput
                      value={day.start}
                      onChangeText={t => updateDay(idx, { start: t })}
                      onBlur={() => updateDay(idx, { start: normalizeTime(day.start, '09:00') })}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                    <Text style={[styles.timeSep, { color: colors.mutedForeground }]}>→</Text>
                    <TextInput
                      value={day.end}
                      onChangeText={t => updateDay(idx, { end: t })}
                      onBlur={() => updateDay(idx, { end: normalizeTime(day.end, '17:00') })}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      style={[styles.timeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                  </View>
                )}
                <Pressable
                  onPress={() => updateDay(idx, { off: !day.off })}
                  style={[
                    styles.reposToggle,
                    day.off
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.reposToggleTxt, { color: day.off ? colors.primaryForeground : colors.mutedForeground }]}>
                    Repos
                  </Text>
                </Pressable>
              </View>
            );
          })}

          <View style={[styles.notifRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.notifTitle, { color: colors.foreground }]}>Rappel 1h avant l'embauche</Text>
              <Text style={[styles.notifHint, { color: colors.mutedForeground }]}>
                Notification les jours travaillés
              </Text>
            </View>
            <Switch
              value={settings.shiftNotif}
              onValueChange={v => setSettings(s => ({ ...s, shiftNotif: v }))}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        {/* ── Suivi des pauses ── */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Suivi des pauses ☕</Text>

        {/* Bouton démarrer / arrêter */}
        <Pressable
          onPress={activePause ? stopPause : startPause}
          style={[styles.pauseBtn, { backgroundColor: activePause ? '#C62828' : colors.primary }]}
        >
          <MaterialCommunityIcons
            name={activePause ? 'stop-circle-outline' : 'play-circle-outline'}
            size={20}
            color={colors.primaryForeground}
          />
          <Text style={[styles.pauseBtnTxt, { color: colors.primaryForeground }]}>
            {activePause
              ? `⏸ En cours — ${formatDuration(Math.floor((Date.now() - activePause.startTs) / 1000))}`
              : '☕  Démarrer une pause'}
          </Text>
        </Pressable>

        {/* Journée en cours */}
        {(() => {
          const todaySessions = sessions.filter(s => s.shiftDate === todayShiftDate);
          const activeSecs    = activePause ? Math.floor((Date.now() - activePause.startTs) / 1000) : 0;
          const totalSecs     = todaySessions.reduce((a, s) => a + s.durationSecs, 0) + activeSecs;
          const nbPauses      = todaySessions.length + (activePause ? 1 : 0);
          const win           = getShiftWindow(todayShiftDate, settings.workSchedule, clockoutInputs[todayShiftDate]);
          const schedEnd      = getScheduledEnd(todayShiftDate);

          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
              {/* En-tête : date + saisie heure de fin réelle */}
              <View style={styles.shiftHeader}>
                <Text style={[styles.shiftDateLabel, { color: colors.foreground }]}>
                  {longShiftDate(todayShiftDate)}
                </Text>
                <View style={styles.shiftHoursRow}>
                  <Text style={[styles.shiftHoursText, { color: colors.mutedForeground }]}>
                    {getScheduledStart(todayShiftDate)} →
                  </Text>
                  <TextInput
                    value={clockoutInputs[todayShiftDate] ?? ''}
                    onChangeText={t => setClockoutInputs(c => ({ ...c, [todayShiftDate]: t }))}
                    onBlur={() => handleClockoutBlur(todayShiftDate)}
                    placeholder={schedEnd || 'fin'}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={[styles.clockoutInput, {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    }]}
                  />
                  <Text style={[styles.clockoutLabel, { color: colors.mutedForeground }]}>réel</Text>
                </View>
              </View>

              {/* Cumul du jour */}
              {nbPauses > 0 && (
                <Text style={[styles.shiftTotal, { color: colors.primary }]}>
                  ⏸ {formatDuration(totalSecs)} · {nbPauses} pause{nbPauses > 1 ? 's' : ''}
                </Text>
              )}

              {/* Timeline */}
              {win && nbPauses > 0 && (() => {
                const total = win.endTs - win.startTs;
                const blocks = [
                  ...todaySessions.map(s => ({ start: s.startTs, end: s.endTs, active: false })),
                  ...(activePause ? [{ start: activePause.startTs, end: Date.now(), active: true }] : []),
                ];
                return (
                  <View>
                    <View style={[styles.timelineBar, { backgroundColor: colors.border }]}>
                      {blocks.map((b, i) => {
                        const pLeft  = Math.max(0, (b.start - win.startTs) / total * 100);
                        const pWidth = Math.min(100 - pLeft, Math.max(1.5, (b.end - b.start) / total * 100));
                        return (
                          <View key={i} style={[styles.timelineBlock, {
                            left: `${pLeft}%`,
                            width: `${pWidth}%`,
                            backgroundColor: colors.primary,
                            opacity: b.active ? 0.6 : 1,
                          }]} />
                        );
                      })}
                    </View>
                    <View style={styles.timelineLabels}>
                      <Text style={[styles.timelineLabelTxt, { color: colors.mutedForeground }]}>{win.startLabel}</Text>
                      <Text style={[styles.timelineLabelTxt, { color: colors.mutedForeground }]}>
                        {clockoutInputs[todayShiftDate] ?? schedEnd}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Liste des pauses */}
              {nbPauses === 0 ? (
                <Text style={[styles.pauseHint, { color: colors.mutedForeground }]}>
                  Aucune pause aujourd'hui — appuie sur ☕ pour démarrer.
                </Text>
              ) : (
                <View style={styles.pauseList}>
                  {todaySessions.map(s => (
                    <View key={s.id} style={styles.pauseListRow}>
                      <Text style={[styles.pauseListTime, { color: colors.mutedForeground }]}>
                        ☕  {formatHHMM(s.startTs)}
                      </Text>
                      <Text style={[styles.pauseListDuration, { color: colors.foreground }]}>
                        {formatDuration(s.durationSecs)}
                      </Text>
                    </View>
                  ))}
                  {activePause && (
                    <View style={styles.pauseListRow}>
                      <Text style={[styles.pauseListTime, { color: colors.primary }]}>
                        ▶  {formatHHMM(activePause.startTs)} (en cours)
                      </Text>
                      <Text style={[styles.pauseListDuration, { color: colors.primary }]}>
                        {formatDuration(Math.floor((Date.now() - activePause.startTs) / 1000))}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })()}

        {/* Historique des shifts précédents */}
        {(() => {
          const historyDates = Array.from(
            new Set(sessions.filter(s => s.shiftDate !== todayShiftDate).map(s => s.shiftDate))
          ).sort().reverse().slice(0, 20);
          if (historyDates.length === 0) return null;

          return (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>Historique</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0 }]}>
                {historyDates.map((shiftDate, idx) => {
                  const shiftSessions = sessions.filter(s => s.shiftDate === shiftDate);
                  const total    = shiftSessions.reduce((a, s) => a + s.durationSecs, 0);
                  const win      = getShiftWindow(shiftDate, settings.workSchedule, clockoutInputs[shiftDate]);
                  const expanded = expandedShifts.has(shiftDate);
                  const sEnd     = getScheduledEnd(shiftDate);

                  return (
                    <View key={shiftDate}>
                      {idx > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                      <Pressable
                        onPress={() => setExpandedShifts(prev => {
                          const n = new Set(prev);
                          n.has(shiftDate) ? n.delete(shiftDate) : n.add(shiftDate);
                          return n;
                        })}
                        style={styles.historyRow}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyDateLabel, { color: colors.foreground }]}>
                            {longShiftDate(shiftDate)}
                          </Text>
                          <Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>
                            ⏸ {formatDuration(total)} · {shiftSessions.length} pause{shiftSessions.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </Pressable>

                      {expanded && (
                        <View style={styles.historyDetail}>
                          {win && (() => {
                            const tot = win.endTs - win.startTs;
                            return (
                              <View style={{ marginBottom: 8 }}>
                                <View style={[styles.timelineBar, { backgroundColor: colors.border }]}>
                                  {shiftSessions.map((s, i) => {
                                    const pL = Math.max(0, (s.startTs - win.startTs) / tot * 100);
                                    const pW = Math.min(100 - pL, Math.max(1.5, s.durationSecs * 1000 / tot * 100));
                                    return (
                                      <View key={i} style={[styles.timelineBlock, {
                                        left: `${pL}%`,
                                        width: `${pW}%`,
                                        backgroundColor: colors.primary,
                                      }]} />
                                    );
                                  })}
                                </View>
                                <View style={styles.timelineLabels}>
                                  <Text style={[styles.timelineLabelTxt, { color: colors.mutedForeground }]}>{win.startLabel}</Text>
                                  <Text style={[styles.timelineLabelTxt, { color: colors.mutedForeground }]}>
                                    {clockoutInputs[shiftDate] ?? sEnd}
                                  </Text>
                                </View>
                              </View>
                            );
                          })()}
                          {shiftSessions.map(s => (
                            <View key={s.id} style={styles.pauseListRow}>
                              <Text style={[styles.pauseListTime, { color: colors.mutedForeground }]}>
                                ☕  {formatHHMM(s.startTs)}
                              </Text>
                              <Text style={[styles.pauseListDuration, { color: colors.foreground }]}>
                                {formatDuration(s.durationSecs)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          );
        })()}

        {/* Effacer tout l'historique */}
        {(sessions.length > 0 || !!activePause) && (
          <Pressable
            onPress={() => Alert.alert(
              "Effacer l\u2019historique ?",
              "Toutes les sessions de pause seront supprim\u00E9es.",
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Effacer', style: 'destructive', onPress: clearAllPauseSessions },
              ]
            )}
            style={[styles.resetBtn, { borderColor: '#F4433655', marginTop: 0 }]}
          >
            <Text style={[styles.resetTxt, { color: '#F44336' }]}>Effacer tout l'historique des pauses</Text>
          </Pressable>
        )}

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Taille du texte des tâches</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chipRow}>
            {FONT_SIZES.map(fs => (
              <Pressable
                key={fs.value}
                onPress={() => setSettings(s => ({ ...s, taskFontSize: fs.value }))}
                style={[
                  styles.chip,
                  settings.taskFontSize === fs.value
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[
                  styles.chipTxt,
                  { color: settings.taskFontSize === fs.value ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {fs.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Couleur principale</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ColorGrid
            value={settings.primaryColor}
            palette={COLOR_PALETTE}
            onChange={c => setSettings(s => ({ ...s, primaryColor: c }))}
          />
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Couleur de fond</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ColorGrid
            value={settings.bgColor}
            palette={BG_PALETTE}
            onChange={c => setSettings(s => ({ ...s, bgColor: c }))}
          />
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Image de fond</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
          {settings.bgImageUri ? (
            <View style={styles.imgPreviewRow}>
              <Image
                source={{ uri: settings.bgImageUri }}
                style={styles.imgThumb}
                resizeMode="cover"
              />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={[styles.imgHint, { color: colors.mutedForeground }]}>
                  Image sélectionnée — sera utilisée comme fond du widget.
                </Text>
                <Pressable
                  onPress={removeBgImage}
                  style={[styles.removeBtn, { borderColor: colors.border }]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#F44336" />
                  <Text style={[styles.removeTxt, { color: '#F44336' }]}>Supprimer l'image</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text style={[styles.imgHint, { color: colors.mutedForeground }]}>
              Aucune image — le widget utilise la couleur de fond ci-dessus.
            </Text>
          )}
          <Pressable
            onPress={pickBgImage}
            disabled={pickingImage}
            style={[styles.pickBtn, { backgroundColor: colors.primary, opacity: pickingImage ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="image-plus" size={18} color={colors.primaryForeground} />
            <Text style={[styles.pickTxt, { color: colors.primaryForeground }]}>
              {pickingImage ? 'Chargement…' : settings.bgImageUri ? 'Changer l\'image' : 'Choisir une image'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setSettings(DEFAULT_WIDGET_SETTINGS)}
          style={[styles.resetBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.resetTxt, { color: colors.mutedForeground }]}>
            Réinitialiser les valeurs par défaut
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 16, gap: 8 },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  previewBox: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    height: 120,
  },
  previewInner: {
    flex: 1,
    padding: 14,
    gap: 8,
    borderRadius: 16,
    justifyContent: 'space-between',
  },
  previewTitle: { fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  previewSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  previewBar: { flexDirection: 'row', gap: 12 },
  previewBarItem: { fontFamily: 'Inter_500Medium' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  chipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38 },
  dayLabel: { width: 78, fontSize: 13, fontFamily: 'Inter_500Medium' },
  reposTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  timeGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  timeSep: { fontSize: 13 },
  reposToggle: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  reposToggleTxt: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
  },
  notifTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  notifHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  paletteCell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteCellSelected: { borderColor: '#FFFFFF' },
  imgPreviewRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  imgThumb: { width: 80, height: 54, borderRadius: 8 },
  imgHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  pickTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  removeTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  resetBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  resetTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  pauseBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  pauseHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
  shiftHeader: { gap: 6 },
  shiftDateLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  shiftHoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftHoursText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  clockoutInput: {
    width: 58,
    height: 30,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  clockoutLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  shiftTotal: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  timelineBar: { height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative' },
  timelineBlock: { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timelineLabelTxt: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  pauseList: { gap: 6 },
  pauseListRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pauseListTime: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pauseListDuration: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  separator: { height: 1, marginVertical: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  historyDateLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  historyMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyDetail: { paddingBottom: 10, gap: 6 },
});
