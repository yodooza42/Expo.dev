import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActivityMapView from '@/components/ActivityMapView';
import { ActivityPhotoPicker } from '@/components/ActivityPhotoPicker';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import type { ActivityFeeling, ActivityKind, Trip, TripPhoto, Vehicle } from '@/types/trips';
import { ACTIVITIES, activityForTrip } from '@/utils/activities';
import { activityMapHtml } from '@/utils/activityMapHtml';
import { ACTIVITY_FEELINGS, activityReviewPatch, type MomentDraft } from '@/utils/activityReview';
import { genId } from '@/utils/ids';
import { fmtHHMM, fmtWeekdayShort } from '@/utils/date';
import { loadMultiDayPoints } from '@/utils/locationTracking';
import { locatePhotoOnTrip, photoTakenAt, type PhotoGpsPoint, type PhotoPlacement } from '@/utils/tripPhotoPlacement';
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
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const [photoPickerMode, setPhotoPickerMode] = useState<'moment' | 'batch'>('moment');
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoBusyRef = useRef(false);
  const gpsPromise = useRef<Promise<PhotoGpsPoint[]>>(Promise.resolve([]));
  const [photoPlacement, setPhotoPlacement] = useState<PhotoPlacement>();
  const [placementStatus, setPlacementStatus] = useState<PhotoPlacement['method'] | 'unknown' | 'unplaced'>();
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
        gpsPromise.current = loadMultiDayPoints(found.startTime, found.endTime).catch(() => []);
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
    if (!skip && photoBusyRef.current) {
      Alert.alert('Photo en cours', 'Attends la fin du chargement de la photo avant d’enregistrer.');
      return;
    }
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
  const html = useMemo(() => {
    if (!trip) return '';
    const selected = photoPlacement ?? (pointIndex == null ? undefined : trip.route?.[pointIndex]);
    return activityMapHtml([{ ...trip, activityType: kind, activityMoments: moments }], vehicles, colors.background, true, selected);
  }, [trip, vehicles, colors.background, kind, moments, pointIndex, photoPlacement]);
  const startMoment = (existing?: MomentDraft) => {
    if (photoBusyRef.current) return;
    setMomentId(existing?.id ?? genId());
    setMomentNote(existing?.note ?? '');
    setMomentPhoto(existing?.photo);
    setPointIndex(existing ? existing.routeIndex : (trip?.route?.length ? trip.route.length - 1 : undefined));
    setPhotoPlacement(existing?.lat != null && existing.lng != null ? {
      routeIndex: existing.routeIndex, lat: existing.lat, lng: existing.lng,
      timestamp: existing.timestamp ?? trip?.endTime ?? Date.now(), method: existing.placementMethod ?? 'manual',
    } : undefined);
    setPlacementStatus(existing?.photo?.takenAtEstimated ? 'unknown' : existing?.placementMethod);
    setPickingPoint(false);
    setMomentEditing(true);
  };
  const preparePhoto = async (uri: string, takenAt?: number, photoId?: string) => {
    if (!trip) throw new Error('Activité introuvable.');
    const gps = await gpsPromise.current;
    const placement = takenAt == null ? undefined : locatePhotoOnTrip(trip, takenAt, gps);
    const photo: TripPhoto = {
      id: photoId ?? genId(), uri, takenAt: takenAt ?? trip.endTime,
      takenAtEstimated: takenAt == null,
    };
    return { photo, placement };
  };
  const attachPhoto = async (uri: string, takenAt?: number) => {
    const { photo, placement } = await preparePhoto(uri, takenAt, momentPhoto?.id);
    setMomentPhoto(photo);
    setPointIndex(placement?.routeIndex);
    setPhotoPlacement(placement);
    setPlacementStatus(takenAt == null ? 'unknown' : placement?.method ?? 'unplaced');
    setPickingPoint((trip?.route?.length ?? 0) >= 2);
  };
  const readPhotoTime = async (asset: { assetId?: string | null; exif?: Record<string, unknown> | null; creationTime?: number }) => {
    let exif = asset.exif;
    let creationTime = asset.creationTime;
    if (asset.assetId && Platform.OS !== 'web') {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId, { shouldDownloadFromNetwork: false });
        if (info.exif && typeof info.exif === 'object' && !Array.isArray(info.exif)) exif = info.exif as Record<string, unknown>;
        creationTime = info.creationTime || creationTime;
      } catch { /* EXIF from the picker or the gallery's epoch timestamp can still be used. */ }
    }
    return photoTakenAt(exif, creationTime);
  };
  const addPhotoBatch = async (assets: Array<{ uri: string; takenAt?: number }>) => {
    const existing = new Set(moments.flatMap(moment => moment.photo ? [moment.photo.uri] : []));
    const drafts: MomentDraft[] = [];
    for (const asset of assets) {
      if (existing.has(asset.uri)) continue;
      const { photo, placement } = await preparePhoto(asset.uri, asset.takenAt);
      drafts.push({
        id: genId(), note: '', photo, routeIndex: placement?.routeIndex, lat: placement?.lat, lng: placement?.lng,
        timestamp: asset.takenAt ?? trip?.endTime, placementMethod: placement?.method,
      });
      existing.add(asset.uri);
    }
    if (!drafts.length) {
      Alert.alert('Photos déjà ajoutées', 'Ces photos ont déjà un souvenir dans cette activité.');
      return;
    }
    drafts.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    setMoments(previous => [...previous, ...drafts.filter(draft => !previous.some(moment => moment.photo?.uri === draft.photo?.uri))]);
  };
  const pickSuggestedPhotos = async (assets: MediaLibrary.Asset[]) => {
    if (photoBusyRef.current) return;
    photoBusyRef.current = true; setPhotoBusy(true);
    try {
      const chosen: Array<{ uri: string; takenAt?: number }> = [];
      for (const asset of assets) chosen.push({ uri: asset.uri, takenAt: await readPhotoTime({ assetId: asset.id, creationTime: asset.creationTime }) });
      if (photoPickerMode === 'batch') await addPhotoBatch(chosen);
      else if (chosen[0]) await attachPhoto(chosen[0].uri, chosen[0].takenAt);
      setPhotoPickerVisible(false);
    } catch { Alert.alert('Photo indisponible', 'Impossible de joindre cette photo. Tu peux réessayer ou ouvrir toute la galerie.'); }
    finally { photoBusyRef.current = false; setPhotoBusy(false); }
  };
  const pickPhoto = async () => {
    if (photoBusyRef.current) return;
    photoBusyRef.current = true; setPhotoBusy(true); setPhotoPickerVisible(false);
    try {
      // The system photo picker also works without broad gallery access.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 1, exif: true, allowsMultipleSelection: photoPickerMode === 'batch',
      });
      if (!result.canceled && result.assets[0]) {
        const chosen: Array<{ uri: string; takenAt?: number }> = [];
        for (const asset of result.assets) chosen.push({ uri: asset.uri, takenAt: await readPhotoTime(asset) });
        if (photoPickerMode === 'batch') await addPhotoBatch(chosen);
        else if (chosen[0]) await attachPhoto(chosen[0].uri, chosen[0].takenAt);
      }
    } catch { Alert.alert('Photo indisponible', 'Impossible d’ouvrir la galerie. Tu peux ajouter un souvenir sans photo.'); }
    finally { photoBusyRef.current = false; setPhotoBusy(false); }
  };
  const addMoment = () => {
    if (!trip || !momentId || photoBusyRef.current || (!momentNote.trim() && !momentPhoto)) return;
    const point = pointIndex == null ? undefined : trip.route?.[pointIndex];
    const draft: MomentDraft = {
      id: momentId, note: momentNote.trim(), photo: momentPhoto, routeIndex: point ? pointIndex : undefined,
      lat: photoPlacement?.lat ?? point?.lat, lng: photoPlacement?.lng ?? point?.lng,
      timestamp: momentPhoto && !momentPhoto.takenAtEstimated ? momentPhoto.takenAt : photoPlacement?.timestamp ?? point?.t ?? trip.endTime,
      placementMethod: photoPlacement?.method,
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
          {moment.photo && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{moment.photo.takenAtEstimated ? 'Date de prise inconnue' : `${fmtWeekdayShort(moment.photo.takenAt)} · ${fmtHHMM(moment.photo.takenAt)}`}</Text>}
          {moment.placementMethod === 'estimated' && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Position estimée · modifiable sur la carte</Text>}
          {moment.photo && (moment.lat == null || moment.lng == null) && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Photo sans emplacement automatique</Text>}
          <View style={s.row}>
            <Pressable disabled={photoBusy} onPress={() => startMoment(moment)}><Text style={{ color: colors.primary }}>Modifier</Text></Pressable>
            <Pressable disabled={photoBusy} onPress={() => setMoments(items => items.filter(item => item.id !== moment.id))}><Text style={{ color: colors.mutedForeground }}>Supprimer</Text></Pressable>
          </View>
        </View>)}
        {!momentEditing && <Pressable disabled={photoBusy} onPress={() => { setPhotoPickerMode('batch'); setPhotoPickerVisible(true); }} style={[s.button, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary }}>Photos prises pendant l’activité</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Sélectionne les photos à ajouter automatiquement sur le parcours.</Text>
        </Pressable>}
        {!momentEditing ? <Pressable testID="add-activity-moment" disabled={photoBusy} onPress={() => startMoment()} style={[s.button, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary }}>Ajouter une photo ou un moment</Text>
        </Pressable> : <View style={[s.moment, { borderColor: colors.border }]}>
          <TextInput testID="activity-moment-note" value={momentNote} onChangeText={setMomentNote} maxLength={120}
            placeholder="Ex. Pause goûter au bord de l’eau" placeholderTextColor={colors.mutedForeground} style={inputStyle} />
          {momentPhoto && <Image source={{ uri: momentPhoto.uri }} style={s.photo} />}
          <View style={s.row}>
            <Pressable disabled={photoBusy} onPress={() => { setPhotoPickerMode('moment'); setPhotoPickerVisible(true); }}><Text style={{ color: colors.primary }}>{momentPhoto ? 'Changer la photo' : 'Joindre une photo'}</Text></Pressable>
            {momentPhoto && <Pressable disabled={photoBusy} onPress={() => { setMomentPhoto(undefined); setPlacementStatus(undefined); }}><Text style={{ color: colors.mutedForeground }}>Retirer</Text></Pressable>}
          </View>
          {photoBusy && <ActivityIndicator color={colors.primary} />}
          {momentPhoto && !momentPhoto.takenAtEstimated && <Text style={{ color: colors.mutedForeground }}>Photo : {fmtWeekdayShort(momentPhoto.takenAt)} · {fmtHHMM(momentPhoto.takenAt)}</Text>}
          {placementStatus === 'unknown' && <Text style={{ color: colors.mutedForeground }}>{(trip.route?.length ?? 0) >= 2 ? 'Date de prise inconnue : choisis le lieu sur la carte.' : 'Date de prise inconnue : pas de placement automatique.'}</Text>}
          {placementStatus === 'unplaced' && <Text style={{ color: colors.mutedForeground }}>{(trip.route?.length ?? 0) >= 2 ? 'Photo hors de la plage horaire du trajet : placement manuel nécessaire.' : 'Pas de tracé disponible pour placer automatiquement cette photo.'}</Text>}
          {placementStatus === 'estimated' && <Text style={{ color: colors.mutedForeground }}>Placement estimé d’après l’heure : les points du tracé n’ont pas d’horodatage GPS.</Text>}
          {(placementStatus === 'gps' || placementStatus === 'time') && <Text style={{ color: colors.mutedForeground }}>Position retrouvée grâce à l’heure de la photo et aux points GPS du trajet.</Text>}
          {(trip.route?.length ?? 0) >= 2 ? <>
            <Pressable disabled={photoBusy} onPress={() => setPickingPoint(value => !value)}>
              <Text style={{ color: colors.primary }}>Lieu : {pointIndex == null ? 'non placé' : placementStatus && placementStatus !== 'manual' && placementStatus !== 'unknown' ? 'position automatique' : pointIndex === trip.route!.length - 1 ? 'arrivée' : 'point choisi sur le parcours'} · modifier</Text>
            </Pressable>
            {pickingPoint && <>
              <Text style={{ color: colors.mutedForeground }}>Touche le parcours pour placer ce souvenir.</Text>
              <View style={{ height: 240 }}><ActivityMapView html={html} onPointPress={index => {
                if (photoBusyRef.current) return;
                const point = trip.route?.[index];
                if (!point) return;
                setPointIndex(index);
                setPhotoPlacement({
                  routeIndex: index, lat: point.lat, lng: point.lng,
                  timestamp: point.t ?? trip.startTime + (index / (trip.route!.length - 1)) * (trip.endTime - trip.startTime),
                  method: 'manual',
                });
                setPlacementStatus('manual');
              }} /></View>
            </>}
          </> : <Text style={{ color: colors.mutedForeground }}>Sans tracé GPS : le souvenir sera enregistré sans lieu.</Text>}
          <View style={s.row}>
            <Pressable testID="confirm-activity-moment" onPress={addMoment} disabled={photoBusy || (!momentNote.trim() && !momentPhoto)}>
              <Text style={{ color: momentNote.trim() || momentPhoto ? colors.primary : colors.mutedForeground }}>Ajouter ce souvenir</Text>
            </Pressable>
            <Pressable disabled={photoBusy} onPress={() => { setMomentEditing(false); setPickingPoint(false); }}><Text style={{ color: colors.mutedForeground }}>Annuler</Text></Pressable>
          </View>
        </View>}
        <Pressable testID="save-activity-review" disabled={saving} onPress={() => { void leave(false); }}
          style={[s.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>Enregistrer</Text>}
        </Pressable>
        <Pressable disabled={saving} onPress={() => { void leave(true); }} style={s.button}><Text style={{ color: colors.mutedForeground }}>Passer sans rien ajouter</Text></Pressable>
      </KeyboardAwareScrollViewCompat>}
      {trip && <ActivityPhotoPicker
        visible={photoPickerVisible} startTime={trip.startTime} endTime={trip.endTime} busy={photoBusy} multiple={photoPickerMode === 'batch'}
        onClose={() => { if (!photoBusyRef.current) setPhotoPickerVisible(false); }}
        onPick={assets => { void pickSuggestedPhotos(assets); }}
        onBrowse={() => { void pickPhoto(); }}
      />}
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
