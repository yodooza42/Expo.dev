import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Trip, Vehicle } from '@/types/trips';
import { activityForTrip, activityInfo } from '@/utils/activities';
import { ACTIVITY_FEELINGS } from '@/utils/activityReview';

export function ActivityDetails({ trip, vehicles, onEdit, onSelectType }: {
  trip: Trip;
  vehicles: Vehicle[];
  onEdit?: () => void;
  onSelectType?: () => void;
}) {
  const colors = useColors();
  const kind = activityForTrip(trip, vehicles);
  if (!kind) return null;
  const activity = activityInfo(kind);
  const feeling = ACTIVITY_FEELINGS.find(item => item.key === trip.activityFeeling)?.label;
  return <View style={{ padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        onPress={onSelectType}
        disabled={!onSelectType}
        accessibilityRole={onSelectType ? 'button' : undefined}
        accessibilityLabel={`Modifier le type d’activité : ${activity.label}`}
        hitSlop={6}
        style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.65 : 1 }]}
      >
        <MaterialCommunityIcons name={activity.icon} size={22} color={activity.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>{trip.activityFavorite ? '★ ' : ''}{trip.activityTitle || activity.label}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{activity.label}{feeling ? ` · ${feeling}` : ''}</Text>
        </View>
        {onSelectType && <MaterialCommunityIcons name="chevron-down" size={16} color={colors.mutedForeground} />}
      </Pressable>
      {onEdit && <Pressable onPress={onEdit} hitSlop={10}><Text style={{ color: colors.primary }}>Souvenirs</Text></Pressable>}
    </View>
  </View>;
}

export function ActivityMemories({ trip, vehicles }: { trip: Trip; vehicles: Vehicle[] }) {
  const colors = useColors();
  if (!activityForTrip(trip, vehicles) || !trip.activityMoments?.length) return null;
  return <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
    <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>Souvenirs</Text>
    {trip.activityMoments.map(moment => {
      const photo = trip.photos?.find(item => item.id === moment.photoId);
      return <View key={moment.id} style={{ gap: 5 }}>
        {photo && <Image source={{ uri: photo.uri }} style={{ height: 150, width: '100%', borderRadius: 10 }} />}
        <Text style={{ color: colors.foreground }}>{moment.note || 'Photo de la sortie'}</Text>
        {moment.lat != null && moment.lng != null && <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{moment.placementMethod === 'estimated' ? 'Position estimée sur le parcours' : 'Souvenir placé sur le parcours'}</Text>}
      </View>;
    })}
  </View>;
}
