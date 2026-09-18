import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import { cancelShiftNotifications, scheduleShiftNotifications } from '@/utils/notificationScheduler';
import {
  type MonthlyReport,
  type WorkSession,
  calcNightMinutes,
  calcSessionMinutes,
  deleteWorkSession,
  formatMinutes,
  formatShortDate,
  generateMonthlyReport,
  getCurrentMonth,
  getDayIndex,
  getPreviousMonth,
  importSessionsBatch,
  isMonthImported,
  loadMonthlyReports,
  loadWorkSessions,
  markMonthImported,
  saveMonthlyReport,
  saveWorkSession,
} from '@/utils/workSessionStorage';
import { updateTodoWidget } from '@/widgets/updateWidget';
import {
  DEFAULT_WIDGET_SETTINGS,
  getWidgetSettings,
  saveWidgetSettings,
  type WidgetSettings,
} from '@/widgets/widgetSettings';

const DAY_ROWS: { label: string; idx: number }[] = [
  { label: 'Lundi',    idx: 1 },
  { label: 'Mardi',    idx: 2 },
  { label: 'Mercredi', idx: 3 },
  { label: 'Jeudi',    idx: 4 },
  { label: 'Vendredi', idx: 5 },
  { label: 'Samedi',   idx: 6 },
  { label: 'Dimanche', idx: 0 },
];

/** 7 jours de la semaine sélectionnée, du dimanche au lundi (newest first).
 *  offset=0 → semaine en cours, offset=-1 → semaine passée, etc. */
function getWeekDatesForOffset(offset: number): string[] {
  const today = new Date();
  const dow   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  // Sun (index 6) → Mon (index 0), du plus récent au plus ancien
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + 6 - i);
    return d.toISOString().slice(0, 10);
  });
}

