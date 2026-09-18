import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { FamilyEvent, StoryDraftChoices } from '@/types/periodStory';
import type { Trip, TripPhoto } from '@/types/trips';
import { buildPeriodStoryDraft, eventMatchesTrip, photoKey } from '@/utils/periodStoryDraft';

type Props = {
  draft: ReturnType<typeof buildPeriodStoryDraft>;
  sourceTrips: Trip[];
  events: FamilyEvent[];
  choices: StoryDraftChoices;
  disabled: boolean;
  onChange: (choices: StoryDraftChoices) => void;
  onEditEvent: (event: FamilyEvent) => void;
};

export function tripCaption(trip: Trip): string {
  const date = new Date(trip.startTime);
  const when = date.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const places = [trip.startAddress, trip.endAddress].filter(Boolean).join(' → ');
  return `${when}${places ? ` · ${places}` : ''}`;
}

function PhotoChoice({ trip, photo, photoKeyValue, included, excluded, disabled, captionOverride, onToggle, onCaptionChange }: {
  trip: Trip;
  photo: TripPhoto;
  photoKeyValue: string;
  included: boolean;
  excluded: boolean;
  disabled: boolean;
  captionOverride: string | undefined;
  onToggle: () => void;
  onCaptionChange: (caption: string) => void;
}) {
  const colors = useColors();
  const [missing, setMissing] = useState(!photo.uri);
  const effectiveCaption = captionOverride ?? photo.note ?? '';
  const [caption, setCaption] = useState(effectiveCaption);
  useEffect(() => { setCaption(effectiveCaption); }, [effectiveCaption, photoKeyValue]);
  const commitCaption = (value: string) => {
    const next = value.trim();
    if (next !== effectiveCaption.trim()) onCaptionChange(next);
  };
  return (
    <View style={[s.photoBlock, { borderColor: colors.border }]}>
      <View style={s.photoRow}>
        {!missing ? <Image source={{ uri: photo.uri }} style={s.thumbnail} resizeMode="cover"
          onError={() => setMissing(true)} /> :
          <MaterialCommunityIcons name="image-broken-variant" size={32} color={colors.mutedForeground} />}
        <View style={s.flex}>
          <Text style={[s.body, { color: colors.foreground }]} numberOfLines={2}>
            {effectiveCaption || 'Photo du trajet'}
          </Text>
          <Text style={[s.small, { color: missing ? colors.destructive : colors.mutedForeground }]}>
            {missing ? 'Photo indisponible · à exclure ou à rétablir dans la galerie'
              : included ? 'Incluse · pause de 2 s'
                : excluded ? 'Écartée du souvenir' : 'Doublon non exporté'}
          </Text>
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: included }}
          accessibilityLabel={`${included ? 'Exclure' : 'Inclure'} la photo ${effectiveCaption || photo.id}`}
          testID={`draft-photo-${trip.id}-${photo.id}`} disabled={disabled || !photo.uri || (!included && !excluded)}
          onPress={onToggle} hitSlop={10} style={s.photoToggle}>
          <MaterialCommunityIcons name={included ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22} color={included ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="Commentaire affiché sous la photo dans la vidéo"
        testID={`draft-photo-caption-${trip.id}-${photo.id}`}
        value={caption}
        editable={!disabled && included && !missing}
        maxLength={120}
        multiline
        placeholder="Ajouter un commentaire sous la photo…"
        placeholderTextColor={colors.mutedForeground}
        onChangeText={setCaption}
        onEndEditing={event => commitCaption(event.nativeEvent.text)}
        style={[s.captionInput, {
          color: colors.foreground,
          backgroundColor: colors.input,
          borderColor: colors.border,
          opacity: included && !missing ? 1 : 0.5,
        }]}
      />
    </View>
  );
}

