import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import {
  type MariePlanning,
  type Shift,
  SHIFT_TIMES,
  loadMariePlanning,
  saveMariePlanning,
  setMarieDay,
} from '@/utils/marieStorage';

// ── Helpers ────────────────────────────────────────────────────────────────

const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const FR_DAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function parseMonth(monthStr: string): { year: number; month: number } {
  const [y, m] = monthStr.split('-').map(Number);
  return { year: y, month: m };
}

function addMonths(monthStr: string, delta: number): string {
  let { year, month } = parseMonth(monthStr);
  month += delta;
  if (month > 12) { month -= 12; year++; }
  if (month < 1)  { month += 12; year--; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMinutes(shift: Shift): number {
  return shift === 'PB' ? 7 * 60 + 40 : 7 * 60 + 10;
}

function formatDateFR(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(year, month - 1, day);
  const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()];
  return `${dayName} ${day} ${FR_MONTHS[month - 1]} ${year}`;
}

// ── Import types ────────────────────────────────────────────────────────────

type RdvImportStatus = 'new' | 'date_conflict' | 'duplicate';
interface RdvImportItem {
  isoDate: string;
  title: string;
  status: RdvImportStatus;
  selected: boolean;
  conflictTitles: string[];
}

type PlanImportStatus = 'new' | 'conflict' | 'duplicate';

interface PlanImportItem {
  dateKey: string;
  shift: Shift;
  status: PlanImportStatus;
  currentShift: Shift | null;
  selected: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MarieScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;
  const { appointments, addAppointment } = useApp();

  const [monthStr, setMonthStr] = useState(currentMonthStr);
  const [planning, setPlanning] = useState<MariePlanning>({});

  // Planning import state
  const [importVisible, setImportVisible]   = useState(false);
  const [importStep, setImportStep]         = useState<'paste' | 'review'>('paste');
  const [importText, setImportText]         = useState('');
  const [importItems, setImportItems]       = useState<PlanImportItem[]>([]);

  // RDV import state
  const [rdvImportVisible, setRdvImportVisible] = useState(false);
  const [rdvImportStep, setRdvImportStep]       = useState<'paste' | 'review'>('paste');
  const [rdvImportText, setRdvImportText]       = useState('');
  const [rdvImportItems, setRdvImportItems]     = useState<RdvImportItem[]>([]);

  useEffect(() => {
    loadMariePlanning().then(setPlanning);
  }, []);

  const { year, month } = parseMonth(monthStr);
  const totalDays = daysInMonth(year, month);
  const firstDay  = firstDayOfWeek(year, month);

  const monthLabel = `${FR_MONTHS[month - 1]} ${year}`;

  const workingDays = Array.from({ length: totalDays }, (_, i) => toDateKey(year, month, i + 1))
    .filter(d => planning[d]);

  const pbCount  = workingDays.filter(d => planning[d] === 'PB').length;
  const pdCount  = workingDays.filter(d => planning[d] === 'PD').length;
  const totalMin = workingDays.reduce((s, d) => s + shiftMinutes(planning[d]!), 0);
  const totalH   = Math.floor(totalMin / 60);
  const totalM   = totalMin % 60;

  const handleToggle = useCallback(async (dateKey: string) => {
    const current = planning[dateKey];
    let next: Shift | null;
    if (!current)          next = 'PB';
    else if (current === 'PB') next = 'PD';
    else                   next = null;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await setMarieDay(dateKey, next);
    setPlanning({ ...updated });
  }, [planning]);

  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  // ── Import handlers ──────────────────────────────────────────────────────

  function closePlanImport() {
    setImportVisible(false);
    setImportStep('paste');
    setImportText('');
    setImportItems([]);
  }

  function parseAndReviewPlan() {
    const match = importText.trim().match(/PLANNING:(\{[\s\S]*\})/);
    if (!match) {
      Alert.alert(
        'Format non reconnu',
        'Le texte doit contenir "PLANNING:{...}". Vérifie que Marie a bien copié son planning.'
      );
      return;
    }
    let incoming: Record<string, string>;
    try {
      incoming = JSON.parse(match[1]);
    } catch {
      Alert.alert('Erreur de lecture', 'Impossible de lire les données. Vérifie que le texte n\'est pas tronqué.');
      return;
    }

    const validShifts: Shift[] = ['PB', 'PD'];
    const items: PlanImportItem[] = Object.entries(incoming)
      .filter(([, s]) => validShifts.includes(s as Shift))
      .map(([dateKey, shiftStr]) => {
        const shift = shiftStr as Shift;
        const currentShift = planning[dateKey] ?? null;
        let status: PlanImportStatus;
        if (!currentShift) {
          status = 'new';
        } else if (currentShift === shift) {
          status = 'duplicate';
        } else {
          status = 'conflict';
        }
        return { dateKey, shift, status, currentShift, selected: status !== 'duplicate' };
      })
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    if (items.length === 0) {
      Alert.alert('Aucun jour valide', 'Aucun jour avec PB ou PD trouvé dans les données.');
      return;
    }

    setImportItems(items);
    setImportStep('review');
  }

  function togglePlanItem(idx: number) {
    setImportItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, selected: !item.selected } : item
    ));
  }

  async function confirmPlanImport() {
    const toImport = importItems.filter(i => i.selected);
    if (toImport.length === 0) {
      Alert.alert('Aucun jour sélectionné', 'Sélectionne au moins un jour à importer.');
      return;
    }
    const merged: MariePlanning = { ...planning };
    toImport.forEach(item => { merged[item.dateKey] = item.shift; });
    await saveMariePlanning(merged);
    setPlanning(merged);
    closePlanImport();
  }

  const selectedCount = importItems.filter(i => i.selected).length;

  const PLAN_STATUS_LABELS: Record<PlanImportStatus, string> = {
    new: 'Nouveau',
    conflict: 'Conflit',
    duplicate: 'Doublon',
  };
  const PLAN_STATUS_COLORS: Record<PlanImportStatus, string> = {
    new: '#4CAF50',
    conflict: '#FF9800',
    duplicate: colors.mutedForeground,
  };

  // ── RDV import handlers ───────────────────────────────────────────────────

  function closeRdvImport() {
    setRdvImportVisible(false);
    setRdvImportStep('paste');
    setRdvImportText('');
    setRdvImportItems([]);
  }

  function parseRdvAndReview() {
    const match = rdvImportText.trim().match(/RDV:(\{[\s\S]*\})/);
    if (!match) {
      Alert.alert('Format non reconnu', 'Le texte doit contenir "RDV:{...}". Vérifie que Marie a bien copié ses données.');
      return;
    }
    let incoming: Record<string, string>;
    try { incoming = JSON.parse(match[1]); }
    catch { Alert.alert('Erreur de lecture', 'Impossible de lire les données.'); return; }

    const existingKeys = new Set(appointments.map(a => `${a.date.slice(0, 10)}|${a.title.toLowerCase().trim()}`));
    const existingByDate: Record<string, string[]> = {};
    appointments.forEach(a => {
      const d = a.date.slice(0, 10);
      if (!existingByDate[d]) existingByDate[d] = [];
      existingByDate[d].push(a.title);
    });

    const items: RdvImportItem[] = Object.entries(incoming)
      .filter(([, title]) => typeof title === 'string' && title.trim().length > 0)
      .map(([isoDate, title]) => {
        const t = title.trim();
        const dupKey = `${isoDate}|${t.toLowerCase()}`;
        let status: RdvImportStatus;
        let conflictTitles: string[] = [];
        if (existingKeys.has(dupKey)) { status = 'duplicate'; }
        else if (existingByDate[isoDate]) { status = 'date_conflict'; conflictTitles = existingByDate[isoDate]; }
        else { status = 'new'; }
        return { isoDate, title: t, status, selected: status !== 'duplicate', conflictTitles };
      });

    if (items.length === 0) { Alert.alert('Aucun RDV', 'Aucun rendez-vous trouvé.'); return; }
    setRdvImportItems(items);
    setRdvImportStep('review');
  }

  function toggleRdvItem(idx: number) {
    setRdvImportItems(prev => prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item));
  }

  function confirmRdvImport() {
    const toImport = rdvImportItems.filter(i => i.selected);
    if (toImport.length === 0) { Alert.alert('Aucun RDV sélectionné'); return; }
    toImport.forEach(item => {
      addAppointment({
        title: item.title,
        date: new Date(item.isoDate).toISOString(),
        description: '',
        location: '',
        time: '',
        category: '',
        fromMarie: true,
      });
    });
    closeRdvImport();
  }

  const rdvSelectedCount = rdvImportItems.filter(i => i.selected).length;
  const RDV_STATUS_LABELS: Record<RdvImportStatus, string> = { new: 'Nouveau', date_conflict: 'Conflit', duplicate: 'Doublon' };
  const RDV_STATUS_COLORS: Record<RdvImportStatus, string> = { new: '#4CAF50', date_conflict: '#FF9800', duplicate: colors.mutedForeground };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      <SubPageHeader
        title="Marie"
        subtitle="Planning mensuel"
        right={
          <View style={styles.headerBtns}>
            <Pressable
              onPress={() => setRdvImportVisible(true)}
              hitSlop={8}
              style={[styles.importBtn, { backgroundColor: '#EC489920', borderColor: '#EC489955' }]}
            >
              <MaterialCommunityIcons name="calendar-arrow-left" size={16} color="#EC4899" />
            </Pressable>
            <Pressable
              onPress={() => setImportVisible(true)}
              hitSlop={8}
              style={[styles.importBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="calendar-import" size={16} color={colors.primary} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Month navigation ── */}
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={() => setMonthStr(m => addMonths(m, -1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
          <Pressable onPress={() => setMonthStr(m => addMonths(m, 1))} hitSlop={12} style={styles.monthArrow}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Stats row ── */}
        {workingDays.length > 0 && (
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: SHIFT_TIMES.PB.color + '20' }]}>
              <Text style={[styles.statChipTxt, { color: SHIFT_TIMES.PB.color }]}>{pbCount} PB</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: SHIFT_TIMES.PD.color + '20' }]}>
              <Text style={[styles.statChipTxt, { color: SHIFT_TIMES.PD.color }]}>{pdCount} PD</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: colors.card }]}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.statChipTxt, { color: colors.mutedForeground }]}>
                {totalH}h{totalM > 0 ? String(totalM).padStart(2, '0') : ''}
              </Text>
            </View>
          </View>
        )}

        {/* ── Calendar grid ── */}
        <View style={[styles.calCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calHeaderRow}>
            {FR_DAYS_SHORT.map((d, i) => (
              <Text key={i} style={[styles.calHeaderCell, { color: i >= 5 ? '#FF9800' : colors.mutedForeground }]}>{d}</Text>
            ))}
          </View>

          {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
            <View key={row} style={styles.calRow}>
              {calendarCells.slice(row * 7, row * 7 + 7).map((dayNum, col) => {
                if (dayNum === null) {
                  return <View key={col} style={styles.calCell} />;
                }
                const dateKey = toDateKey(year, month, dayNum);
                const shift   = planning[dateKey];
                const isToday = dateKey === toDateKey(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1,
                  new Date().getDate(),
                );
                const bgColor = shift
                  ? SHIFT_TIMES[shift].color
                  : isToday
                    ? colors.primary + '30'
                    : 'transparent';
                const textColor = shift
                  ? '#fff'
                  : isToday
                    ? colors.primary
                    : colors.foreground;

                return (
                  <Pressable
                    key={col}
                    onPress={() => handleToggle(dateKey)}
                    style={({ pressed }) => [
                      styles.calCell,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View style={[
                      styles.calDayCircle,
                      { backgroundColor: bgColor },
                      isToday && !shift && { borderWidth: 1.5, borderColor: colors.primary },
                    ]}>
                      <Text style={[styles.calDayNum, { color: textColor }]}>{dayNum}</Text>
                    </View>
                    {shift && (
                      <Text style={[styles.calDayShift, { color: SHIFT_TIMES[shift].color }]}>
                        {shift}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={[styles.calLegend, { borderTopColor: colors.border }]}>
            <Text style={[styles.calLegendHint, { color: colors.mutedForeground }]}>
              Appuyer pour : vide → PB → PD → vide
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Import planning modal ── */}
      <Modal
        visible={importVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePlanImport}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={importStep === 'review' ? () => setImportStep('paste') : closePlanImport} hitSlop={12}>
              <MaterialCommunityIcons
                name={importStep === 'review' ? 'arrow-left' : 'close'}
                size={22}
                color={colors.foreground}
              />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {importStep === 'paste' ? 'Importer le planning' : 'Vérifier le planning'}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {/* ── Step 1: Paste ── */}
          {importStep === 'paste' && (
            <View style={styles.pasteStep}>
              <Text style={[styles.pasteHint, { color: colors.mutedForeground }]}>
                Demande à Marie de copier son planning depuis son appli, puis colle le texte ici :
              </Text>
              <TextInput
                style={[styles.pasteInput, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                }]}
                multiline
                numberOfLines={8}
                placeholder={'PLANNING:{"2026-06-17":"PB","2026-06-18":"PD", ...}'}
                placeholderTextColor={colors.mutedForeground}
                value={importText}
                onChangeText={setImportText}
                autoCorrect={false}
                autoCapitalize="none"
                textAlignVertical="top"
              />
              <Pressable
                onPress={parseAndReviewPlan}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: importText.trim().length < 5 ? 0.5 : 1 }]}
                disabled={importText.trim().length < 5}
              >
                <MaterialCommunityIcons name="magnify" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>Analyser</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Review ── */}
          {importStep === 'review' && (
            <View style={styles.reviewStep}>
              <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>
                {importItems.length} jour{importItems.length > 1 ? 's' : ''} trouvé{importItems.length > 1 ? 's' : ''} · {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </Text>
              <ScrollView style={styles.reviewList} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                {importItems.map((item, idx) => {
                  const statusColor = PLAN_STATUS_COLORS[item.status];
                  const isDup = item.status === 'duplicate';
                  const shiftInfo = SHIFT_TIMES[item.shift];
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => !isDup && togglePlanItem(idx)}
                      style={[
                        styles.reviewItem,
                        {
                          backgroundColor: colors.card,
                          borderColor: item.selected ? statusColor + '60' : colors.border,
                          borderLeftColor: statusColor,
                          opacity: isDup ? 0.55 : 1,
                        },
                      ]}
                    >
                      <View style={styles.reviewItemLeft}>
                        <View style={styles.reviewItemTopRow}>
                          <View style={[styles.reviewStatusBadge, { backgroundColor: statusColor + '22' }]}>
                            <Text style={[styles.reviewStatusLabel, { color: statusColor }]}>
                              {PLAN_STATUS_LABELS[item.status]}
                            </Text>
                          </View>
                          <View style={[styles.shiftBadge, { backgroundColor: shiftInfo.color + '22' }]}>
                            <Text style={[styles.shiftBadgeTxt, { color: shiftInfo.color }]}>{item.shift}</Text>
                          </View>
                        </View>
                        <Text style={[styles.reviewItemDate, { color: colors.foreground }]}>
                          {formatDateFR(item.dateKey)}
                        </Text>
                        <Text style={[styles.reviewItemSub, { color: colors.mutedForeground }]}>
                          {shiftInfo.start} – {shiftInfo.end}
                        </Text>
                        {item.status === 'conflict' && item.currentShift && (
                          <Text style={[styles.reviewConflictNote, { color: '#FF9800' }]}>
                            ⚠ Actuellement : {item.currentShift} ({SHIFT_TIMES[item.currentShift].start} – {SHIFT_TIMES[item.currentShift].end})
                          </Text>
                        )}
                        {item.status === 'duplicate' && (
                          <Text style={[styles.reviewConflictNote, { color: colors.mutedForeground }]}>
                            Déjà présent dans le planning
                          </Text>
                        )}
                      </View>
                      {!isDup && (
                        <MaterialCommunityIcons
                          name={item.selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                          size={24}
                          color={item.selected ? statusColor : colors.mutedForeground}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={confirmPlanImport}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: selectedCount === 0 ? 0.4 : 1 }]}
                disabled={selectedCount === 0}
              >
                <MaterialCommunityIcons name="calendar-check" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>
                  Importer {selectedCount} jour{selectedCount > 1 ? 's' : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Import RDV Modal ── */}
      <Modal
        visible={rdvImportVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeRdvImport}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={rdvImportStep === 'review' ? () => setRdvImportStep('paste') : closeRdvImport} hitSlop={12}>
              <MaterialCommunityIcons
                name={rdvImportStep === 'review' ? 'arrow-left' : 'close'}
                size={22}
                color={colors.foreground}
              />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {rdvImportStep === 'paste' ? 'Importer RDVs Marie' : 'Vérifier les RDVs'}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {rdvImportStep === 'paste' && (
            <View style={styles.pasteStep}>
              <Text style={[styles.pasteHint, { color: colors.mutedForeground }]}>
                Demande à Marie de partager ses rendez-vous (format RDV:&#123;...&#125;) puis colle le texte ici :
              </Text>
              <TextInput
                style={[styles.pasteInput, {
                  backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground,
                }]}
                multiline
                numberOfLines={8}
                placeholder={'RDV:{"2026-07-10":"Médecin","2026-07-15":"Dentiste"}'}
                placeholderTextColor={colors.mutedForeground}
                value={rdvImportText}
                onChangeText={setRdvImportText}
                autoCorrect={false}
                autoCapitalize="none"
                textAlignVertical="top"
              />
              <Pressable
                onPress={parseRdvAndReview}
                style={[styles.primaryBtn, { backgroundColor: '#EC4899', opacity: rdvImportText.trim().length < 5 ? 0.5 : 1 }]}
                disabled={rdvImportText.trim().length < 5}
              >
                <MaterialCommunityIcons name="magnify" size={18} color="#fff" />
                <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>Analyser</Text>
              </Pressable>
            </View>
          )}

          {rdvImportStep === 'review' && (
            <View style={styles.reviewStep}>
              <Text style={[styles.reviewCount, { color: colors.mutedForeground }]}>
                {rdvImportItems.length} RDV trouvé{rdvImportItems.length > 1 ? 's' : ''} · {rdvSelectedCount} sélectionné{rdvSelectedCount > 1 ? 's' : ''}
              </Text>
              <ScrollView style={styles.reviewList} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                {rdvImportItems.map((item, idx) => {
                  const statusColor = RDV_STATUS_COLORS[item.status];
                  const isDup = item.status === 'duplicate';
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => !isDup && toggleRdvItem(idx)}
                      style={[styles.reviewItem, {
                        backgroundColor: colors.card,
                        borderColor: item.selected ? statusColor + '60' : colors.border,
                        borderLeftColor: statusColor,
                        opacity: isDup ? 0.55 : 1,
                      }]}
                    >
                      <View style={styles.reviewItemLeft}>
                        <View style={[styles.reviewStatusBadge, { backgroundColor: statusColor + '22' }]}>
                          <Text style={[styles.reviewStatusLabel, { color: statusColor }]}>
                            {RDV_STATUS_LABELS[item.status]}
                          </Text>
                        </View>
                        <Text style={[styles.reviewItemDate, { color: colors.foreground }]}>
                          {formatDateFR(item.isoDate)}
                        </Text>
                        <Text style={[styles.reviewItemTitle, { color: colors.foreground }]}>{item.title}</Text>
                        {item.status === 'date_conflict' && item.conflictTitles.length > 0 && (
                          <Text style={[styles.reviewConflictNote, { color: '#FF9800' }]}>
                            ⚠ Ce jour a déjà : {item.conflictTitles.join(', ')}
                          </Text>
                        )}
                        {isDup && (
                          <Text style={[styles.reviewConflictNote, { color: colors.mutedForeground }]}>Déjà présent</Text>
                        )}
                      </View>
                      {!isDup && (
                        <MaterialCommunityIcons
                          name={item.selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                          size={24}
                          color={item.selected ? statusColor : colors.mutedForeground}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={confirmRdvImport}
                style={[styles.primaryBtn, { backgroundColor: '#EC4899', opacity: rdvSelectedCount === 0 ? 0.4 : 1 }]}
                disabled={rdvSelectedCount === 0}
              >
                <MaterialCommunityIcons name="calendar-check" size={18} color="#fff" />
                <Text style={[styles.primaryBtnLabel, { color: '#fff' }]}>
                  Importer {rdvSelectedCount} RDV{rdvSelectedCount > 1 ? 's' : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  headerSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  headerBtns: { flexDirection: 'row', gap: 6 },
  importBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  monthArrow: { padding: 4 },
  monthLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statChipTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  calCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 20,
    padding: 12,
  },
  calHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  calHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    paddingBottom: 4,
  },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  calCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  calDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayNum: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  calDayShift: { fontSize: 8, fontFamily: 'Inter_700Bold', marginTop: 1 },
  calLegend: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 8,
    alignItems: 'center',
  },
  calLegendHint: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  shiftBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  shiftBadgeTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  dayTimes: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },

  /* ── Import modal ── */
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },

  pasteStep: { flex: 1, padding: 16, gap: 16 },
  pasteHint: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  pasteInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    minHeight: 160,
    lineHeight: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  reviewStep: { flex: 1, padding: 16, gap: 12 },
  reviewCount: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  reviewList: { flex: 1 },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  reviewItemLeft: { flex: 1, gap: 3 },
  reviewItemTopRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 2 },
  reviewStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  reviewStatusLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  reviewItemDate: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  reviewItemSub:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  reviewItemTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 2 },
  reviewConflictNote: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
