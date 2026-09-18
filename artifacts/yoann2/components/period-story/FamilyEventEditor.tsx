import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import type { FamilyEvent } from '@/types/periodStory';
import type { Trip } from '@/types/trips';
import { eventMatchesTrip, parseLocalDate } from '@/utils/periodStoryDraft';

type Props = {
  event: FamilyEvent;
  isNew: boolean;
  trips: Trip[];
  onSave: (event: FamilyEvent) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 30;

function copyEvent(event: FamilyEvent): FamilyEvent {
  return {
    ...event,
    includedTripIds: [...event.includedTripIds],
    excludedTripIds: [...event.excludedTripIds],
  };
}

function dateKeyForTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  try {
    const parsed = parseLocalDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return null;
    const normalized = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    return normalized !== value ? null : parsed;
  } catch {
    return null;
  }
}

function hasRenderableRoute(trip: Trip): boolean {
  const points = trip.route ?? [];
  return points.length >= 2 && points.every(point =>
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) < 85 &&
    Math.abs(point.lng) <= 180,
  );
}

function tripIsRenderable(trip: Trip): boolean {
  return trip.vehicle !== 'ignored' && hasRenderableRoute(trip);
}

function displayTripDate(trip: Trip): string {
  const date = new Date(trip.startTime);
  const datePart = dateKeyForTime(trip.startTime).split('-').reverse().join('/');
  const timePart = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const end = new Date(trip.endTime);
  const endPart = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${datePart} · ${timePart}–${endPart}`;
}

function tripSearchText(trip: Trip): string {
  return [
    dateKeyForTime(trip.startTime),
    trip.startAddress,
    trip.endAddress,
    trip.note,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function dateError(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) return 'Utilisez des dates valides au format AAAA-MM-JJ.';
  if (end.getTime() < start.getTime()) return 'La fin doit être le même jour ou après le début.';
  return '';
}

/** Full-screen editor for one event; trip edits only affect the event overrides. */
export function FamilyEventEditor({
  event,
  isNew,
  trips,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<FamilyEvent>(() => copyEvent(event));
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const [search, setSearch] = useState('');
  const [candidateLimit, setCandidateLimit] = useState(PAGE_SIZE);
  const [otherLimit, setOtherLimit] = useState(PAGE_SIZE);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [retryDelete, setRetryDelete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const operationRef = useRef<'save' | 'delete' | null>(null);

  const rangeError = dateError(draft.startDate, draft.endDate);
  const rangeIsValid = !rangeError;
  const startDate = parseDate(draft.startDate);
  const endDate = parseDate(draft.endDate);
  const busy = isSaving || isDeleting;

  const candidateTrips = useMemo(() => {
    const included = new Set(draft.includedTripIds);
    return trips
      .filter(trip => (
        included.has(trip.id) ||
        (rangeIsValid &&
          dateKeyForTime(trip.startTime) >= draft.startDate &&
          dateKeyForTime(trip.startTime) <= draft.endDate)
      ))
      .sort((a, b) => a.startTime - b.startTime);
  }, [draft.endDate, draft.includedTripIds, draft.startDate, rangeIsValid, trips]);

  const candidateIds = useMemo(
    () => new Set(candidateTrips.map(trip => trip.id)),
    [candidateTrips],
  );

  const otherTrips = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return [];
    return trips
      .filter(trip => !candidateIds.has(trip.id) && tripSearchText(trip).includes(query))
      .sort((a, b) => a.startTime - b.startTime);
  }, [candidateIds, search, trips]);

  function isAutomatic(trip: Trip): boolean {
    return rangeIsValid &&
      dateKeyForTime(trip.startTime) >= draft.startDate &&
      dateKeyForTime(trip.startTime) <= draft.endDate;
  }

  function isSelected(trip: Trip): boolean {
    if (!rangeIsValid) return draft.includedTripIds.includes(trip.id);
    return eventMatchesTrip(draft, trip);
  }

  function setDate(kind: 'start' | 'end', value: string) {
    setDraft(previous => ({ ...previous, [kind === 'start' ? 'startDate' : 'endDate']: value }));
    setCandidateLimit(PAGE_SIZE);
    setError('');
  }

  function toggleTrip(trip: Trip) {
    if (busy || !tripIsRenderable(trip)) return;
    const automatic = isAutomatic(trip);
    const selected = isSelected(trip);
    const nextSelected = !selected;
    setDraft(previous => {
      const included = new Set(previous.includedTripIds);
      const excluded = new Set(previous.excludedTripIds);
      included.delete(trip.id);
      excluded.delete(trip.id);
      if (nextSelected !== automatic) {
        (nextSelected ? included : excluded).add(trip.id);
      }
      return {
        ...previous,
        includedTripIds: [...included],
        excludedTripIds: [...excluded],
      };
    });
  }

  function resetSelection() {
    if (busy) return;
    setDraft(previous => ({ ...previous, includedTripIds: [], excludedTripIds: [] }));
    setCandidateLimit(PAGE_SIZE);
    setOtherLimit(PAGE_SIZE);
  }

  async function save() {
    if (busy || operationRef.current) return;
    const title = draft.title.trim();
    if (!title) {
      setError('Ajoutez un titre à cet événement.');
      return;
    }
    if (rangeError) {
      setError(rangeError);
      return;
    }
    operationRef.current = 'save';
    setIsSaving(true);
    setRetryDelete(false);
    setError('');
    try {
      await onSave({
        ...draft,
        title,
        includedTripIds: [...new Set(draft.includedTripIds)],
        excludedTripIds: [...new Set(draft.excludedTripIds)],
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer cet événement.');
    } finally {
      operationRef.current = null;
      setIsSaving(false);
    }
  }

  async function remove() {
    if (busy || operationRef.current) return;
    operationRef.current = 'delete';
    setIsDeleting(true);
    setRetryDelete(true);
    setError('');
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de supprimer cet événement.');
    } finally {
      operationRef.current = null;
      setIsDeleting(false);
    }
  }

  function renderDateField(kind: 'start' | 'end') {
    const value = kind === 'start' ? draft.startDate : draft.endDate;
    const testID = kind === 'start' ? 'event-start-date' : 'event-end-date';
    if (Platform.OS === 'web') {
      return (
        <TextInput
          testID={testID}
          value={value}
          onChangeText={next => setDate(kind, next)}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="numbers-and-punctuation"
          editable={!busy}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
        />
      );
    }
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={kind === 'start' ? 'Date de début' : 'Date de fin'}
        disabled={busy}
        onPress={() => setPicker(kind)}
        style={[styles.dateButton, { backgroundColor: colors.input, borderColor: colors.border }]}
      >
        <Text style={[styles.dateValue, { color: colors.foreground }]}>{value}</Text>
      </Pressable>
    );
  }

  function renderTrip(trip: Trip) {
    const renderable = tripIsRenderable(trip);
    const selected = isSelected(trip);
    const reason = trip.vehicle === 'ignored'
      ? 'Trajet ignoré'
      : 'Itinéraire indisponible (2 points GPS minimum)';
    const address = trip.startAddress || trip.endAddress
      ? `${trip.startAddress || 'Départ non renseigné'} → ${trip.endAddress || 'Arrivée non renseignée'}`
      : '';
    const photoCount = trip.photos?.length ?? 0;
    return (
      <Pressable
        key={trip.id}
        testID={`event-trip-${trip.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: !renderable || busy }}
        disabled={!renderable || busy}
        onPress={() => toggleTrip(trip)}
        style={({ pressed }) => [
          styles.tripRow,
          { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border },
          pressed && styles.pressed,
          !renderable && styles.disabledRow,
        ]}
      >
        <View style={[styles.checkbox, { borderColor: selected ? colors.primary : colors.mutedForeground, backgroundColor: selected ? colors.primary : 'transparent' }]}>
          {selected && <Text style={[styles.check, { color: colors.primaryForeground }]}>✓</Text>}
        </View>
        <View style={styles.tripDetails}>
          <Text style={[styles.tripDate, { color: colors.foreground }]}>{displayTripDate(trip)}</Text>
          {!!address && <Text style={[styles.tripMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{address}</Text>}
          {!!trip.note && <Text style={[styles.tripMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{trip.note}</Text>}
          {!renderable && <Text style={[styles.tripMeta, { color: colors.mutedForeground }]}>{reason}</Text>}
        </View>
        <Text style={[styles.photoCount, { color: colors.mutedForeground }]}>{photoCount} photo{photoCount === 1 ? '' : 's'}</Text>
      </Pressable>
    );
  }

  const visibleCandidates = candidateTrips.slice(0, candidateLimit);
  const visibleOthers = otherTrips.slice(0, otherLimit);
  const pickerValue = (picker === 'start' ? startDate : endDate) ?? new Date();

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => { if (!busy) onClose(); }}
    >
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable testID="event-close" accessibilityLabel="Fermer" disabled={busy} onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: colors.mutedForeground }]}>×</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {isNew ? 'Nouvel événement' : 'Modifier l’événement'}
          </Text>
          <Pressable
            testID="event-save"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { void save(); }}
            style={[styles.saveButton, { backgroundColor: colors.primary, opacity: busy ? 0.55 : 1 }]}
          >
            {isSaving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Enregistrer</Text>}
          </Pressable>
        </View>

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={{ padding: 16, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Titre</Text>
          <TextInput
            testID="event-title"
            value={draft.title}
            onChangeText={title => { setDraft(previous => ({ ...previous, title })); setError(''); }}
            placeholder="Vacances, week-end…"
            placeholderTextColor={colors.mutedForeground}
            editable={!busy}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
          />

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Début</Text>
              {renderDateField('start')}
            </View>
            <View style={styles.dateField}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Fin</Text>
              {renderDateField('end')}
            </View>
          </View>
          {!!rangeError && <Text style={[styles.error, { color: colors.destructive }]}>{rangeError}</Text>}

          {picker && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
              onChange={(change, selected) => {
                if (selected) setDate(picker, `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`);
                if (Platform.OS !== 'ios' || change.type === 'dismissed') setPicker(null);
              }}
            />
          )}

          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trajets proposés</Text>
              <Text style={[styles.help, { color: colors.mutedForeground }]}>Automatiques selon le jour local, avec vos corrections.</Text>
            </View>
            <Pressable disabled={busy} onPress={resetSelection}>
              <Text style={[styles.reset, { color: colors.primary, opacity: busy ? 0.5 : 1 }]}>Réinitialiser</Text>
            </Pressable>
          </View>
          {visibleCandidates.map(renderTrip)}
          {candidateTrips.length > visibleCandidates.length && (
            <Pressable onPress={() => setCandidateLimit(limit => limit + PAGE_SIZE)} style={styles.moreButton}>
              <Text style={[styles.moreText, { color: colors.primary }]}>Afficher 30 trajets de plus</Text>
            </Pressable>
          )}
          {!candidateTrips.length && <Text style={[styles.empty, { color: colors.mutedForeground }]}>Aucun trajet sur cette période.</Text>}

          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 22 }]}>Autres trajets</Text>
          <Text style={[styles.help, { color: colors.mutedForeground }]}>Rechercher par date, adresse ou note pour ajouter un trajet.</Text>
          <TextInput
            value={search}
            onChangeText={value => { setSearch(value); setOtherLimit(PAGE_SIZE); }}
            placeholder="Rechercher…"
            placeholderTextColor={colors.mutedForeground}
            editable={!busy}
            style={[styles.input, styles.searchInput, { color: colors.foreground, backgroundColor: colors.input, borderColor: colors.border }]}
          />
          {visibleOthers.map(renderTrip)}
          {!!search.trim() && otherTrips.length > visibleOthers.length && (
            <Pressable onPress={() => setOtherLimit(limit => limit + PAGE_SIZE)} style={styles.moreButton}>
              <Text style={[styles.moreText, { color: colors.primary }]}>Afficher 30 trajets de plus</Text>
            </Pressable>
          )}
          {!!search.trim() && !otherTrips.length && <Text style={[styles.empty, { color: colors.mutedForeground }]}>Aucun autre trajet trouvé.</Text>}

          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}18`, borderColor: colors.destructive }]}>
              <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
              {!busy && <Pressable onPress={() => { void (retryDelete ? remove() : save()); }}><Text style={[styles.retry, { color: colors.primary }]}>Réessayer</Text></Pressable>}
            </View>
          )}

          {!isNew && (
            <View style={styles.deleteArea}>
              {!confirmDelete ? (
                <Pressable
                  testID="event-delete"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setConfirmDelete(true)}
                  style={[styles.deleteButton, { borderColor: colors.destructive, opacity: busy ? 0.5 : 1 }]}
                >
                  <Text style={[styles.deleteText, { color: colors.destructive }]}>Supprimer l’événement</Text>
                </Pressable>
              ) : (
                <View style={[styles.warning, { borderColor: colors.destructive, backgroundColor: `${colors.destructive}14` }]}>
                  <Text style={[styles.warningTitle, { color: colors.destructive }]}>Supprimer cet événement ?</Text>
                  <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
                    Seul l’événement sera supprimé. Les trajets et les photos d’origine ne seront jamais supprimés.
                  </Text>
                  <View style={styles.warningActions}>
                    <Pressable disabled={busy} onPress={() => setConfirmDelete(false)} style={styles.cancelButton}>
                      <Text style={[styles.cancelText, { color: colors.foreground }]}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      testID="event-confirm-delete"
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => { void remove(); }}
                      style={[styles.confirmDelete, { backgroundColor: colors.destructive, opacity: busy ? 0.55 : 1 }]}
                    >
                      {isDeleting ? <ActivityIndicator size="small" color={colors.destructiveForeground} /> : <Text style={[styles.confirmDeleteText, { color: colors.destructiveForeground }]}>Supprimer</Text>}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

export default FamilyEventEditor;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, gap: 12 },
  close: { fontSize: 31, lineHeight: 31, fontFamily: 'Inter_400Regular' },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveButton: { minWidth: 102, minHeight: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  saveText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 7, marginTop: 4 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, fontFamily: 'Inter_400Regular' },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  dateField: { flex: 1 },
  dateButton: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, justifyContent: 'center' },
  dateValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 24, marginBottom: 9, gap: 12 },
  sectionCopy: { flex: 1 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  help: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  reset: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingTop: 2 },
  tripRow: { minHeight: 67, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: 0.72 },
  disabledRow: { opacity: 0.58 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 15, lineHeight: 18, fontFamily: 'Inter_700Bold' },
  tripDetails: { flex: 1, minWidth: 0 },
  tripDate: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tripMeta: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  photoCount: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'right' },
  empty: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingVertical: 8 },
  moreButton: { alignItems: 'center', paddingVertical: 10 },
  moreText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  searchInput: { marginTop: 10, marginBottom: 10 },
  errorBox: { borderWidth: 1, borderRadius: 11, padding: 12, marginTop: 18, gap: 7 },
  retry: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  deleteArea: { marginTop: 26 },
  deleteButton: { minHeight: 44, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  warning: { borderWidth: 1, borderRadius: 12, padding: 13, gap: 7 },
  warningTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  warningText: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  warningActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancelButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10 },
  cancelText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  confirmDelete: { minHeight: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  confirmDeleteText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});