export function DraftChapters({ draft, sourceTrips, events, choices, disabled, onChange, onEditEvent }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState<string[]>([]);
  const excluded = new Set(choices.excludedTripIds);
  const sources = new Map(sourceTrips.map(trip => [trip.id, trip]));
  const includedPhotos = new Set(draft.trips.flatMap(trip => (trip.photos ?? []).map(p => photoKey(trip.id, p))));
  const restoreTrips = sourceTrips.filter(trip => excluded.has(trip.id));
  const toggleTrip = (id: string) => onChange({ ...choices,
    excludedTripIds: excluded.has(id) ? choices.excludedTripIds.filter(t => t !== id) : [...choices.excludedTripIds, id],
  });
  return (
    <View style={s.list}>
      {draft.conflicts.length > 0 && <Text accessibilityLiveRegion="polite" style={[s.notice, { color: colors.destructive }]}>
        {draft.conflicts.length} trajet(s) correspondent à plusieurs événements. Choisis un seul chapitre ci-dessous avant de créer la vidéo.
      </Text>}
      {draft.chapters.map((chapter, index) => {
        const expanded = open.includes(chapter.id) || chapter.trips.some(t => draft.conflicts.some(c => c.tripId === t.id));
        const count = chapter.trips.reduce((n, trip) => n + (trip.photos?.length ?? 0), 0);
        return <View key={chapter.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
            testID={`chapter-${chapter.id}`} onPress={() => setOpen(expanded ? open.filter(id => id !== chapter.id) : [...open, chapter.id])}
            style={s.heading}>
            <Text style={[s.number, { color: colors.primary }]}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={s.flex}>
              <Text style={[s.title, { color: colors.foreground }]}>{chapter.title}</Text>
              <Text style={[s.small, { color: colors.mutedForeground }]}>
                {chapter.trips.length} trajet(s) · {count} photo(s)
              </Text>
            </View>
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.mutedForeground} />
          </Pressable>
          {expanded && <>
            <View style={s.actions}>
              {chapter.eventId && <Pressable disabled={disabled} onPress={() => {
                const event = events.find(e => e.id === chapter.eventId);
                if (event) onEditEvent(event);
              }}><Text style={[s.link, { color: colors.primary }]}>Modifier l’événement</Text></Pressable>}
              <Pressable disabled={disabled} testID={`exclude-chapter-${chapter.id}`}
                onPress={() => onChange({ ...choices, excludedTripIds: [...new Set([...choices.excludedTripIds, ...chapter.trips.map(t => t.id)])] })}>
                <Text style={[s.link, { color: colors.mutedForeground }]}>Écarter ce chapitre</Text>
              </Pressable>
            </View>
            {chapter.trips.map(trip => {
              const original = sources.get(trip.id) ?? trip;
              const matches = events.filter(event => eventMatchesTrip(event, original));
              const conflict = draft.conflicts.some(c => c.tripId === trip.id);
              const effectiveChapter = conflict ? undefined : chapter.eventId ?? 'day';
              return <View key={trip.id} style={[s.trip, { borderColor: colors.border }]}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: true }} disabled={disabled}
                  testID={`draft-trip-${trip.id}`} onPress={() => toggleTrip(trip.id)} style={s.heading}>
                  <MaterialCommunityIcons name="checkbox-marked" size={22} color={colors.primary} />
                  <Text style={[s.body, s.flex, { color: colors.foreground }]}>{tripCaption(trip)}</Text>
                </Pressable>
                {(matches.length > 1 || choices.tripChapterOverrides[trip.id]) && <View style={s.list}>
                  <Text style={[s.small, { color: conflict ? colors.destructive : colors.mutedForeground }]}>
                    {conflict ? 'Chevauchement : choisir le chapitre' : 'Chapitre retenu (modifiable)'}
                  </Text>
                  {[...matches.map(e => ({ id: e.id, title: e.title })), { id: 'day', title: 'Journée, sans événement' }].map(option => (
                    <Pressable key={option.id} disabled={disabled} testID={`assign-${trip.id}-${option.id}`}
                      onPress={() => onChange({ ...choices, tripChapterOverrides: { ...choices.tripChapterOverrides, [trip.id]: option.id } })}
                      style={[s.option, { borderColor: effectiveChapter === option.id ? colors.primary : colors.border }]}>
                      <Text style={[s.small, { color: effectiveChapter === option.id ? colors.primary : colors.foreground }]}>
                        {effectiveChapter === option.id ? '✓ ' : ''}{option.title}
                      </Text>
                    </Pressable>
                  ))}
                </View>}
                {(original.photos ?? []).map((photo, photoIndex) => {
                  const key = photoKey(trip.id, photo);
                  return <PhotoChoice key={`${key}-${photoIndex}`} trip={trip} photo={photo}
                     photoKeyValue={key} captionOverride={choices.photoCaptions[key]}
                    included={includedPhotos.has(key)} excluded={choices.excludedPhotoKeys.includes(key)} disabled={disabled}
                     onCaptionChange={caption => {
                       const photoCaptions = { ...choices.photoCaptions };
                       if (caption === (photo.note ?? '').trim()) delete photoCaptions[key];
                       else photoCaptions[key] = caption;
                       onChange({ ...choices, photoCaptions });
                     }}
                    onToggle={() => onChange({ ...choices, excludedPhotoKeys: choices.excludedPhotoKeys.includes(key)
                      ? choices.excludedPhotoKeys.filter(p => p !== key) : [...choices.excludedPhotoKeys, key] })} />;
                })}
                {!original.photos?.length && <Text style={[s.small, { color: colors.mutedForeground }]}>Aucune photo associée.</Text>}
              </View>;
            })}
          </>}
        </View>;
      })}
      {restoreTrips.length > 0 && <View style={[s.card, { borderColor: colors.border }]}>
        <Text style={[s.title, { color: colors.mutedForeground }]}>Passages écartés ({restoreTrips.length})</Text>
        {restoreTrips.map(trip => <Pressable key={trip.id} disabled={disabled} onPress={() => toggleTrip(trip.id)}
          testID={`restore-trip-${trip.id}`} style={s.heading}>
          <MaterialCommunityIcons name="checkbox-blank-outline" size={22} color={colors.mutedForeground} />
          <Text style={[s.body, s.flex, { color: colors.mutedForeground }]}>{tripCaption(trip)}</Text>
          <Text style={[s.small, { color: colors.primary }]}>Rétablir</Text>
        </Pressable>)}
      </View>}
      {draft.unavailableTrips.length > 0 && <Text style={[s.small, { color: colors.mutedForeground }]}>
        {draft.unavailableTrips.length} trajet(s) sans tracé GPS exploitable ne seront pas exportés. Les originaux sont conservés.
      </Text>}
      {draft.omittedPhotoCount > 0 && <Text style={[s.small, { color: colors.mutedForeground }]}>
        {draft.omittedPhotoCount} photo(s) écartée(s), en double ou sans référence exploitable ne seront pas exportées.
      </Text>}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 10 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  flex: { flex: 1 }, number: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  title: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  small: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  link: { fontSize: 12, fontFamily: 'Inter_500Medium', paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  trip: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  photoBlock: { gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoToggle: { padding: 5, margin: -5 },
  thumbnail: { width: 48, height: 56, borderRadius: 6 },
  captionInput: { minHeight: 42, maxHeight: 82, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  notice: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  option: { padding: 10, borderWidth: 1, borderRadius: 8 },
});