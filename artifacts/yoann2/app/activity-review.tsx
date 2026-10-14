import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActivityMapView from '@/components/ActivityMapView';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import type { ActivityFeeling, ActivityKind, Trip, TripPhoto, Vehicle } from '@/types/trips';
import { ACTIVITIES, activityForTrip } from '@/utils/activities';
import { activityMapHtml } from '@/utils/activityMapHtml';
import { ACTIVITY_FEELINGS, activityReviewPatch, type MomentDraft } from '@/utils/activityReview';
import { genId } from '@/utils/ids';
import { tripEvents } from '@/utils/tripEvents';
import { getTrips, getVehicleSettings, updateTrip } from '@/utils/tripStorage';

export default function ActivityReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('walk');
  const [participants, setParticipants] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [feeling, setFeeling] = useState<ActivityFeeling>();
  const [favorite, setFavorite] = useState(false);
  const [note, setNote] = useState('');
  const [moments, setMoments] = useState<MomentDraft[]>([]);
  const [momentEditing, setMomentEditing] = useState(false);
  const [momentId, setMomentId] = useState<string>();
  const [momentNote, setMomentNote] = useState('');
  const [momentPhoto, setMomentPhoto] = useState<TripPhoto>();
  const [pointIndex, setPointIndex] = useState<number>();
  const [pickingPoint, setPickingPoint] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const originalPhotoIds = useRef<string[]>([]);
  useEffect(() => {
    let active = true;
    Promise.all([getTrips(), getVehicleSettings()]).then(([trips, settings]) => {
      if (!active) return;
      const found = trips.find(item => item.id === id) ?? null;
      setTrip(found);
      setVehicles(settings);
      if (found) {
        setKind(activityForTrip(found, settings) ?? 'walk');
        setParticipants(found.walkParticipants ?? []);
        setTitle(found.activityTitle ?? '');
        setFeeling(found.activityFeeling);
        setFavorite(found.activityFavorite ?? false);
        setNote(found.note ?? '');
        setMoments((found.activityMoments ?? []).map(moment => ({ ...moment, photo: found.photos?.find(photo => photo.id === moment.photoId) })));
        originalPhotoIds.current = (found.activityMoments ?? []).flatMap(moment => moment.photoId ? [moment.photoId] : []);
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [id]);
  const leave = useCallback(async (skip: boolean) => {
    if (!trip || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const current = (await getTrips()).find(item => item.id === trip.id);
      if (!current) throw new Error('Cette activité est introuvable.');
      if (skip) {
        if (current.activityReview === 'pending') await updateTrip(trip.id, { activityReview: 'skipped' }, true);
      } else {
        if (momentEditing) {
          Alert.alert('Souvenir en cours', 'Ajoute ou annule le souvenir avant d’enregistrer.');
          return;
        }
        await updateTrip(trip.id, activityReviewPatch(current, {
          kind, participants, title, feeling, favorite, note, moments, originalPhotoIds: originalPhotoIds.current,
        }), true);
      }
      tripEvents.emitTripUpdated();
      router.replace({ pathname: '/trip-map', params: { id: trip.id } });
    } catch (error) {
      Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Tes réponses sont conservées à l’écran. Réessaie.');
    } finally { busy.current = false; setSaving(false); }
  }, [trip, kind, participants, title, feeling, favorite, note, moments, momentEditing, router]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { void leave(true); return true; });
    return () => listener.remove();
  }, [leave]);
  const people = vehicles.find(vehicle => vehicle.id === trip?.vehicle)?.walkParticipants ?? [];
  const html = useMemo(() => trip ? activityMapHtml([trip], vehicles, colors.background, true) : '', [trip, vehicles, colors.background]);
  const startMoment = (existing?: MomentDraft) => {
    setMomentId(existing?.id ?? genId());
    setMomentNote(existing?.note ?? '');
    setMomentPhoto(existing?.photo);
    setPointIndex(existing?.routeIndex ?? (trip?.route?.length ? trip.route.length - 1 : undefined));
    setPickingPoint(false);
    setMomentEditing(true);
  };
  const pickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Accès aux photos', 'Autorise l’accès à la galerie pour joindre une photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled && result.assets[0]) {
        setMomentPhoto({ id: momentPhoto?.id ?? genId(), uri: result.assets[0].uri, takenAt: trip?.endTime ?? Date.now() });
      }
    } catch { Alert.alert('Photo indisponible', 'Impossible d’ouvrir la galerie. Tu peux ajouter un souvenir sans photo.'); }
  };
  const addMoment = () => {
    if (!trip || !momentId || (!momentNote.trim() && !momentPhoto)) return;
    const point = pointIndex == null ? undefined : trip.route?.[pointIndex];
    const draft: MomentDraft = {
      id: momentId, note: momentNote.trim(), photo: momentPhoto, routeIndex: point ? pointIndex : undefined,
      lat: point?.lat, lng: point?.lng, timestamp: point?.t ?? trip.endTime,
    };
    setMoments(items => [...items.filter(item => item.id !== draft.id), draft]);
    setMomentEditing(false);
    setPickingPoint(false);
  };
  const chip = (key: string, label: string, selected: boolean, onPress: () => void) =>
    <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={[s.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card }]}>
      <Text style={{ color: selected ? colors.primaryForeground : colors.foreground }}>{label}</Text>
    </Pressable>;
  const inputStyle = [s.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  const section = (label: string) => <Text style={[s.label, { color: colors.foreground }]}>{label}</Text>;
  return <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={[s.header, { borderBottomColor: colors.border }]}>
      <Text style={[s.heading, { color: colors.foreground }]}>Ton activité</Text>
      <Pressable testID="skip-activity-review" disabled={saving || !trip} onPress={() => { void leave(true); }} hitSlop={12}>
        <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Passer</Text>
      </Pressable>
    </View>
    {!loaded ? <ActivityIndicator color={colors.primary} style={{ flex: 1 }} /> : !trip ?
      <View style={{ padding: 24, gap: 16 }}>
        <Text style={{ color: colors.foreground }}>Activité introuvable.</Text>
        <Pressable onPress={() => router.replace('/(tabs)/trips')}><Text style={{ color: colors.primary }}>Retour aux trajets</Text></Pressable>
      </View> :
      <KeyboardAwareScrollViewCompat bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={{ color: colors.mutedForeground }}>Tout est facultatif. Tu peux passer sans ajouter de souvenir.</Text>
        <Text style={{ color: colors.foreground }}>{trip.distanceKm.toFixed(1)} km · {Math.round((trip.endTime - trip.startTime) / 60000)} min</Text>
        {section('Type d’activité')}
        <View style={s.row}>{ACTIVITIES.map(activity => chip(activity.key, activity.label, activity.key === kind, () => setKind(activity.key)))}</View>
        {section('Avec qui ?')}
        <View style={s.row}>
          {chip('solo', 'Sans participant renseigné', participants.length === 0, () => setParticipants([]))}
          {people.map(person => chip(person.id, person.name, participants.includes(person.id), () =>
            setParticipants(ids => ids.includes(person.id) ? ids.filter(value => value !== person.id) : [...ids, person.id])))}
        </View>
        {people.length === 0 && <Pressable onPress={() => router.push(`/vehicle-settings?vehicleId=${trip.vehicle ?? ''}` as any)}>
          <Text style={{ color: colors.primary }}>Configurer les participants</Text>
        </Pressable>}
        {section('Un titre ?')}
        <TextInput testID="activity-title" value={title} onChangeText={setTitle} placeholder="Ex. Première sortie vélo ensemble"
          placeholderTextColor={colors.mutedForeground} maxLength={100} style={inputStyle} />
        {section('Comment était la sortie ?')}
        <View style={s.row}>{ACTIVITY_FEELINGS.map(item => chip(item.key, item.label, feeling === item.key, () => setFeeling(feeling === item.key ? undefined : item.key)))}</View>
        <TextInput value={note} onChangeText={setNote} multiline maxLength={500} placeholder="Une note ou un souvenir…"
          placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { minHeight: 75 }]} />
        <Pressable onPress={() => setFavorite(value => !value)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: favorite }}>
          <MaterialCommunityIcons name={favorite ? 'star' : 'star-outline'} size={23} color={colors.primary} />
          <Text style={{ color: colors.foreground }}>Garder cette sortie en favori</Text>
        </Pressable>
        {section('Moments de la sortie')}
        {moments.map(moment => <View key={moment.id} style={[s.moment, { borderColor: colors.border }]}>
          {moment.photo && <Image source={{ uri: moment.photo.uri }} style={s.photo} />}
          <Text style={{ color: colors.foreground }}>{moment.note || 'Photo de la sortie'}</Text>
          <View style={s.row}>
            <Pressable onPress={() => startMoment(moment)}><Text style={{ color: colors.primary }}>Modifier</Text></Pressable>
            <Pressable onPress={() => setMoments(items => items.filter(item => item.id !== moment.id))}><Text style={{ color: colors.mutedForeground }}>Supprimer</Text></Pressable>
          </View>
        </View>)}
        {!momentEditing ? <Pressable testID="add-activity-moment" onPress={() => startMoment()} style={[s.button, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary }}>Ajouter une photo ou un moment</Text>
        </Pressable> : <View style={[s.moment, { borderColor: colors.border }]}>
          <TextInput testID="activity-moment-note" value={momentNote} onChangeText={setMomentNote} maxLength={120}
            placeholder="Ex. Pause goûter au bord de l’eau" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
          {momentPhoto && <Image source={{ uri: momentPhoto.uri }} style={s.photo} />}
          <View style={s.row}>
            <Pressable onPress={() => { void pickPhoto(); }}><Text style={{ color: colors.primary }}>{momentPhoto ? 'Changer la photo' : 'Joindre une photo'}</Text></Pressable>
            {momentPhoto && <Pressable onPress={() => setMomentPhoto(undefined)}><Text style={{ color: colors.mutedForeground }}>Retirer</Text></Pressable>}
          </View>
          {(trip.route?.length ?? 0) >= 2 ? <>
            <Pressable onPress={() => setPickingPoint(value => !value)}>
              <Text style={{ color: colors.primary }}>Lieu : {pointIndex === trip.route!.length - 1 ? 'arrivée' : 'point choisi sur le parcours'} · modifier</Text>
            </Pressable>
            {pickingPoint && <>
              <Text style={{ color: colors.mutedForeground }}>Touche le parcours pour placer ce souvenir.</Text>
              <View style={{ height: 240 }}><ActivityMapView html={html} onPointPress={index => {
                if (trip.route?.[index]) setPointIndex(index);
              }} /></View>
            </>}
          </> : <Text style={{ color: colors.mutedForeground }}>Sans tracé GPS : le souvenir sera enregistré sans lieu.</Text>}
          <View style={s.row}>
            <Pressable testID="confirm-activity-moment" onPress={addMoment} disabled={!momentNote.trim() && !momentPhoto}>
              <Text style={{ color: momentNote.trim() || momentPhoto ? colors.primary : colors.mutedForeground }}>Ajouter ce souvenir</Text>
            </Pressable>
            <Pressable onPress={() => { setMomentEditing(false); setPickingPoint(false); }}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable>
          </View>
        </View>}
        <Pressable testID="save-activity-review" disabled={saving} onPress={() => { void leave(false); }}
          style={[s.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Enregistrer</Text>}
        </Pressable>
        <Pressable disabled={saving} onPress={() => { void leave(true); }} style={s.button}><Text style={{ color: colors.mutedForeground }}>Passer sans rien ajouter</Text></Pressable>
      </KeyboardAwareScrollViewCompat>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  body: { padding: 18, gap: 14 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  button: { borderWidth: 1, borderRadius: 12, padding: 15, alignItems: 'center' },
  moment: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  photo: { width: '100%', height: 160, borderRadius: 9 },
});
