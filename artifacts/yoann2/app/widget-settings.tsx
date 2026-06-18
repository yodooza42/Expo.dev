import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

import AsyncStorage from '@react-native-async-storage/async-storage';

import { WidgetPreview } from '@/components/WidgetPreview';
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
import { buildWidgetData, type WidgetData } from '@/widgets/data';
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

  const [mariePlanning, setMariePlanning] = useState<Record<string, 'PB' | 'PD'>>({});
  const [annaBadges,    setAnnaBadges]    = useState<Record<string, 'Isabelle' | 'Evelyne'>>({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('@marie_planning_v1'),
      AsyncStorage.getItem('@anna_badges_v1'),
    ]).then(([mr, ab]) => {
      if (mr) setMariePlanning(JSON.parse(mr) as Record<string, 'PB' | 'PD'>);
      if (ab) setAnnaBadges(JSON.parse(ab)    as Record<string, 'Isabelle' | 'Evelyne'>);
    }).catch(() => {});
  }, []);

  const widgetData = useMemo<WidgetData>(() => {
    const base = buildWidgetData(
      tasks        as Parameters<typeof buildWidgetData>[0],
      appointments as Parameters<typeof buildWidgetData>[1],
      settings,
      null,
      mariePlanning,
      annaBadges,
    );
    return base;
  }, [tasks, appointments, settings, mariePlanning, annaBadges]);

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
        {/* ── Aperçu live du widget ── */}
        <Text style={[styles.section, { color: colors.mutedForeground, marginTop: 8 }]}>Aperçu</Text>
        <WidgetPreview data={widgetData} />

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
