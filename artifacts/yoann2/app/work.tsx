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
  getRecentDates,
  loadMonthlyReports,
  loadWorkSessions,
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

const RECENT_DAYS = 28;

export default function WorkScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const {
    activePause, sessions, startPause, stopPause,
    clearAllPauseSessions, todayShiftDate,
  } = usePause();

  // ── Schedule settings ──
  const [settings, setSettings]     = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving]         = useState(false);

  // ── Pause clockouts ──
  const [clockoutInputs, setClockoutInputs] = useState<ShiftClockouts>({});
  const [expandedShifts, setExpandedShifts] = useState<Set<string>>(new Set());

  // ── Work sessions (heures réelles) ──
  const [workSessions, setWorkSessions]     = useState<Record<string, WorkSession>>({});
  const [sessionInputs, setSessionInputs]   = useState<Record<string, { start: string; end: string }>>({});
  const recentDates = getRecentDates(RECENT_DAYS);

  // ── Monthly reports ──
  const [reports, setReports]               = useState<MonthlyReport[]>([]);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const [generatingReport, setGeneratingReport] = useState(false);

  // ── Load ──
  useEffect(() => { getWidgetSettings().then(s => setSettings(s)); }, []);
  useEffect(() => { loadClockouts().then(co => setClockoutInputs(co)); }, []);
  useEffect(() => {
    setExpandedShifts(s => new Set([...s, todayShiftDate]));
  }, [todayShiftDate]);
  useEffect(() => {
    loadWorkSessions().then(all => {
      setWorkSessions(all);
      const inputs: Record<string, { start: string; end: string }> = {};
      for (const [date, s] of Object.entries(all)) {
        inputs[date] = { start: s.startTime, end: s.endTime };
      }
      setSessionInputs(inputs);
    });
    loadMonthlyReports().then(setReports);
  }, []);

  // Auto-generate previous month report if not yet done and data exists
  useEffect(() => {
    const prevMonth = getPreviousMonth();
    const alreadyDone = reports.some(r => r.month === prevMonth);
    const hasData = Object.keys(workSessions).some(d => d.startsWith(prevMonth));
    if (!alreadyDone && hasData && !generatingReport) {
      handleGenerateReport(prevMonth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports.length, Object.keys(workSessions).length]);

  // ── Schedule helpers ──
  function updateDay(idx: number, patch: Partial<WidgetSettings['workSchedule'][number]>) {
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
    } finally {
      setSaving(false);
    }
  }

  // ── Work session helpers ──
  function getScheduledForDay(dateStr: string): { start: string; end: string } | null {
    const dayIdx = getDayIndex(dateStr);
    const day = settings.workSchedule[dayIdx];
    if (!day || day.off) return null;
    return { start: day.start, end: day.end };
  }

  function isDayOff(dateStr: string): boolean {
    const dayIdx = getDayIndex(dateStr);
    return settings.workSchedule[dayIdx]?.off ?? false;
  }

  const handleSessionBlur = useCallback(async (date: string) => {
    const input = sessionInputs[date];
    if (!input) return;
    const start = normalizeTime(input.start ?? '', '');
    const end   = normalizeTime(input.end   ?? '', '');

    if (!start && !end) {
      await deleteWorkSession(date);
      setWorkSessions(s => { const n = { ...s }; delete n[date]; return n; });
      return;
    }
    if (start && end) {
      const session: WorkSession = { date, startTime: start, endTime: end };
      await saveWorkSession(session);
      setWorkSessions(s => ({ ...s, [date]: session }));
      setSessionInputs(s => ({ ...s, [date]: { start, end } }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInputs]);

  // ── Report generation ──
  async function handleGenerateReport(month: string) {
    setGeneratingReport(true);
    try {
      const all    = await loadWorkSessions();
      const report = generateMonthlyReport(month, all);
      await saveMonthlyReport(report);
      setReports(prev => {
        const filtered = prev.filter(r => r.month !== month);
        return [report, ...filtered].sort((a, b) => b.month.localeCompare(a.month));
      });
    } finally {
      setGeneratingReport(false);
    }
  }

  // ── Pause helpers ──
  function getScheduledStart(shiftDate: string): string {
    const dayIdx = new Date(shiftDate + 'T12:00:00').getDay();
    const sched  = settings.workSchedule[dayIdx];
    return !sched || sched.off ? '' : sched.start;
  }

  function getScheduledEnd(shiftDate: string): string {
    const dayIdx = new Date(shiftDate + 'T12:00:00').getDay();
    const sched  = settings.workSchedule[dayIdx];
    return !sched || sched.off ? '' : sched.end;
  }

  async function handleClockoutBlur(shiftDate: string) {
    const raw = clockoutInputs[shiftDate]?.trim() ?? '';
    if (!raw) {
      await saveClockout(shiftDate, null);
      setClockoutInputs(c => { const n = { ...c }; delete n[shiftDate]; return n; });
      return;
    }
    const fallback   = getScheduledEnd(shiftDate) || '23:59';
    const normalized = normalizeTime(raw, fallback);
    setClockoutInputs(c => ({ ...c, [shiftDate]: normalized }));
    await saveClockout(shiftDate, normalized);
  }

  // ── Weekly grouping for Temps réalisé ──
  function groupByWeek(dates: string[]): { weekLabel: string; weekStart: string; dates: string[] }[] {
    const map = new Map<string, { weekLabel: string; weekStart: string; dates: string[] }>();
    for (const d of dates) {
      const day = new Date(d + 'T12:00:00');
      const dow = day.getDay();
      const mon = new Date(day);
      mon.setDate(day.getDate() - (dow === 0 ? 6 : dow - 1));
      const key = mon.toISOString().slice(0, 10);
      if (!map.has(key)) {
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const monLabel = mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const sunLabel = sun.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        map.set(key, { weekStart: key, weekLabel: `${monLabel} – ${sunLabel}`, dates: [] });
      }
      map.get(key)!.dates.push(d);
    }
    return Array.from(map.values());
  }

  const weekGroups = groupByWeek(recentDates);

  // Weekly total for display
  function weekTotalMins(dates: string[]): number {
    return dates.reduce((acc, d) => {
      const s = workSessions[d];
      return acc + (s ? calcSessionMinutes(s.startTime, s.endTime) : 0);
    }, 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const prevMonth = getPreviousMonth();
  const currMonth = getCurrentMonth();
  const prevReportExists = reports.some(r => r.month === prevMonth);
  const prevMonthHasData = Object.keys(workSessions).some(d => d.startsWith(prevMonth));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.headerBar, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Travail</Text>
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

        {/* ══════════════════════════════════════════════
            1. PLANNING HEBDOMADAIRE
        ══════════════════════════════════════════════ */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Planning hebdomadaire</Text>
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
              <Text style={[styles.notifHint, { color: colors.mutedForeground }]}>Notification les jours travaillés</Text>
            </View>
            <Switch
              value={settings.shiftNotif}
              onValueChange={v => setSettings(s => ({ ...s, shiftNotif: v }))}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        {/* ══════════════════════════════════════════════
            2. TEMPS RÉALISÉ — saisie heures réelles
        ══════════════════════════════════════════════ */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Temps réalisé</Text>
        <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
          Saisir les heures d'embauche et de débauche réelles. Sauvegarde automatique.
        </Text>

        {weekGroups.map(({ weekStart, weekLabel, dates }) => {
          const wTotal = weekTotalMins(dates);
          const wOver  = Math.max(0, wTotal - 35 * 60);
          return (
            <View key={weekStart} style={{ gap: 4 }}>
              {/* Week header */}
              <View style={styles.weekHeader}>
                <Text style={[styles.weekLabel, { color: colors.mutedForeground }]}>{weekLabel}</Text>
                {wTotal > 0 && (
                  <View style={styles.weekTotals}>
                    <Text style={[styles.weekTotal, { color: colors.foreground }]}>
                      {formatMinutes(wTotal)}
                    </Text>
                    {wOver > 0 && (
                      <View style={[styles.overtimeBadge, { backgroundColor: '#FF980022' }]}>
                        <Text style={[styles.overtimeTxt, { color: '#FF9800' }]}>+{formatMinutes(wOver)} sup.</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Day rows */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, padding: 0, overflow: 'hidden' }]}>
                {dates.map((date, di) => {
                  const sched   = getScheduledForDay(date);
                  const isOff   = isDayOff(date);
                  const session = workSessions[date];
                  const input   = sessionInputs[date] ?? { start: '', end: '' };
                  const workedMins = session
                    ? calcSessionMinutes(session.startTime, session.endTime)
                    : 0;
                  const nightMins = session
                    ? calcNightMinutes(session.startTime, session.endTime)
                    : 0;

                  return (
                    <View
                      key={date}
                      style={[
                        styles.sessionRow,
                        di > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                        isOff && { opacity: 0.5 },
                      ]}
                    >
                      {/* Date */}
                      <View style={styles.sessionDateCol}>
                        <Text style={[styles.sessionDate, { color: colors.foreground }]}>
                          {formatShortDate(date)}
                        </Text>
                        {isOff && !session && (
                          <Text style={[styles.sessionOffLabel, { color: colors.mutedForeground }]}>repos</Text>
                        )}
                      </View>

                      {/* Time inputs */}
                      <View style={styles.sessionInputs}>
                        <TextInput
                          value={input.start}
                          onChangeText={t => setSessionInputs(s => ({ ...s, [date]: { ...s[date] ?? { start: '', end: '' }, start: t } }))}
                          onBlur={() => handleSessionBlur(date)}
                          placeholder={sched?.start ?? '--:--'}
                          placeholderTextColor={colors.mutedForeground + '88'}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          style={[
                            styles.sessionInput,
                            {
                              color: colors.foreground,
                              borderColor: input.start ? colors.primary + '80' : colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />
                        <Text style={[styles.timeSep, { color: colors.mutedForeground }]}>→</Text>
                        <TextInput
                          value={input.end}
                          onChangeText={t => setSessionInputs(s => ({ ...s, [date]: { ...s[date] ?? { start: '', end: '' }, end: t } }))}
                          onBlur={() => handleSessionBlur(date)}
                          placeholder={sched?.end ?? '--:--'}
                          placeholderTextColor={colors.mutedForeground + '88'}
                          keyboardType="numbers-and-punctuation"
                          maxLength={5}
                          style={[
                            styles.sessionInput,
                            {
                              color: colors.foreground,
                              borderColor: input.end ? colors.primary + '80' : colors.border,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />
                      </View>

                      {/* Duration + night badge */}
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
                          <Text style={[styles.sessionDuration, { color: colors.mutedForeground }]}>—</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* ══════════════════════════════════════════════
            3. RAPPORTS MENSUELS
        ══════════════════════════════════════════════ */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Rapports mensuels</Text>

        {/* Génération mois précédent */}
        {!prevReportExists && prevMonthHasData && (
          <Pressable
            onPress={() => handleGenerateReport(prevMonth)}
            disabled={generatingReport}
            style={[styles.generateBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '55' }]}
          >
            <MaterialCommunityIcons name="file-chart-outline" size={18} color={colors.primary} />
            <Text style={[styles.generateTxt, { color: colors.primary }]}>
              {generatingReport ? 'Génération…' : `Générer le rapport de ${getPreviousMonthLabel()}`}
            </Text>
          </Pressable>
        )}

        {/* Génération mois courant (manuel) */}
        {Object.keys(workSessions).some(d => d.startsWith(currMonth)) && (
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
                {/* Report header */}
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

                {/* Summary pills */}
                <View style={[styles.reportPills, { borderTopColor: colors.border }]}>
                  <ReportPill
                    icon="clock-outline"
                    label="Total"
                    value={formatMinutes(report.totalMinutes)}
                    color={colors.primary}
                    colors={colors}
                  />
                  <ReportPill
                    icon="trending-up"
                    label="Heures sup."
                    value={report.overtimeMinutes > 0 ? `+${formatMinutes(report.overtimeMinutes)}` : '—'}
                    color="#FF9800"
                    colors={colors}
                  />
                  <ReportPill
                    icon="weather-night"
                    label="Nuit"
                    value={report.nightMinutes > 0 ? formatMinutes(report.nightMinutes) : '—'}
                    color="#7C4DFF"
                    colors={colors}
                  />
                </View>

                {/* Week breakdown */}
                {isExpanded && (
                  <View style={[styles.reportWeeks, { borderTopColor: colors.border }]}>
                    {report.weeks.map((w, wi) => (
                      <View
                        key={w.weekStart}
                        style={[
                          styles.weekBreakRow,
                          wi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.weekBreakLabel, { color: colors.foreground }]}>
                            Sem. du {new Date(w.weekStart + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </Text>
                          <Text style={[styles.weekBreakSub, { color: colors.mutedForeground }]}>
                            {w.days.length} jour{w.days.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        <View style={styles.weekBreakRight}>
                          <Text style={[styles.weekBreakTotal, { color: colors.foreground }]}>
                            {formatMinutes(w.totalMinutes)}
                          </Text>
                          {w.overtimeMinutes > 0 && (
                            <Text style={[styles.weekBreakOver, { color: '#FF9800' }]}>
                              +{formatMinutes(w.overtimeMinutes)}
                            </Text>
                          )}
                          {w.nightMinutes > 0 && (
                            <Text style={[styles.weekBreakNight, { color: '#7C4DFF' }]}>
                              🌙 {formatMinutes(w.nightMinutes)}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Regenerate */}
                {isExpanded && (
                  <Pressable
                    onPress={() => handleGenerateReport(report.month)}
                    disabled={generatingReport}
                    style={[styles.regenBtn, { borderTopColor: colors.border }]}
                  >
                    <MaterialCommunityIcons name="refresh" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.regenTxt, { color: colors.mutedForeground }]}>Recalculer</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        {/* ══════════════════════════════════════════════
            4. SUIVI DES PAUSES
        ══════════════════════════════════════════════ */}
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Suivi des pauses ☕</Text>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            activePause ? stopPause() : startPause();
          }}
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

        {/* Today pause card */}
        {(() => {
          const todaySessions  = sessions.filter(s => s.shiftDate === todayShiftDate);
          const activeSecs     = activePause ? Math.floor((Date.now() - activePause.startTs) / 1000) : 0;
          const totalSecs      = todaySessions.reduce((a, s) => a + s.durationSecs, 0) + activeSecs;
          const nbPauses       = todaySessions.length + (activePause ? 1 : 0);
          const win            = getShiftWindow(todayShiftDate, settings.workSchedule, clockoutInputs[todayShiftDate]);
          const schedEnd       = getScheduledEnd(todayShiftDate);
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 12 }]}>
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
                    style={[styles.clockoutInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                  <Text style={[styles.clockoutLabel, { color: colors.mutedForeground }]}>réel</Text>
                </View>
              </View>

              {nbPauses > 0 && (
                <Text style={[styles.shiftTotal, { color: colors.primary }]}>
                  ⏸ {formatDuration(totalSecs)} · {nbPauses} pause{nbPauses > 1 ? 's' : ''}
                </Text>
              )}

              {win && nbPauses > 0 && (() => {
                const total  = win.endTs - win.startTs;
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
                            left: `${pLeft}%`, width: `${pWidth}%`,
                            backgroundColor: colors.primary, opacity: b.active ? 0.6 : 1,
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

        {/* Pause history */}
        {(() => {
          const historyDates = Array.from(
            new Set(sessions.filter(s => s.shiftDate !== todayShiftDate).map(s => s.shiftDate))
          ).sort().reverse().slice(0, 20);
          if (historyDates.length === 0) return null;
          return (
            <>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>Historique pauses</Text>
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
                                        left: `${pL}%`, width: `${pW}%`, backgroundColor: colors.primary,
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
            style={[styles.resetBtn, { borderColor: '#F4433655' }]}
          >
            <Text style={[styles.resetTxt, { color: '#F44336' }]}>Effacer tout l'historique des pauses</Text>
          </Pressable>
        )}

      </ScrollView>
    </View>
  );
}

// ── Helper to get previous month label ───────────────────────────────────────
function getPreviousMonthLabel(): string {
  const prev = getPreviousMonth();
  const [yStr, mStr] = prev.split('-');
  const y = parseInt(yStr ?? '2000', 10);
  const m = parseInt(mStr ?? '1', 10);
  const lbl = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  return lbl.charAt(0).toUpperCase() + lbl.slice(1);
}

// ── ReportPill sub-component ─────────────────────────────────────────────────
function ReportPill({
  icon,
  label,
  value,
  color,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}) {
  return (
    <View style={[reportPillStyles.pill, { backgroundColor: color + '15', borderColor: color + '30' }]}>
      <MaterialCommunityIcons name={icon as any} size={14} color={color} />
      <View>
        <Text style={[reportPillStyles.pillLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[reportPillStyles.pillValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const reportPillStyles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  pillLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  pillValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:   { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  saveTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  section: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  sectionHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: -4, lineHeight: 16 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  emptyTxt: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center', paddingVertical: 8 },

  // Planning
  dayRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel:  { width: 74, fontSize: 13, fontFamily: 'Inter_500Medium' },
  timeGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeInput: { width: 58, height: 34, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_500Medium' },
  timeSep:   { fontSize: 13, fontFamily: 'Inter_400Regular' },
  reposTxt:  { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  reposToggle:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  reposToggleTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  notifRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  notifTitle: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  notifHint:  { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Temps réalisé
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 4 },
  weekLabel:  { fontSize: 11, fontFamily: 'Inter_500Medium' },
  weekTotals: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekTotal:  { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  overtimeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  overtimeTxt:   { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  sessionDateCol: { width: 90 },
  sessionDate:    { fontSize: 12, fontFamily: 'Inter_500Medium' },
  sessionOffLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  sessionInputs:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sessionInput: { flex: 1, height: 32, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_500Medium', paddingVertical: 0 },
  sessionStats: { width: 64, alignItems: 'flex-end', gap: 2 },
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
  weekBreakRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  weekBreakLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  weekBreakSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  weekBreakRight: { alignItems: 'flex-end', gap: 2 },
  weekBreakTotal: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekBreakOver:  { fontSize: 11, fontFamily: 'Inter_500Medium' },
  weekBreakNight: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  regenTxt: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Pauses
  pauseBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  pauseBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  pauseHint:   { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' },
  shiftHeader:    { gap: 6 },
  shiftDateLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  shiftHoursRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftHoursText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  clockoutInput:  { width: 58, height: 30, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_500Medium', paddingVertical: 0 },
  clockoutLabel:  { fontSize: 10, fontFamily: 'Inter_400Regular' },
  shiftTotal: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  timelineBar:    { height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative' },
  timelineBlock:  { position: 'absolute', top: 0, bottom: 0, borderRadius: 4 },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timelineLabelTxt: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  pauseList:    { gap: 6 },
  pauseListRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pauseListTime:     { fontSize: 13, fontFamily: 'Inter_400Regular' },
  pauseListDuration: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  separator:     { height: 1, marginVertical: 2 },
  historyRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  historyDateLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  historyMeta:   { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  historyDetail: { paddingBottom: 10, gap: 6 },
  resetBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  resetTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
