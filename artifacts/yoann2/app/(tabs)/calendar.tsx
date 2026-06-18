import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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
import type { Appointment, Priority, Task } from '@/types';

const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#F44336',
  critical: '#9C27B0',
};

const APPOINTMENT_COLOR = '#7C3AED';
const MARIE_APPT_COLOR  = '#EC4899';

function apptColor(a: Appointment): string {
  return a.fromMarie ? MARIE_APPT_COLOR : APPOINTMENT_COLOR;
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function getDaysInMonth(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  const startDay = (first.getDay() + 6) % 7;
  for (let i = 0; i < startDay; i++) {
    days.push(new Date(year, month, -startDay + i + 1));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - last.getDate() - startDay + 1));
  }
  return days;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function appointmentDateKey(a: Appointment) {
  const d = new Date(a.date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateFR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()];
  return `${dayName} ${day} ${MONTHS_FR[month - 1]} ${year}`;
}

type ImportStatus = 'new' | 'date_conflict' | 'duplicate';

interface ImportItem {
  isoDate: string;
  title: string;
  status: ImportStatus;
  selected: boolean;
  conflictTitles: string[];
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, projects, appointments, addAppointment, deleteAppointment } = useApp();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [importVisible, setImportVisible] = useState(false);
  const [importStep, setImportStep] = useState<'paste' | 'review'>('paste');
  const [importText, setImportText] = useState('');
  const [importItems, setImportItems] = useState<ImportItem[]>([]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      const key = dateKey(new Date(t.dueDate));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(a => {
      const key = appointmentDateKey(a);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [appointments]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];
  const selectedAppointments = selectedDate ? (appointmentsByDate[selectedDate] ?? []) : [];

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  function closeImport() {
    setImportVisible(false);
    setImportStep('paste');
    setImportText('');
    setImportItems([]);
  }

  function parseAndReview() {
    const trimmed = importText.trim();
    const match = trimmed.match(/RDV:(\{[\s\S]*\})/);
    if (!match) {
      Alert.alert(
        'Format non reconnu',
        'Le texte doit contenir "RDV:{...}" avec les rendez-vous. Vérifie que Marie a bien copié ses données.'
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

    const existingDateTitleKeys = new Set(
      appointments.map(a => `${a.date.slice(0, 10)}|${a.title.toLowerCase().trim()}`)
    );
    const existingByDate: Record<string, string[]> = {};
    appointments.forEach(a => {
      const d = a.date.slice(0, 10);
      if (!existingByDate[d]) existingByDate[d] = [];
      existingByDate[d].push(a.title);
    });

    const items: ImportItem[] = Object.entries(incoming)
      .filter(([, title]) => typeof title === 'string' && title.trim().length > 0)
      .map(([isoDate, title]) => {
        const titleTrimmed = title.trim();
        const dupKey = `${isoDate}|${titleTrimmed.toLowerCase()}`;
        let status: ImportStatus;
        let conflictTitles: string[] = [];

        if (existingDateTitleKeys.has(dupKey)) {
          status = 'duplicate';
        } else if (existingByDate[isoDate]) {
          status = 'date_conflict';
          conflictTitles = existingByDate[isoDate];
        } else {
          status = 'new';
        }
        return { isoDate, title: titleTrimmed, status, selected: status !== 'duplicate', conflictTitles };
      });

    if (items.length === 0) {
      Alert.alert('Aucun RDV', 'Aucun rendez-vous trouvé dans les données.');
      return;
    }

    setImportItems(items);
    setImportStep('review');
  }

  function toggleItem(idx: number) {
    setImportItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, selected: !item.selected } : item
    ));
  }

  function confirmImport() {
    const toImport = importItems.filter(i => i.selected);
    if (toImport.length === 0) {
      Alert.alert('Aucun RDV sélectionné', 'Sélectionne au moins un rendez-vous à importer.');
      return;
    }
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
    closeImport();
  }

  const selectedCount = importItems.filter(i => i.selected).length;

  const STATUS_LABELS: Record<ImportStatus, string> = {
    new: 'Nouveau',
    date_conflict: 'Conflit',
    duplicate: 'Doublon',
  };
  const STATUS_COLORS: Record<ImportStatus, string> = {
    new: '#4CAF50',
    date_conflict: '#FF9800',
    duplicate: colors.mutedForeground,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Calendrier</Text>
          <View style={styles.titleBtns}>
            <Pressable
              onPress={() => setImportVisible(true)}
              style={[styles.addBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="calendar-import" size={17} color={colors.primary} />
              <Text style={[styles.addBtnLabel, { color: colors.primary }]}>Marie</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/appointment/new')}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialCommunityIcons name="calendar-plus" size={18} color={colors.primaryForeground} />
              <Text style={[styles.addBtnLabel, { color: colors.primaryForeground }]}>RDV</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.navRow}>
          <Pressable onPress={prevMonth} style={[styles.navBtn, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {MONTHS_FR[month]} {year}
          </Text>
          <Pressable onPress={nextMonth} style={[styles.navBtn, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.dayHeaders}>
          {DAYS_FR.map(d => (
            <Text key={d} style={[styles.dayHeader, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.grid, { paddingHorizontal: 12 }]}>
          {days.map((d, i) => {
            const key = dateKey(d);
            const dayTasks = tasksByDate[key] ?? [];
            const dayAppts = appointmentsByDate[key] ?? [];
            const isCurrentMonth = d.getMonth() === month;
            const isSelected = selectedDate === key;
            const todayFlag = isToday(d);

            const topPriority = dayTasks.reduce<Priority | null>((best, t) => {
              const order: Priority[] = ['critical', 'high', 'medium', 'low'];
              if (!best) return t.priority;
              return order.indexOf(t.priority) < order.indexOf(best) ? t.priority : best;
            }, null);

            return (
              <Pressable
                key={i}
                onPress={() => setSelectedDate(isSelected ? null : key)}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: colors.primary + '25', borderColor: colors.primary },
                  !isSelected && todayFlag && { borderColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    { color: isCurrentMonth ? colors.foreground : colors.border },
                    todayFlag && { color: colors.primary, fontFamily: 'Inter_700Bold' },
                  ]}
                >
                  {d.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {dayTasks.slice(0, 2).map((t, j) => (
                    <View key={j} style={[styles.dot, { backgroundColor: PRIORITY_COLORS[t.priority] }]} />
                  ))}
                  {dayAppts.slice(0, 2).map((a, j) => (
                    <View key={`a${j}`} style={[styles.dot, { backgroundColor: apptColor(a) }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {(selectedTasks.length > 0 || selectedAppointments.length > 0) && (
          <View style={[styles.dayDetail, { paddingHorizontal: 16 }]}>
            {selectedAppointments.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={15} color={APPOINTMENT_COLOR} />
                  {'  '}Rendez-vous ({selectedAppointments.length})
                </Text>
                {selectedAppointments.map(a => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/appointment/${a.id}`)}
                    style={[styles.apptItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: apptColor(a) }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      {a.fromMarie && (
                        <Text style={[styles.apptDetail, { color: MARIE_APPT_COLOR, marginBottom: 2 }]}>
                          <MaterialCommunityIcons name="heart-outline" size={11} /> Marie
                        </Text>
                      )}
                      <View style={styles.apptMeta}>
                        {a.time ? (
                          <Text style={[styles.apptDetail, { color: apptColor(a) }]}>
                            <MaterialCommunityIcons name="clock-outline" size={12} /> {a.time}
                          </Text>
                        ) : null}
                        {a.location ? (
                          <Text style={[styles.apptDetail, { color: colors.mutedForeground }]} numberOfLines={1}>
                            <MaterialCommunityIcons name="map-marker-outline" size={12} /> {a.location}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </>
            )}

            {selectedTasks.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: selectedAppointments.length > 0 ? 12 : 0 }]}>
                  Tâches ({selectedTasks.length})
                </Text>
                {selectedTasks.map(t => {
                  const proj = projects.find(p => p.id === t.projectId);
                  const pColor = PRIORITY_COLORS[t.priority];
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => router.push(`/task/${t.id}`)}
                      style={[styles.taskItem, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: pColor }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>
                          {t.title}
                        </Text>
                        {proj && (
                          <Text style={[styles.taskProj, { color: colors.primary }]}>{proj.name}</Text>
                        )}
                      </View>
                      <MaterialCommunityIcons
                        name={t.status === 'done' ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={t.status === 'done' ? '#4CAF50' : colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}
              </>
            )}
          </View>
        )}

        <View style={[styles.legend, { paddingHorizontal: 16, marginTop: 16 }]}>
          <Text style={[styles.legendTitle, { color: colors.mutedForeground }]}>Légende :</Text>
          <View style={styles.legendRow}>
            {(Object.entries(PRIORITY_COLORS) as [Priority, string][]).map(([p, c]) => (
              <View key={p} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c }]} />
                <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                  {{ low: 'Basse', medium: 'Moy.', high: 'Haute', critical: 'Crit.' }[p]}
                </Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: APPOINTMENT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>RDV</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: MARIE_APPT_COLOR }]} />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>RDV Marie</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Import Marie Modal ── */}
      <Modal
        visible={importVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeImport}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={importStep === 'review' ? () => setImportStep('paste') : closeImport} hitSlop={12}>
              <MaterialCommunityIcons
                name={importStep === 'review' ? 'arrow-left' : 'close'}
                size={22}
                color={colors.foreground}
              />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {importStep === 'paste' ? 'Importer les RDV de Marie' : 'Vérifier les rendez-vous'}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {/* ── Step 1: Paste ── */}
          {importStep === 'paste' && (
            <View style={styles.pasteStep}>
              <Text style={[styles.pasteHint, { color: colors.mutedForeground }]}>
                Demande à Marie de copier ses rendez-vous depuis son appli, puis colle le texte ici :
              </Text>
              <TextInput
                style={[styles.pasteInput, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                }]}
                multiline
                numberOfLines={8}
                placeholder={'RDV:{"2026-06-19": "Dentiste Anna", ...}'}
                placeholderTextColor={colors.mutedForeground}
                value={importText}
                onChangeText={setImportText}
                autoCorrect={false}
                autoCapitalize="none"
                textAlignVertical="top"
              />
              <Pressable
                onPress={parseAndReview}
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
                {importItems.length} rendez-vous trouvé{importItems.length > 1 ? 's' : ''} · {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </Text>
              <ScrollView style={styles.reviewList} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                {importItems.map((item, idx) => {
                  const statusColor = STATUS_COLORS[item.status];
                  const isDup = item.status === 'duplicate';
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => !isDup && toggleItem(idx)}
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
                        <View style={[styles.reviewStatusBadge, { backgroundColor: statusColor + '22' }]}>
                          <Text style={[styles.reviewStatusLabel, { color: statusColor }]}>
                            {STATUS_LABELS[item.status]}
                          </Text>
                        </View>
                        <Text style={[styles.reviewItemDate, { color: colors.mutedForeground }]}>
                          {formatDateFR(item.isoDate)}
                        </Text>
                        <Text style={[styles.reviewItemTitle, { color: colors.foreground }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        {item.status === 'date_conflict' && item.conflictTitles.length > 0 && (
                          <Text style={[styles.reviewConflictNote, { color: '#FF9800' }]}>
                            ⚠ Tu as déjà : {item.conflictTitles.join(', ')}
                          </Text>
                        )}
                        {item.status === 'duplicate' && (
                          <Text style={[styles.reviewConflictNote, { color: colors.mutedForeground }]}>
                            Déjà présent dans ton calendrier
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
                onPress={confirmImport}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: selectedCount === 0 ? 0.4 : 1 }]}
                disabled={selectedCount === 0}
              >
                <MaterialCommunityIcons name="calendar-check" size={18} color={colors.primaryForeground} />
                <Text style={[styles.primaryBtnLabel, { color: colors.primaryForeground }]}>
                  Importer {selectedCount} RDV{selectedCount > 1 ? '' : ''}
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
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  dayHeaders: {
    flexDirection: 'row',
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    paddingBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  dayCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 2,
  },
  dayNum: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dayDetail: {
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  apptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  apptTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  apptMeta: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  apptDetail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  taskTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  taskProj: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  legend: {
    gap: 6,
  },
  legendTitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },

  /* ── Import modal ── */
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },

  /* Step 1 - Paste */
  pasteStep: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  pasteHint: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
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
  primaryBtnLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },

  /* Step 2 - Review */
  reviewStep: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  reviewCount: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  reviewList: {
    flex: 1,
  },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  reviewItemLeft: {
    flex: 1,
    gap: 3,
  },
  reviewStatusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    marginBottom: 2,
  },
  reviewStatusLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  reviewItemDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  reviewItemTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  reviewConflictNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});
