import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/hooks/useColors';
import type { Trip, VehicleType } from '@/types/trips';

interface TripTagModalProps {
  trip: Trip | null;
  onTag: (vehicleType: VehicleType) => void;
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function TripTagModal({ trip, onTag }: TripTagModalProps) {
  const colors = useColors();

  if (!trip) return null;

  function handle(v: VehicleType) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onTag(v);
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons name="road-variant" size={28} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>Trajet terminé</Text>
          <Text style={[styles.dateLine, { color: colors.mutedForeground }]}>
            {fmtDate(trip.startTime)}
          </Text>
          <Text style={[styles.timeLine, { color: colors.mutedForeground }]}>
            {fmtTime(trip.startTime)} → {fmtTime(trip.endTime)}
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>
                {trip.distanceKm.toFixed(1)}
              </Text>
              <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>km</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>
                {fmtDuration(trip.endTime - trip.startTime)}
              </Text>
              <Text style={[styles.statUnit, { color: colors.mutedForeground }]}>durée</Text>
            </View>
          </View>

          <Text style={[styles.question, { color: colors.mutedForeground }]}>
            Quel véhicule ?
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => handle('car')}
              style={({ pressed }) => [styles.tagBtn, { backgroundColor: '#2196F3', opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialCommunityIcons name="car" size={24} color="#FFF" />
              <Text style={styles.tagLabel}>Voiture</Text>
            </Pressable>
            <Pressable
              onPress={() => handle('moto')}
              style={({ pressed }) => [styles.tagBtn, { backgroundColor: '#FF9800', opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialCommunityIcons name="motorbike" size={24} color="#FFF" />
              <Text style={styles.tagLabel}>Moto</Text>
            </Pressable>
            <Pressable
              onPress={() => handle('ignored')}
              style={({ pressed }) => [styles.tagBtn, { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 }]}
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.mutedForeground} />
              <Text style={[styles.tagLabel, { color: colors.mutedForeground }]}>Ignorer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 8,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  dateLine: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  timeLine: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    width: '100%',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 40,
  },
  statVal: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    lineHeight: 36,
  },
  statUnit: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  question: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  tagBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  tagLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFF',
  },
});