function getWeekRangeLabelForOffset(offset: number): string {
  const today = new Date();
  const dow   = today.getDay();
  const mon   = new Date(today);
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return `${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
}

// ── Périodes spéciales (annotations + couleurs) ──────────────────────────────
const DATE_PERIODS: { label: string; start: string; end: string; color: string }[] = [
  { label: 'AT',          start: '2026-01-01', end: '2026-01-18', color: '#F44336' },
  { label: 'Visite méd.', start: '2026-01-19', end: '2026-01-25', color: '#7C4DFF' },
  { label: 'CPat',        start: '2026-03-08', end: '2026-03-22', color: '#2196F3' },
  { label: 'CPat',        start: '2026-04-12', end: '2026-04-17', color: '#2196F3' },
  { label: 'MàP',         start: '2026-05-27', end: '2026-06-14', color: '#7C4DFF' },
];
const FERIE_DATES = new Set(['2026-05-14', '2026-05-25']);

function getDatePeriod(dateStr: string) {
  return DATE_PERIODS.find(p => dateStr >= p.start && dateStr <= p.end) ?? null;
}

/** Retourne la couleur d'affichage des heures pour une date donnée. */
function getSessionColor(dateStr: string, fallback: string): string {
  if (FERIE_DATES.has(dateStr)) return '#4CAF50';         // vert — jour férié
  const p = getDatePeriod(dateStr);
  if (p && (p.label === 'Visite méd.' || p.label === 'MàP')) return '#7C4DFF'; // violet
  return fallback;
}

/** Retourne les périodes auxquelles appartient au moins un jour travaillé. */
function getWeekPeriods(workedDays: string[]) {
  const seen = new Set<string>();
  return DATE_PERIODS.filter(p => {
    const key = p.label + p.start;
    if (seen.has(key)) return false;
    if (workedDays.some(d => d >= p.start && d <= p.end)) {
      seen.add(key);
      return true;
    }
    return false;
  });
}

export default function WorkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // ── Planning (schedule) ──
  const [settings, setSettings]           = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving]               = useState(false);
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const [planningModified, setPlanningModified] = useState(false);

  // ── Work sessions ──
  const [workSessions,  setWorkSessions]  = useState<Record<string, WorkSession>>({});
  const [sessionInputs, setSessionInputs] = useState<Record<string, { start: string; end: string }>>({});

  // ── Monthly reports ──
  const [reports,          setReports]          = useState<MonthlyReport[]>([]);
  const [expandedReports,  setExpandedReports]  = useState<Set<string>>(new Set());
  const [expandedWeeks,    setExpandedWeeks]    = useState<Set<string>>(new Set());
  const [generatingReport, setGeneratingReport] = useState(false);
  const [mayImportDone,    setMayImportDone]    = useState(true); // true = caché par défaut

  // ── Semaine sélectionnée (0 = en cours, -1 = précédente, …) ──
  const [weekOffset, setWeekOffset] = useState(0);
  const displayDates = getWeekDatesForOffset(weekOffset);
  const todayStr     = new Date().toISOString().slice(0, 10);

  // ── Check if historical import is needed ──
  useEffect(() => {
    isMonthImported('history_v2').then(done => setMayImportDone(done));
  }, []);

  // ── Load on mount ──
  useEffect(() => { getWidgetSettings().then(s => setSettings(s)); }, []);
  useEffect(() => {
    loadWorkSessions().then(all => {
      setWorkSessions(all);
      const inputs: Record<string, { start: string; end: string }> = {};
      for (const [date, s] of Object.entries(all))
        inputs[date] = { start: s.startTime, end: s.endTime };
      setSessionInputs(inputs);
    });
    loadMonthlyReports().then(setReports);
  }, []);

  // Auto-generate previous-month report when data exists
  useEffect(() => {
    const prevMonth   = getPreviousMonth();
    const alreadyDone = reports.some(r => r.month === prevMonth);
    const hasData     = Object.keys(workSessions).some(d => d.startsWith(prevMonth));
    if (!alreadyDone && hasData && !generatingReport) handleGenerateReport(prevMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length, Object.keys(workSessions).length]);

  // ── Planning helpers ──
  function updateDay(idx: number, patch: Partial<WidgetSettings['workSchedule'][number]>) {
    setPlanningModified(true);
    setSettings(s => ({
      ...s,
      workSchedule: s.workSchedule.map((d, i) => i === idx ? { ...d, ...patch } : d),
    }));
  }

  function normalizeTime(raw: string, fallback: string): string {
    const m = raw.trim().match(/^(\d{1,2})[:hH]?(\d{2})$/);
    if (m) {
      const h  = parseInt(m[1]!, 10);
      const mi = parseInt(m[2]!, 10);
      if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59)
        return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    return fallback;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveWidgetSettings(settings);
      await updateTodoWidget();
      if (settings.shiftNotif) {
        await scheduleShiftNotifications(settings.workSchedule);
      } else {
        await cancelShiftNotifications();
      }
      setPlanningModified(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Work session helpers ──
  function getScheduledForDay(dateStr: string): { start: string; end: string } | null {
    const dayIdx = getDayIndex(dateStr);
    const day    = settings.workSchedule[dayIdx];
    if (!day || day.off) return null;
    return { start: day.start, end: day.end };
  }

  function isDayOff(dateStr: string): boolean {
    return settings.workSchedule[getDayIndex(dateStr)]?.off ?? false;
  }

  const handleSessionBlur = useCallback(async (date: string) => {
    const input = sessionInputs[date];
    if (!input) return;
    const start = normalizeTime(input.start ?? '', '');
    const end   = normalizeTime(input.end   ?? '', '');
    if (!start && !end) {
      await deleteWorkSession(date);
      setWorkSessions(s => { const n = { ...s }; delete n[date]; return n; });
    } else if (start && end) {
      const session: WorkSession = { date, startTime: start, endTime: end };
      await saveWorkSession(session);
      setWorkSessions(s => ({ ...s, [date]: session }));
      setSessionInputs(s => ({ ...s, [date]: { start, end } }));
    } else {
      return;
    }
    // Régénération automatique du rapport mensuel pour ce mois
    const month = date.slice(0, 7);
    try {
      const all    = await loadWorkSessions();
      const report = generateMonthlyReport(month, all);
      await saveMonthlyReport(report);
      setReports(prev =>
        [report, ...prev.filter(r => r.month !== month)].sort((a, b) => b.month.localeCompare(a.month))
      );
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInputs]);

  // ── Report helpers ──
  async function handleGenerateReport(month: string) {
    setGeneratingReport(true);
    try {
      const all    = await loadWorkSessions();
      const report = generateMonthlyReport(month, all);
      await saveMonthlyReport(report);
      setReports(prev =>
        [report, ...prev.filter(r => r.month !== month)].sort((a, b) => b.month.localeCompare(a.month))
      );
    } finally {
      setGeneratingReport(false);
    }
  }

  // ── Import historique Jan–Mai 2026 (one-shot) ──
  async function handleImportMay() {
    const HISTORY: WorkSession[] = [
      // ── Janvier 2026 ──
      { date: '2026-01-19', startTime: '15:00', endTime: '01:00' },
      { date: '2026-01-20', startTime: '16:00', endTime: '00:00' },
      { date: '2026-01-21', startTime: '16:00', endTime: '01:00' },
      { date: '2026-01-22', startTime: '17:00', endTime: '01:00' },
      { date: '2026-01-25', startTime: '20:00', endTime: '00:00' },
      { date: '2026-01-26', startTime: '16:00', endTime: '01:45' },
      { date: '2026-01-27', startTime: '15:00', endTime: '01:45' },
      { date: '2026-01-28', startTime: '16:00', endTime: '01:00' },
      { date: '2026-01-29', startTime: '17:00', endTime: '00:45' },
      // ── Février 2026 ──
      { date: '2026-02-01', startTime: '20:00', endTime: '00:30' },
      { date: '2026-02-02', startTime: '15:00', endTime: '01:45' },
      { date: '2026-02-03', startTime: '16:00', endTime: '00:36' },
      { date: '2026-02-04', startTime: '16:00', endTime: '00:00' },
      { date: '2026-02-05', startTime: '17:00', endTime: '00:00' },
      { date: '2026-02-08', startTime: '20:00', endTime: '00:00' },
      { date: '2026-02-09', startTime: '15:00', endTime: '00:21' },
      { date: '2026-02-10', startTime: '17:00', endTime: '00:50' },
      { date: '2026-02-11', startTime: '17:00', endTime: '01:00' },
      { date: '2026-02-12', startTime: '17:00', endTime: '02:00' },
      { date: '2026-02-15', startTime: '20:00', endTime: '00:00' },
      { date: '2026-02-16', startTime: '15:00', endTime: '02:00' },
      { date: '2026-02-17', startTime: '17:00', endTime: '03:00' },
      { date: '2026-02-18', startTime: '17:00', endTime: '03:00' },
      { date: '2026-02-19', startTime: '17:00', endTime: '01:15' },
      { date: '2026-02-22', startTime: '20:00', endTime: '00:00' },
      { date: '2026-02-23', startTime: '15:00', endTime: '03:00' },
      { date: '2026-02-24', startTime: '17:00', endTime: '02:20' },
      { date: '2026-02-25', startTime: '16:00', endTime: '00:20' },
      { date: '2026-02-26', startTime: '17:00', endTime: '01:00' },
      // ── Mars 2026 ──
      { date: '2026-03-01', startTime: '19:30', endTime: '00:00' },
      { date: '2026-03-02', startTime: '15:00', endTime: '07:22' },
      { date: '2026-03-03', startTime: '18:00', endTime: '00:20' },
      { date: '2026-03-04', startTime: '16:00', endTime: '01:00' },
      { date: '2026-03-05', startTime: '17:00', endTime: '03:00' },
      { date: '2026-03-23', startTime: '15:00', endTime: '02:25' },
      { date: '2026-03-24', startTime: '17:00', endTime: '02:00' },
      { date: '2026-03-25', startTime: '16:00', endTime: '01:00' },
      { date: '2026-03-26', startTime: '17:00', endTime: '01:00' },
      { date: '2026-03-29', startTime: '20:00', endTime: '23:30' },
      { date: '2026-03-30', startTime: '15:00', endTime: '02:45' },
      { date: '2026-03-31', startTime: '17:00', endTime: '00:00' },
      // ── Avril 2026 ──
      { date: '2026-04-01', startTime: '16:00', endTime: '01:20' },
      { date: '2026-04-02', startTime: '17:00', endTime: '01:44' },
      { date: '2026-04-06', startTime: '20:00', endTime: '00:45' },
      { date: '2026-04-07', startTime: '15:00', endTime: '02:30' },
      { date: '2026-04-08', startTime: '16:00', endTime: '01:30' },
      { date: '2026-04-09', startTime: '17:00', endTime: '02:30' },
      { date: '2026-04-19', startTime: '20:00', endTime: '01:45' },
      { date: '2026-04-20', startTime: '15:00', endTime: '02:10' },
      { date: '2026-04-21', startTime: '17:00', endTime: '00:30' },
      { date: '2026-04-22', startTime: '16:15', endTime: '01:00' },
      { date: '2026-04-23', startTime: '17:00', endTime: '00:42' },
      { date: '2026-04-24', startTime: '18:00', endTime: '01:00' },
      { date: '2026-04-27', startTime: '15:00', endTime: '01:45' },
      { date: '2026-04-28', startTime: '17:00', endTime: '01:15' },
      { date: '2026-04-29', startTime: '16:00', endTime: '03:30' },
      { date: '2026-04-30', startTime: '18:00', endTime: '00:00' },
      // ── Mai 2026 ──
      { date: '2026-05-03', startTime: '20:00', endTime: '00:15' },
      { date: '2026-05-04', startTime: '15:00', endTime: '02:00' },
      { date: '2026-05-05', startTime: '17:00', endTime: '02:00' },
      { date: '2026-05-06', startTime: '16:00', endTime: '02:00' },
      { date: '2026-05-10', startTime: '20:00', endTime: '01:30' },
      { date: '2026-05-11', startTime: '15:00', endTime: '05:30' },
      { date: '2026-05-12', startTime: '18:00', endTime: '02:30' },
      { date: '2026-05-13', startTime: '16:00', endTime: '03:30' },
      { date: '2026-05-14', startTime: '20:00', endTime: '23:30' },
      { date: '2026-05-17', startTime: '20:00', endTime: '01:30' },
      { date: '2026-05-18', startTime: '15:00', endTime: '02:30' },
      { date: '2026-05-19', startTime: '17:00', endTime: '01:30' },
      { date: '2026-05-20', startTime: '16:00', endTime: '01:30' },
      { date: '2026-05-21', startTime: '17:00', endTime: '01:00' },
      { date: '2026-05-25', startTime: '20:00', endTime: '02:00' },
      { date: '2026-05-26', startTime: '15:00', endTime: '02:30' },
      // ── MàP 27/05 → 14/06 (semaine type : 19-25 janv) ──
      // Lun 15:00→01:00 · Mar 16:00→00:00 · Mer 16:00→01:00 · Jeu 17:00→01:00 · Dim 20:00→00:00
      { date: '2026-05-27', startTime: '16:00', endTime: '01:00' }, // mer
      { date: '2026-05-28', startTime: '17:00', endTime: '01:00' }, // jeu
      { date: '2026-05-31', startTime: '20:00', endTime: '00:00' }, // dim
      { date: '2026-06-01', startTime: '15:00', endTime: '01:00' }, // lun
      { date: '2026-06-02', startTime: '16:00', endTime: '00:00' }, // mar
      { date: '2026-06-03', startTime: '16:00', endTime: '01:00' }, // mer
      { date: '2026-06-04', startTime: '17:00', endTime: '01:00' }, // jeu
      { date: '2026-06-07', startTime: '20:00', endTime: '00:00' }, // dim
      { date: '2026-06-08', startTime: '15:00', endTime: '01:00' }, // lun
      { date: '2026-06-09', startTime: '16:00', endTime: '00:00' }, // mar
      { date: '2026-06-10', startTime: '16:00', endTime: '01:00' }, // mer
      { date: '2026-06-11', startTime: '17:00', endTime: '01:00' }, // jeu
      { date: '2026-06-14', startTime: '20:00', endTime: '00:00' }, // dim
    ];

    await importSessionsBatch(HISTORY);

    // Recharge en mémoire pour mettre à jour l'état React
    const all = await loadWorkSessions();
    setWorkSessions(all);
    const inputs: Record<string, { start: string; end: string }> = {};
    for (const [date, s] of Object.entries(all))
      inputs[date] = { start: s.startTime, end: s.endTime };
    setSessionInputs(inputs);

    // Génère les rapports pour chaque mois concerné (juin inclus)
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    const newReports: MonthlyReport[] = [];
    for (const month of months) {
      const report = generateMonthlyReport(month, all);
      await saveMonthlyReport(report);
      newReports.push(report);
    }
    setReports(prev => {
      const filtered = prev.filter(r => !months.includes(r.month));
      return [...newReports, ...filtered].sort((a, b) => b.month.localeCompare(a.month));
    });

    await markMonthImported('history_v2');
    setMayImportDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Weekly total (7 jours de la semaine affichée) ──
  const weekTotalMins = displayDates.reduce((acc, d) => {
    const s = workSessions[d];
    return acc + (s ? calcSessionMinutes(s.startTime, s.endTime) : 0);
  }, 0);
  const weekOverMins = Math.max(0, weekTotalMins - 35 * 60);

  const prevMonth          = getPreviousMonth();
  const currMonth          = getCurrentMonth();
  const prevReportExists   = reports.some(r => r.month === prevMonth);
  const prevMonthHasData   = Object.keys(workSessions).some(d => d.startsWith(prevMonth));
  const currMonthHasData   = Object.keys(workSessions).some(d => d.startsWith(currMonth));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <SubPageHeader title="Travail" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════════════
            1. PLANNING — collapsible
        ══════════════════════════════════════════════ */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlanningExpanded(v => !v); }}
          style={[styles.planningToggle, { backgroundColor: colors.card, borderColor: planningModified ? colors.primary + '88' : colors.border }]}
        >
          <MaterialCommunityIcons name="calendar-clock-outline" size={18} color={planningModified ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.planningToggleTxt, { color: colors.foreground }]}>Planning de travail</Text>
          {planningModified && (
            <View style={[styles.modifiedDot, { backgroundColor: colors.primary }]} />
          )}
          <MaterialCommunityIcons
            name={planningExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>

        {planningExpanded && (
          <>
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
                          underlineColorAndroid="transparent"
                          style={[styles.timeInput, { color: colors.foreground, borderColor: colors.primary + '80', backgroundColor: colors.background }]}
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
                          underlineColorAndroid="transparent"
                          style={[styles.timeInput, { color: colors.foreground, borderColor: colors.primary + '80', backgroundColor: colors.background }]}
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
                  <Text style={[styles.notifHint, { color: colors.mutedForeground }]}>Notification les jours travaillés</Text>
                </View>
                <Switch
                  value={settings.shiftNotif}
                  onValueChange={v => { setSettings(s => ({ ...s, shiftNotif: v })); setPlanningModified(true); }}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
              </View>
            </View>

            {/* Appliquer — visible uniquement si modifié */}
            {planningModified && (
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={[styles.applyBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
              >
                <MaterialCommunityIcons name="check" size={16} color={colors.primaryForeground} />
                <Text style={[styles.applyTxt, { color: colors.primaryForeground }]}>
                  {saving ? 'Sauvegarde…' : 'Appliquer les modifications'}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* ══ IMPORT HISTORIQUE (one-shot, disparaît après) ══ */}
        {!mayImportDone && (
          <Pressable
            onPress={handleImportMay}
            style={[styles.importBanner, { backgroundColor: '#1A3A1A', borderColor: '#4CAF50' }]}
          >
            <MaterialCommunityIcons name="database-import" size={18} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#4CAF50', fontWeight: '700', fontSize: 13 }}>
                Importer l'historique — Jan → Juin 2026
              </Text>
              <Text style={{ color: '#4CAF5099', fontSize: 11, marginTop: 2 }}>
                88 sessions · 6 mois · AT · CPat · MàP · Fériés
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#4CAF50" />
          </Pressable>
        )}

        {/* ══════════════════════════════════════════════
            2. TEMPS RÉALISÉ — semaine en cours seulement
        ══════════════════════════════════════════════ */}
        <View style={styles.weekTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.section, { color: colors.mutedForeground, marginTop: 0 }]}>Temps réalisé</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWeekOffset(o => o - 1); }}
                hitSlop={12}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.weekRangeLabel, { color: colors.mutedForeground }]}>
                {getWeekRangeLabelForOffset(weekOffset)}
              </Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setWeekOffset(o => Math.min(o + 1, 0)); }}
                hitSlop={12}
                style={{ opacity: weekOffset >= 0 ? 0.25 : 1 }}
                disabled={weekOffset >= 0}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
          {weekTotalMins > 0 && (
            <View style={styles.weekTotals}>
              <Text style={[styles.weekTotal, { color: colors.foreground }]}>{formatMinutes(weekTotalMins)}</Text>
              {weekOverMins > 0 && (
                <View style={[styles.overtimeBadge, { backgroundColor: '#FF980022' }]}>
                  <Text style={[styles.overtimeTxt, { color: '#FF9800' }]}>+{formatMinutes(weekOverMins)} sup.</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, padding: 0, overflow: 'hidden' }]}>
          {displayDates.map((date, di) => {
            const isTomorrow = date > todayStr;
            const isToday    = date === todayStr;
            // isYesterday = di === 2  (normal blanc)

            const sched      = getScheduledForDay(date);
            const isOff      = isDayOff(date);
            const session    = workSessions[date];
            const input      = sessionInputs[date] ?? { start: '', end: '' };
            const workedMins = session ? calcSessionMinutes(session.startTime, session.endTime) : 0;
            const nightMins  = session ? calcNightMinutes(session.startTime,  session.endTime)  : 0;

            const rowBg   = isToday ? colors.primary + '0A' : 'transparent';
            const dateColor = isTomorrow ? colors.mutedForeground
                            : isToday   ? colors.primary
                            :              colors.foreground;

            return (
              <View
                key={date}
                style={[
                  styles.sessionRow,
                  di > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  isTomorrow && { opacity: 0.38 },
                  { backgroundColor: rowBg },
                ]}
              >
                {/* Date label */}
                <View style={styles.sessionDateCol}>
                  <Text style={[styles.sessionDate, { color: dateColor }]}>
                    {formatShortDate(date)}
                  </Text>
                  {isOff && !session && (
                    <Text style={[styles.sessionOffLabel, { color: colors.mutedForeground }]}>repos</Text>
                  )}
                </View>

                {/* Inputs */}
                <TextInput
                  value={input.start}
                  onChangeText={t => setSessionInputs(s => ({ ...s, [date]: { ...s[date] ?? { start: '', end: '' }, start: t } }))}
                  onBlur={() => handleSessionBlur(date)}
                  placeholder={sched?.start ?? '--:--'}
                  placeholderTextColor={colors.mutedForeground + '66'}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!isTomorrow}
                  underlineColorAndroid="transparent"
                  style={[
                    styles.sessionInput,
                    {
                      color: colors.foreground,
                      borderColor: input.start ? colors.primary + '90' : colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />
                <Text style={[styles.sessSep, { color: colors.mutedForeground }]}>→</Text>
                <TextInput
                  value={input.end}
                  onChangeText={t => setSessionInputs(s => ({ ...s, [date]: { ...s[date] ?? { start: '', end: '' }, end: t } }))}
                  onBlur={() => handleSessionBlur(date)}
                  placeholder={sched?.end ?? '--:--'}
                  placeholderTextColor={colors.mutedForeground + '66'}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!isTomorrow}
                  underlineColorAndroid="transparent"
                  style={[
                    styles.sessionInput,
                    {
                      color: colors.foreground,
                      borderColor: input.end ? colors.primary + '90' : colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                />

                {/* Stats */}
                <View style={styles.sessionStats}>
                  {workedMins > 0 ? (
                    <>
                      <Text style={[styles.sessionDuration, { color: colors.primary }]}>
                        {formatMinutes(workedMins)}
                      </Text>
                      {nightMins > 0 && (
                        <Text style={[styles.sessionNight, { color: '#7C4DFF' }]}>
                          🌙{formatMinutes(nightMins)}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[styles.sessionDuration, { color: colors.border }]}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ══════════════════════════════════════════════
            3. RAPPORTS MENSUELS — inchangé
        ══════════════════════════════════════════════ */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Rapports mensuels</Text>

        {!prevReportExists && prevMonthHasData && (
          <Pressable
            onPress={() => handleGenerateReport(prevMonth)}
            disabled={generatingReport}
            style={[styles.generateBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55' }]}
          >
            <MaterialCommunityIcons name="file-chart-outline" size={18} color={colors.primary} />
            <Text style={[styles.generateTxt, { color: colors.primary }]}>
              {generatingReport ? 'Génération…' : `Générer rapport de ${getPrevMonthLabel()}`}
            </Text>
          </Pressable>
        )}

        {currMonthHasData && (
          <Pressable
            onPress={() => handleGenerateReport(currMonth)}
            disabled={generatingReport}
            style={[styles.generateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="refresh" size={16} color={colors.mutedForeground} />
            <Text style={[styles.generateTxt, { color: colors.mutedForeground }]}>
              {generatingReport ? 'Génération…' : 'Mettre à jour le mois en cours'}
            </Text>
          </Pressable>
        )}

        {reports.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTxt, { color: colors.mutedForeground }]}>
              Aucun rapport — saisir des heures dans "Temps réalisé" pour générer le premier rapport mensuel.
            </Text>
          </View>
        ) : (
          reports.map(report => {
            const isExpanded = expandedReports.has(report.month);
            return (
              <View key={report.month} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, padding: 0, overflow: 'hidden' }]}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedReports(prev => {
                      const n = new Set(prev);
                      n.has(report.month) ? n.delete(report.month) : n.add(report.month);
                      return n;
                    });
                  }}
                  style={styles.reportHeader}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportMonth, { color: colors.foreground }]}>{report.label}</Text>
                    <Text style={[styles.reportMeta, { color: colors.mutedForeground }]}>
                      {report.daysWorked} jour{report.daysWorked !== 1 ? 's' : ''} travaillé{report.daysWorked !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>

                <View style={[styles.reportPills, { borderTopColor: colors.border }]}>
                  <ReportPill icon="clock-outline"   label="Total"        value={formatMinutes(report.totalMinutes)}    color={colors.primary}   bgColor={colors.primary}   colors={colors} />
                  <ReportPill icon="trending-up"     label="Heures sup."  value={report.overtimeMinutes > 0 ? `+${formatMinutes(report.overtimeMinutes)}` : '—'} color="#FF9800" bgColor="#FF9800" colors={colors} />
                  <ReportPill icon="weather-night"   label="Nuit"         value={report.nightMinutes > 0 ? formatMinutes(report.nightMinutes) : '—'} color="#7C4DFF" bgColor="#7C4DFF" colors={colors} />
                </View>

                {isExpanded && (
                  <View style={[styles.reportWeeks, { borderTopColor: colors.border }]}>
                    {report.weeks.map((w, wi) => {
                      const weekKey      = `${report.month}_${w.weekStart}`;
                      const isWeekOpen   = expandedWeeks.has(weekKey);
                      const toggleWeek   = () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setExpandedWeeks(prev => {
                          const n = new Set(prev);
                          n.has(weekKey) ? n.delete(weekKey) : n.add(weekKey);
                          return n;
                        });
                      };
                      return (
                        <View
                          key={w.weekStart}
                          style={[
                            wi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                          ]}
                        >
                          {/* ── En-tête semaine (cliquable) ── */}
                          <Pressable onPress={toggleWeek} style={styles.weekBreakRow}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Text style={[styles.weekBreakLabel, { color: colors.foreground }]}>
                                  Sem. du {new Date(w.weekStart + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                </Text>
                                {getWeekPeriods(w.days).map(p => (
                                  <View key={p.label + p.start} style={[styles.periodBadge, { backgroundColor: p.color + '22' }]}>
                                    <Text style={[styles.periodBadgeTxt, { color: p.color }]}>{p.label}</Text>
                                  </View>
                                ))}
                              </View>
                              <Text style={[styles.weekBreakSub, { color: colors.mutedForeground }]}>
                                {w.days.length} jour{w.days.length !== 1 ? 's' : ''} travaillé{w.days.length !== 1 ? 's' : ''}
                              </Text>
                            </View>
                            <View style={styles.weekBreakRight}>
                              <Text style={[styles.weekBreakTotal, { color: colors.foreground }]}>{formatMinutes(w.totalMinutes)}</Text>
                              {w.overtimeMinutes > 0 && <Text style={[styles.weekBreakOver,  { color: '#FF9800' }]}>+{formatMinutes(w.overtimeMinutes)}</Text>}
                              {w.nightMinutes    > 0 && <Text style={[styles.weekBreakNight, { color: '#7C4DFF' }]}>🌙 {formatMinutes(w.nightMinutes)}</Text>}
                            </View>
                            <MaterialCommunityIcons
                              name={isWeekOpen ? 'chevron-up' : 'chevron-down'}
                              size={15}
                              color={colors.mutedForeground}
                              style={{ marginLeft: 6 }}
                            />
                          </Pressable>

                          {/* ── Détail par jour ── */}
                          {isWeekOpen && (
                            <View style={[styles.dayBreakList, { borderTopColor: colors.border, backgroundColor: colors.background + 'CC' }]}>
                              {w.days.sort().map(date => {
                                const sess      = workSessions[date];
                                const mins      = sess ? calcSessionMinutes(sess.startTime, sess.endTime) : 0;
                                const night     = sess ? calcNightMinutes(sess.startTime,  sess.endTime)  : 0;
                                const dayLabel  = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                                const sessColor = getSessionColor(date, colors.primary);
                                const isFerie   = FERIE_DATES.has(date);
                                return (
                                  <View key={date} style={[styles.dayBreakRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <Text style={[styles.dayBreakDate, { color: colors.mutedForeground }]}>{dayLabel}</Text>
                                      {isFerie && (
                                        <View style={[styles.periodBadge, { backgroundColor: '#4CAF5022' }]}>
                                          <Text style={[styles.periodBadgeTxt, { color: '#4CAF50' }]}>Férié</Text>
                                        </View>
                                      )}
                                    </View>
                                    <View style={styles.dayBreakTimes}>
                                      {sess ? (
                                        <>
                                          <Text style={[styles.dayBreakHours, { color: sessColor }]}>
                                            {sess.startTime} → {sess.endTime}
                                          </Text>
                                          <Text style={[styles.dayBreakDuration, { color: sessColor }]}>
                                            {formatMinutes(mins)}
                                          </Text>
                                          {night > 0 && (
                                            <Text style={[styles.dayBreakNight, { color: '#7C4DFF' }]}>
                                              🌙{formatMinutes(night)}
                                            </Text>
                                          )}
                                        </>
                                      ) : (
                                        <Text style={[styles.dayBreakHours, { color: colors.border }]}>—</Text>
                                      )}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <Pressable
                      onPress={() => handleGenerateReport(report.month)}
                      disabled={generatingReport}
                      style={[styles.regenBtn, { borderTopColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="refresh" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.regenTxt, { color: colors.mutedForeground }]}>Recalculer</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPrevMonthLabel(): string {
  const [y, m] = getPreviousMonth().split('-').map(Number);
  const lbl = new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  return lbl.charAt(0).toUpperCase() + lbl.slice(1);
}

function ReportPill({
  icon, label, value, color, bgColor, colors,
}: {
  icon: string; label: string; value: string;
  color: string; bgColor: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}) {
  return (
    <View style={[rps.pill, { backgroundColor: bgColor + '15', borderColor: bgColor + '30' }]}>
      <MaterialCommunityIcons name={icon as any} size={14} color={color} />
      <View>
        <Text style={[rps.label, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[rps.value, { color }]}>{value}</Text>
      </View>
    </View>
  );
}
const rps = StyleSheet.create({
  pill:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderWidth: 1, borderRadius: 10 },
  label: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  value: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:   { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  section: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  card:    { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  emptyTxt: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center', paddingVertical: 8 },

  // Planning toggle button
  planningToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  planningToggleTxt: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  modifiedDot: { width: 7, height: 7, borderRadius: 4 },

  // Planning grid
  dayRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel:  { width: 74, fontSize: 13, fontFamily: 'Inter_500Medium' },
  timeGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { width: 58, height: 34, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_500Medium', paddingVertical: 0 },
  timeSep:   { fontSize: 13, fontFamily: 'Inter_400Regular' },
  reposTxt:  { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  reposToggle:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  reposToggleTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  notifRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  notifTitle: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  notifHint:  { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Apply button
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  importBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  applyTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  // Temps réalisé
  weekTitleRow:  { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  weekRangeLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  weekTotals:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  weekTotal:     { fontSize: 13, fontFamily: 'Inter_700Bold' },
  overtimeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  overtimeTxt:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9, gap: 6,
  },
  sessionDateCol: { width: 82 },
  sessionDate:    { fontSize: 12, fontFamily: 'Inter_500Medium' },
  sessionOffLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },

  // FIXED width inputs — key layout fix
  sessionInput: {
    width: 56,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  sessSep: { fontSize: 12 },

  sessionStats:    { width: 62, alignItems: 'flex-end', gap: 1 },
  sessionDuration: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sessionNight:    { fontSize: 10, fontFamily: 'Inter_400Regular' },

  // Reports
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  generateTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  reportHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  reportMonth:  { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  reportMeta:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  reportPills:  { flexDirection: 'row', gap: 6, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  reportWeeks:  { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8, gap: 0 },
  weekBreakRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, paddingHorizontal: 16 },

  // Détail jours dans une semaine
  dayBreakList:     { paddingBottom: 4 },
  dayBreakRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 20 },
  dayBreakDate:     { fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  dayBreakTimes:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayBreakHours:    { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dayBreakDuration: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dayBreakNight:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  periodBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  periodBadgeTxt:   { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  weekBreakLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  weekBreakSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  weekBreakRight: { alignItems: 'flex-end', gap: 2 },
  weekBreakTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekBreakOver:  { fontSize: 11, fontFamily: 'Inter_500Medium' },
  weekBreakNight: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  regenTxt: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  shiftHeader:    { gap: 6 },
  shiftDateLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  shiftHoursRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftHoursText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  clockoutInput:  { width: 58, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_500Medium', paddingVertical: 0 },
  clockoutLabel:  { fontSize: 10, fontFamily: 'Inter_400Regular' },
  shiftTotal:     { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  timelineBar:    { height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative' },
  timelineBlock:  { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timelineLabelTxt: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  separator:     { height: 1, marginVertical: 2 },
  historyRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  historyDateLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  historyMeta:   { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyDetail: { paddingBottom: 10, gap: 6 },
  resetBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  resetTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
