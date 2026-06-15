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
import { formatDuration, shortDate } from '@/utils/pauseStorage';
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
  const { stats, activePause, startPause, stopPause, clearAllPauseSessions } = usePause();

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    getWidgetSettings().then(s => setSettings(s));
  }, []);

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
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 14 }]}>

          {/* Bouton démarrer / arrêter */}
          <Pressable
            onPress={activePause ? stopPause : startPause}
            style={[
              styles.pauseBtn,
              { backgroundColor: activePause ? '#F44336' : colors.primary },
            ]}
          >
            <MaterialCommunityIcons
              name={activePause ? 'stop-circle-outline' : 'play-circle-outline'}
              size={20}
              color={colors.primaryForeground}
            />
            <Text style={[styles.pauseBtnTxt, { color: colors.primaryForeground }]}>
              {activePause
                ? `⏸ Pause en cours — ${formatDuration(Math.floor((Date.now() - activePause.startTs) / 1000))}`
                : '▶ Démarrer une pause'}
            </Text>
          </Pressable>

          {/* Chiffres clés */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{formatDuration(stats.todaySecs)}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Aujourd'hui</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{formatDuration(stats.weekSecs)}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Cette semaine</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{formatDuration(stats.dailyAvgSecs)}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Moy./jour</Text>
            </View>
          </View>

          {/* Mini graphique 7 jours */}
          {stats.last7.some(d => d.secs > 0) ? (
            <View style={{ gap: 6 }}>
              <Text style={[styles.chartTitle, { color: colors.mutedForeground }]}>7 derniers jours</Text>
              <View style={styles.barChart}>
                {(() => {
                  const max = Math.max(...stats.last7.map(d => d.secs), 1);
                  return stats.last7.map(d => (
                    <View key={d.date} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${Math.max(4, Math.round((d.secs / max) * 100))}%`,
                              backgroundColor: d.secs > 0 ? colors.primary : colors.border,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>
                        {shortDate(d.date).slice(0, 5)}
                      </Text>
                    </View>
                  ));
                })()}
              </View>
            </View>
          ) : (
            <Text style={[styles.pauseHint, { color: colors.mutedForeground }]}>
              Aucune pause enregistrée cette semaine. Appuie sur ▶ pour démarrer un chrono.
            </Text>
          )}

          {/* Effacer l'historique */}
          {stats.last7.some(d => d.secs > 0) && (
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Effacer l\u2019historique ?",
                  "Toutes les sessions de pause seront supprim\u00E9es.",
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Effacer', style: 'destructive',
                      onPress: clearAllPauseSessions,
                    },
                  ]
                )
              }
              style={[styles.removeBtn, { borderColor: colors.border, alignSelf: 'flex-start' }]}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#F44336" />
              <Text style={[styles.removeTxt, { color: '#F44336' }]}>Effacer l'historique</Text>
            </Pressable>
          )}
        </View>

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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  statDivider: { width: 1, marginHorizontal: 4 },
  chartTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, fontFamily: 'Inter_400Regular' },
  pauseHint: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
});
