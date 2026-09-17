import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { DraftChapters } from '@/components/period-story/DraftChapters';
import { FamilyEventEditor } from '@/components/period-story/FamilyEventEditor';
import { StoryVideoReview } from '@/components/period-story/StoryVideoReview';
import { useColors } from '@/hooks/useColors';
import { usePeriodStoryGeneration } from '@/hooks/usePeriodStoryGeneration';
import { pH } from '@/styles/header';
import type { FamilyEvent, StoryDraftChoices } from '@/types/periodStory';
import type { Trip, Vehicle } from '@/types/trips';
import { genId } from '@/utils/ids';
import {
  buildPeriodStoryDraft, EMPTY_STORY_CHOICES, getStoryTiming, lastCompletedMonth,
  localDateKey, monthRange, parseLocalDate, periodKey,
} from '@/utils/periodStoryDraft';
import { deleteFamilyEvent, loadFamilyEvents, loadPeriodChoices, saveFamilyEvent, savePeriodChoices } from '@/utils/periodStoryStorage';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';
import { getWalkRoutes } from '@/utils/placesStorage';

const THEMES = [
  { key: 'dark', label: 'Sombre', icon: 'weather-night' },
  { key: 'light', label: 'Clair', icon: 'weather-sunny' },
  { key: 'satellite', label: 'Satellite', icon: 'satellite-variant' },
] as const;
const formatDate = (date: Date) => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const formatSeconds = (seconds: number) => seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60 ? `${seconds % 60} s` : ''}`.trim();

function PeriodDate({ label, value, onChange, disabled }: { label: string; value: Date; onChange: (date: Date) => void; disabled: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(localDateKey(value));
  const [error, setError] = useState(false);
  useEffect(() => { setText(localDateKey(value)); setError(false); }, [value]);
  return <View style={s.flex}>
    <Text style={[s.small, { color: colors.mutedForeground }]}>{label}</Text>
    {Platform.OS === 'web' ? <TextInput accessibilityLabel={label} value={text} editable={!disabled} placeholder="AAAA-MM-JJ"
      onChangeText={setText} onBlur={() => {
        const date = parseLocalDate(text);
        setError(!date);
        if (date) onChange(date);
      }} style={[s.dateButton, { color: colors.foreground, borderColor: error ? colors.destructive : colors.border }]} />
      : <Pressable disabled={disabled} onPress={() => setOpen(true)} style={[s.dateButton, { borderColor: colors.border }]}>
        <Text style={[s.body, { color: colors.foreground }]}>{formatDate(value)}</Text>
      </Pressable>}
    {error && <Text style={{ color: colors.destructive }}>Date invalide : AAAA-MM-JJ</Text>}
    {open && <DateTimePicker value={value} mode="date" display="calendar" onChange={(_, date) => {
      setOpen(false); if (date) onChange(date);
    }} />}
  </View>;
}

export default function StoryPeriodScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState(() => lastCompletedMonth());
  const [custom, setCustom] = useState(false);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [walkRoutes, setWalkRoutes] = useState<Array<{ id: string; name: string }>>([]);
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [choices, setChoices] = useState<StoryDraftChoices>(EMPTY_STORY_CHOICES);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [theme, setTheme] = useState<'dark' | 'light' | 'satellite'>('dark');
  const [duration, setDuration] = useState<number | undefined>();
  const [editor, setEditor] = useState<{ event: FamilyEvent; isNew: boolean } | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const generation = usePeriodStoryGeneration();
  const { jobId, isGenerating, progress } = generation;
  const key = periodKey(range.from, range.to);
  const currentKey = useRef(key);
  currentKey.current = key;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([getTrips(), getVehicleSettings(), loadFamilyEvents(), getWalkRoutes()]).then(([trips, settings, stored, routes]) => {
      if (!active) return;
      setAllTrips([...trips].sort((a, b) => a.startTime - b.startTime));
       setVehicles(settings); setWalkRoutes(routes); setEvents(stored); setLoading(false);
    }).catch(() => {
      if (active) { setError('Impossible de charger les souvenirs enregistrés. Réessaie sans effacer les données.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    let active = true;
    setLoadedKey('');
    loadPeriodChoices(key).then(stored => {
      if (active) { setChoices(stored); setLoadedKey(key); }
    }).catch(() => {
      if (active) setError('Impossible de charger les choix de ce brouillon. Réessaie sans effacer les données.');
    });
    return () => { active = false; };
  }, [key, retry]);

  const draft = useMemo(() => buildPeriodStoryDraft({
    trips: allTrips, events, choices: loadedKey === key ? choices : EMPTY_STORY_CHOICES, ...range,
  }), [allTrips, events, choices, loadedKey, key, range]);
  const timing = useMemo(() => getStoryTiming(draft.chapters, duration), [draft.chapters, duration]);
  const sourceTrips = useMemo(() => allTrips.filter(t => t.vehicle !== 'ignored' &&
    t.startTime >= range.from.getTime() && t.startTime <= range.to.getTime()), [allTrips, range]);
  const visibleEvents = showAllEvents ? events : events.filter(event =>
    (event.startDate <= localDateKey(range.to) && event.endDate >= localDateKey(range.from)) ||
    event.includedTripIds.some(id => sourceTrips.some(t => t.id === id)));
  const busy = loading || loadedKey !== key || saving || isGenerating || generation.isSharing;
  const canGenerate = !busy && !error && draft.trips.length > 0 && draft.conflicts.length === 0;

  async function updateChoices(next: StoryDraftChoices) {
    if (savingRef.current || busy) return;
    const savingKey = key;
    savingRef.current = true; setSaving(true);
    try {
      await savePeriodChoices(savingKey, next);
      if (alive.current && currentKey.current === savingKey) { generation.discardResult(); setChoices(next); setError(''); }
    } catch {
      if (alive.current) setError('Choix non enregistrés. Réessaie ; le brouillon précédent est conservé.');
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function changeRange(next: { from: Date; to: Date }) {
    if (busy) return;
    generation.discardResult(); setError(''); setRange(next); setDuration(undefined);
  }

  async function saveEvent(event: FamilyEvent) {
    await saveFamilyEvent(event);
    const stored = await loadFamilyEvents();
    if (alive.current) { generation.discardResult(); setEvents(stored); setEditor(null); }
  }
  async function deleteEvent() {
    if (!editor) return;
    await deleteFamilyEvent(editor.event.id);
    const [stored, cleanedChoices] = await Promise.all([loadFamilyEvents(), loadPeriodChoices(key)]);
    if (alive.current) {
      generation.discardResult(); setEvents(stored); setChoices(cleanedChoices); setEditor(null);
    }
  }
  function createEvent() {
    setEditor({ isNew: true, event: { id: genId(), title: '', startDate: localDateKey(range.from), endDate: localDateKey(range.to),
      includedTripIds: [], excludedTripIds: [] } });
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    await generation.start({
      trips: draft.trips,
      vehicleType: trip => {
        const type = vehicles.find(v => v.id === trip.vehicle)?.type;
        return type === 'walk' ? 'walk' : type === 'moto' ? 'moto' : 'car';
      },
      vehicleLabel: trip => {
        const vehicle = vehicles.find(v => v.id === trip.vehicle);
        const type = vehicle?.type === 'walk'
          ? 'walk'
          : vehicle?.type === 'moto' || trip.vehicle === 'moto'
            ? 'moto'
            : 'car';
        const date = new Date(trip.startTime);
        const dateLabel = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} - ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        if (type === 'walk') {
          const participants = (trip.walkParticipants ?? [])
            .map(id => vehicle?.walkParticipants?.find(participant => participant.id === id)?.name)
            .filter((name): name is string => !!name)
            .join(' · ') || 'Aucun participant';
          const place = trip.walkRouteId
            ? walkRoutes.find(route => route.id === trip.walkRouteId)?.name
            : undefined;
          return `${dateLabel}\nParticipants balade - ${participants}${place ? ` - ${place}` : ''}`;
        }
        const kind = type === 'moto' ? 'Moto' : 'Voiture';
        return `${kind} - ${vehicle?.name ?? (type === 'moto' ? 'Moto' : 'Voiture')} • ${dateLabel}`;
      },
      dateLabel: trip => new Date(trip.startTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      periodLabel: `${formatDate(range.from)} – ${formatDate(range.to)}`,
      tripCountLabel: `${draft.trips.length} trajets`,
      driveDurLabel: '', walkDurLabel: '',
      customName: draft.title, dateRangeLabel: `${formatDate(range.from)} – ${formatDate(range.to)}`,
      familyStory: true, chapters: timing.chapters, videoDurationSec: timing.baseDurationSec,
      photoPauseSecPerPhoto: timing.photoPausePerPhotoSec, theme,
    });
  }

  return <View style={[s.root, { backgroundColor: colors.background }]}>
    <View style={[pH.row, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Pressable accessibilityLabel="Retour" disabled={saving || generation.isSharing} onPress={() => router.back()} hitSlop={8}
        style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="arrow-left" size={18} color={colors.foreground} />
      </Pressable>
      <Text style={[s.headerTitle, { color: colors.foreground }]}>Souvenir du mois</Text>
      <MaterialCommunityIcons name="movie-play-outline" size={20} color={colors.mutedForeground} />
    </View>
    <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 30 }]} keyboardShouldPersistTaps="handled">
      <View style={s.row}>
        <Pressable disabled={busy} testID="previous-month" accessibilityLabel="Mois précédent" style={s.iconButton}
          onPress={() => { setCustom(false); changeRange(monthRange(new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1))); }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <Text style={[s.month, s.flex, { color: colors.foreground }]}>
          {custom ? 'Période personnalisée' : range.from.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable disabled={busy} testID="next-month" accessibilityLabel="Mois suivant" style={s.iconButton}
          onPress={() => { setCustom(false); changeRange(monthRange(new Date(range.from.getFullYear(), range.from.getMonth() + 1, 1))); }}>
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.foreground} />
        </Pressable>
      </View>
      <Pressable disabled={busy} onPress={() => { if (custom) changeRange(monthRange(range.from)); setCustom(!custom); }}>
        <Text style={[s.link, { color: colors.primary }]}>{custom ? 'Revenir au mois entier' : 'Choisir une période personnalisée'}</Text>
      </Pressable>
      {custom && <View style={s.row}>
        <PeriodDate label="Du" value={range.from} disabled={busy} onChange={date => {
          const from = new Date(date); from.setHours(0, 0, 0, 0);
          const to = new Date(Math.max(from.getTime(), range.to.getTime())); to.setHours(23, 59, 59, 999);
          changeRange({ from, to });
        }} />
        <PeriodDate label="Au" value={range.to} disabled={busy} onChange={date => {
          const to = new Date(date); to.setHours(23, 59, 59, 999);
          const from = new Date(Math.min(range.from.getTime(), to.getTime())); from.setHours(0, 0, 0, 0);
          changeRange({ from, to });
        }} />
      </View>}

      {!!error && <View style={[s.card, { borderColor: colors.destructive }]}>
        <Text accessibilityLiveRegion="polite" style={[s.body, { color: colors.destructive }]}>{error}</Text>
        <Pressable testID="retry-draft" onPress={() => { setError(''); setRetry(n => n + 1); }}><Text style={{ color: colors.primary }}>Réessayer</Text></Pressable>
      </View>}
      {(loading || loadedKey !== key) && !error ? <ActivityIndicator color={colors.primary} /> : <>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.label, { color: colors.primary }]}>BROUILLON · {saving ? 'ENREGISTREMENT…' : 'À VÉRIFIER'}</Text>
          <Text testID="memory-title" style={[s.hero, { color: colors.foreground }]}>{draft.title}</Text>
          <Text style={[s.small, { color: colors.mutedForeground }]}>{formatDate(range.from)} – {formatDate(range.to)}</Text>
          <Text style={[s.body, { color: colors.foreground }]}>{draft.chapters.length} chapitre(s) · {draft.trips.length} trajet(s) · {draft.photoCount} photo(s)</Text>
          <Text style={[s.small, { color: colors.mutedForeground }]}>
            Préparé à l’ouverture avec les photos déjà associées. Les trajets sont classés selon leur départ, en heure locale. Chaque événement reste un chapitre, classé à sa première sortie.
          </Text>
        </View>
        {generation.result && <StoryVideoReview key={generation.result.uri} uri={generation.result.uri}
          isSharing={generation.isSharing} onShare={() => { void generation.shareResult(); }} onDiscard={generation.discardResult} />}

        <View style={s.row}>
          <Text style={[s.label, s.flex, { color: colors.mutedForeground }]}>ÉVÉNEMENTS</Text>
          <Pressable disabled={busy || !!error} testID="create-event" onPress={createEvent} style={s.iconButton}>
            <Text style={[s.link, { color: colors.primary }]}>+ Ajouter</Text>
          </Pressable>
        </View>
        {visibleEvents.map(event => <Pressable key={event.id} disabled={busy} testID={`edit-event-${event.id}`}
          onPress={() => setEditor({ event, isNew: false })} style={[s.eventRow, { borderColor: colors.border }]}>
          <View style={s.flex}>
            <Text style={[s.body, { color: colors.foreground }]}>{event.title}</Text>
            <Text style={[s.small, { color: colors.mutedForeground }]}>{event.startDate} → {event.endDate}</Text>
          </View>
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
        </Pressable>)}
        {!visibleEvents.length && <Text style={[s.small, { color: colors.mutedForeground }]}>Sans événement, les sorties sont simplement regroupées par journée.</Text>}
        {events.length > 0 && <Pressable onPress={() => setShowAllEvents(!showAllEvents)}>
          <Text style={[s.link, { color: colors.primary }]}>{showAllEvents ? 'Événements de la période' : `Tous les événements (${events.length})`}</Text>
        </Pressable>}
        <Text style={[s.label, { color: colors.mutedForeground, marginTop: 12 }]}>CHAPITRES · ORDRE DE LA VIDÉO</Text>
        {!draft.chapters.length && <Text testID="empty-memory" style={[s.body, { color: colors.mutedForeground }]}>
          {sourceTrips.length ? 'Aucun passage retenu. Rétablis un trajet ci-dessous ou choisis une autre période.' : 'Aucun trajet ce mois-ci. Choisis un autre mois ou une période personnalisée.'}
        </Text>}
        <DraftChapters draft={draft} sourceTrips={sourceTrips} events={events} choices={choices} disabled={busy || !!error}
          onChange={next => { void updateChoices(next); }} onEditEvent={event => setEditor({ event, isNew: false })} />
        <Text style={[s.small, { color: colors.mutedForeground }]}>Écarter un passage ou une photo ne modifie jamais les originaux.</Text>

        <Text style={[s.label, { color: colors.mutedForeground, marginTop: 12 }]}>MONTAGE</Text>
        <View style={s.row}>
          {[undefined, 60, 120].map((seconds, i) => <Pressable key={i} disabled={busy} onPress={() => { generation.discardResult(); setDuration(seconds); }}
            style={[s.chip, { backgroundColor: colors.card, borderColor: duration === seconds ? colors.primary : colors.border }]}>
            <Text style={[s.body, { color: duration === seconds ? colors.primary : colors.foreground }]}>{seconds ? `${seconds / 60} min` : 'Auto'}</Text>
          </Pressable>)}
        </View>
        <Text testID="story-timing" style={[s.small, { color: colors.mutedForeground }]}>
          {`${formatSeconds(timing.baseDurationSec)} de montage + ${formatSeconds(timing.photoPauseSec)} de pauses photo (${draft.photoCount} × ${timing.photoPausePerPhotoSec.toFixed(1)} s) = environ ${formatSeconds(timing.totalDurationSec)}.\nOuverture ${timing.openingSec} s · récap discret ${timing.recapSec} s. Auto garde le mois complet ; les durées choisies condensent les trajets pour viser la durée demandée.`}
        </Text>
        <View style={s.row}>{THEMES.map(option => <Pressable key={option.key} disabled={busy}
          onPress={() => { generation.discardResult(); setTheme(option.key); }}
          style={[s.chip, { backgroundColor: colors.card, borderColor: theme === option.key ? colors.primary : colors.border }]}>
          <MaterialCommunityIcons name={option.icon} size={16} color={theme === option.key ? colors.primary : colors.mutedForeground} />
          <Text style={[s.small, { color: theme === option.key ? colors.primary : colors.foreground }]}>{option.label}</Text>
        </Pressable>)}</View>
        {theme === 'satellite' && <Text style={[s.small, { color: colors.mutedForeground }]}>Connexion internet nécessaire. Si le satellite est indisponible ou trop lourd, le fond Sombre est utilisé.</Text>}
        <Pressable disabled={!canGenerate} testID="generate-memory" onPress={handleGenerate}
          style={[s.generateButton, { backgroundColor: canGenerate ? colors.primary : colors.muted }]}>
          <MaterialCommunityIcons name="movie-play-outline" size={20} color={canGenerate ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[s.buttonText, { color: canGenerate ? colors.primaryForeground : colors.mutedForeground }]}>
            {draft.conflicts.length ? 'Choisir les chapitres en conflit' : 'Créer la vidéo à vérifier'}
          </Text>
        </Pressable>
        <Text style={[s.small, { color: colors.mutedForeground, textAlign: 'center' }]}>Garde l’app ouverte pendant la création. Le partage reste manuel, après lecture de la vidéo.</Text>
        {!!generation.fallbackNote && <Text style={[s.small, { color: colors.mutedForeground }]}>{generation.fallbackNote}</Text>}
      </>}
    </ScrollView>
    {editor && <FamilyEventEditor key={editor.event.id} {...editor} trips={allTrips} onSave={saveEvent} onDelete={deleteEvent} onClose={() => setEditor(null)} />}
    <Modal visible={isGenerating} transparent animationType="fade" onRequestClose={generation.cancel}>
      <View style={[s.progressOverlay, { backgroundColor: colors.background }]}>
        <View style={[s.progressCard, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.buttonText, { color: colors.foreground }]}>{generation.title}</Text>
          <View style={[s.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={{ width: `${progress}%`, height: 6, backgroundColor: colors.primary }} />
          </View>
          <Text accessibilityLiveRegion="polite" style={[s.body, { color: colors.mutedForeground }]}>{generation.detail || 'Préparation en cours…'}</Text>
          {!!generation.fallbackNote && <Text style={[s.small, { color: colors.mutedForeground }]}>{generation.fallbackNote}</Text>}
          <Pressable testID="cancel-memory" accessibilityRole="button" onPress={generation.cancel} style={s.iconButton}>
            <Text style={[s.link, { color: colors.primary }]}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    {jobId && <WebView key={jobId} ref={generation.webViewRef} source={generation.source}
      onMessage={event => generation.onMessage(jobId, event)} onLoadEnd={() => generation.onLoadEnd(jobId)}
      onError={() => generation.onEngineError(jobId)} onRenderProcessGone={() => generation.onEngineError(jobId)}
      onContentProcessDidTerminate={() => generation.onEngineError(jobId)} javaScriptEnabled
      mediaPlaybackRequiresUserAction={false} style={s.hiddenWebView} />}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, scroll: { padding: 16, gap: 14 },
  headerTitle: { flex: 1, marginLeft: 10, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  month: { fontSize: 17, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  iconButton: { padding: 8, minHeight: 40, justifyContent: 'center' },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  hero: { fontSize: 26, lineHeight: 34, fontFamily: 'Inter_600SemiBold' },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  small: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  link: { fontSize: 13, fontFamily: 'Inter_500Medium', paddingVertical: 4 },
  dateButton: { borderWidth: 1, padding: 10, marginTop: 6, borderRadius: 10, minHeight: 44 },
  eventRow: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, paddingVertical: 12, borderRadius: 10 },
  generateButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 12, marginTop: 8 },
  buttonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  progressOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  progressCard: { width: '100%', borderRadius: 18, padding: 24, gap: 18, alignItems: 'center' },
  progressTrack: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  // The canvas must keep rendering in Android WebView (never display:none).
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0.01, top: -10, left: -10 },
});