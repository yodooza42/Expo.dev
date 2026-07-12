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
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
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

export default function WidgetSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, appointments } = useApp();

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    getWidgetSettings().then(s => setSettings(s));
  }, []);


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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader
        title="Paramètres du widget"
        right={
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          >
            <Text style={[styles.saveTxt, { color: colors.primaryForeground }]}>
              {saving ? '…' : 'Appliquer'}
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Aperçu live du widget ── */}
        <Text style={[styles.section, { color: colors.mutedForeground, marginTop: 8 }]}>Aperçu</Text>
        {/* Simule un fond d'écran pour rendre la transparence visible */}
        <View style={styles.wallpaperFrame}>
          <WidgetPreview data={widgetData} />
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
  wallpaperFrame: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#3D2B5A',
    padding: 10,
  },
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
  timeGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: {
    width: 52,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  timeSep: { fontSize: 13 },
  reposToggle: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
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
  separator: { height: 1, marginVertical: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  historyDateLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  historyMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyDetail: { paddingBottom: 10, gap: 6 },
});
