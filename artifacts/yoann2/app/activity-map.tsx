import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActivityMapView from '@/components/ActivityMapView';
import { SubPageHeader } from '@/components/SubPageHeader';
import { useColors } from '@/hooks/useColors';
import type { ActivityKind, Trip, Vehicle } from '@/types/trips';
import { ACTIVITIES, activityForTrip, activityInfo, activityParticipants, filterActivities } from '@/utils/activities';
import { activityMapHtml } from '@/utils/activityMapHtml';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';
import { tripEvents } from '@/utils/tripEvents';

export default function ActivityMapScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const [participant, setParticipant] = useState('all');
  const [loaded, setLoaded] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      const [saved, settings] = await Promise.all([getTrips(), getVehicleSettings()]);
      if (active) {
        setTrips(saved.sort((a, b) => b.startTime - a.startTime));
        setVehicles(settings);
        setLoaded(true);
      }
    };
    void load();
    const unsubscribe = tripEvents.onTripUpdated(() => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, []));
  const filtered = useMemo(() => filterActivities(trips, vehicles, kind, participant), [trips, vehicles, kind, participant]);
  const participants = useMemo(() => activityParticipants(vehicles), [vehicles]);
  const html = useMemo(() => activityMapHtml(filtered, vehicles, colors.background), [filtered, vehicles, colors.background]);
  const mappedCount = filtered.filter(trip => (trip.route?.length ?? 0) >= 2).length;
  const openTrip = useCallback((id: string) => {
    if (filtered.some(trip => trip.id === id)) router.push({ pathname: '/trip-map', params: { id } });
  }, [filtered, router]);
  const chip = (key: string, label: string, selected: boolean, onPress: () => void) =>
    <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={[s.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card }]}>
      <Text style={{ color: selected ? colors.primaryForeground : colors.foreground }}>{label}</Text>
    </Pressable>;
  return <View style={[s.root, { backgroundColor: colors.background }]}>
    <SubPageHeader title="Carte des activités" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.row}>
      {chip('all', 'Toutes', kind === 'all', () => setKind('all'))}
      {ACTIVITIES.map(activity => chip(activity.key, activity.label, kind === activity.key, () => setKind(activity.key)))}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters} contentContainerStyle={s.row}>
      {chip('all', 'Tous', participant === 'all', () => setParticipant('all'))}
      {chip('solo', 'Solo (0–1 personne)', participant === 'solo', () => setParticipant('solo'))}
      {participants.map(person => chip(person.id, person.name, participant === person.id, () => setParticipant(person.id)))}
    </ScrollView>
    {!loaded ? <ActivityIndicator style={{ flex: 1 }} color={colors.primary} /> : <>
      <Text style={[s.summary, { color: colors.mutedForeground }]}>
        {filtered.length} activité{filtered.length > 1 ? 's' : ''} · {filtered.reduce((sum, trip) => sum + trip.distanceKm, 0).toFixed(1)} km
        {mappedCount < filtered.length ? ` · ${filtered.length - mappedCount} sans tracé GPS` : ''}
      </Text>
      <View style={s.map}>
        {mappedCount > 0 ? <ActivityMapView html={html} onTripPress={openTrip} />
          : <Text style={{ color: colors.mutedForeground, padding: 24, textAlign: 'center' }}>
            {filtered.length ? 'Ces activités n’ont pas de tracé GPS enregistré.' : 'Aucune activité pour ces filtres.'}
          </Text>}
      </View>
      <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        {filtered.map(trip => {
          const info = activityInfo(activityForTrip(trip, vehicles)!);
          const names = (trip.walkParticipants ?? []).map(id => participants.find(person => person.id === id)?.name).filter(Boolean);
          return <Pressable key={trip.id} onPress={() => openTrip(trip.id)}
            style={[s.item, { borderBottomColor: colors.border }]}>
            <MaterialCommunityIcons name={info.icon} size={22} color={info.color} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>{trip.activityFavorite ? '★ ' : ''}{trip.activityTitle || info.label}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {new Date(trip.startTime).toLocaleDateString('fr-FR')} · {names.join(', ') || 'Participants non renseignés'}
              </Text>
            </View>
            <Text style={{ color: colors.foreground }}>{trip.distanceKm.toFixed(1)} km</Text>
          </Pressable>;
        })}
        <Pressable onPress={() => router.push(vehicles.some(vehicle => vehicle.type === 'walk') ? '/trip/new?vehicleType=walk' as any : '/vehicle-settings')}
          style={[s.add, { borderColor: colors.border }]}>
          <Text style={{ color: colors.primary }}>{vehicles.some(vehicle => vehicle.type === 'walk') ? 'Ajouter une activité manuellement' : 'Configurer les activités'}</Text>
        </Pressable>
      </ScrollView>
    </>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  filters: { flexGrow: 0, maxHeight: 48 },
  row: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  summary: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12 },
  map: { flex: 1, minHeight: 180 },
  list: { flexGrow: 0, maxHeight: '34%' },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  add: { margin: 12, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
});
