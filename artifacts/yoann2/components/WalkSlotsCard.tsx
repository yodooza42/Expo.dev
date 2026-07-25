import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColors } from '@/hooks/useColors';
import { loadMariePlanning } from '@/utils/marieStorage';
import {
  computeWalkSlots,
  durationLabel,
  enrichSlotsWithWeather,
  minsToStr,
  type HourlyWeather,
  type WalkSlot,
} from '@/utils/walkSlots';
import { getWidgetSettings } from '@/widgets/widgetSettings';

// Coordonnées maison (Saint-Aigulin)
const HOME_LAT = 45.1563;
const HOME_LON = -0.0135;

const WEATHER_API = `https://api.open-meteo.com/v1/forecast?latitude=${HOME_LAT}&longitude=${HOME_LON}&hourly=weathercode,temperature_2m,precipitation_probability&timezone=Europe%2FParis&forecast_days=15`;

function scoreColor(score: number | undefined): string {
  if (score === undefined) return '#9E9E9E';
  if (score >= 3) return '#4CAF50';
  if (score >= 2) return '#8BC34A';
  if (score >= 1) return '#FF9800';
  return '#F44336';
}

function scoreBg(score: number | undefined): string {
  const c = scoreColor(score);
  return c + '18';
}

export function WalkSlotsCard() {
  const colors = useColors();
  const [slots, setSlots]     = useState<WalkSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const [settings, planning] = await Promise.all([
          getWidgetSettings(),
          loadMariePlanning(),
        ]);

        let computed = computeWalkSlots(settings.workSchedule, planning, 14);
        if (active) setSlots(computed);

        // Fetch météo Open-Meteo
        const res = await fetch(WEATHER_API);
        if (res.ok && active) {
          const data = await res.json() as { hourly: HourlyWeather };
          computed = enrichSlotsWithWeather(computed, data.hourly);
          if (active) setSlots(computed);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, []));

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="paw" size={15} color="#4CAF50" />
          <Text style={[styles.title, { color: colors.foreground }]}>Prochaines balades</Text>
        </View>
        {!loading && slots.length > 0 && (
          <Text style={[styles.count, { color: colors.mutedForeground }]}>
            {slots.length} créneau{slots.length > 1 ? 'x' : ''}
          </Text>
        )}
        {loading && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* ── Aucun créneau ── */}
      {!loading && slots.length === 0 && (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Aucun créneau trouvé sur 14 jours
        </Text>
      )}

      {/* ── Carrousel horizontal ── */}
      {slots.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {slots.map(slot => {
            const sc = slot.weather?.score;
            const borderC = scoreColor(sc);
            const bgC     = scoreBg(sc);

            return (
              <View
                key={`${slot.date}-${slot.slotStartMins}`}
                style={[styles.slotCard, { backgroundColor: bgC, borderColor: borderC + '60' }]}
              >
                {/* Barre colorée top */}
                <View style={[styles.topBar, { backgroundColor: borderC }]} />

                {/* Jour */}
                <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>
                  {slot.dateLabel}
                </Text>

                {/* Plage horaire */}
                <Text style={[styles.timeRange, { color: colors.foreground }]}>
                  {minsToStr(slot.slotStartMins)}
                  <Text style={[styles.arrow, { color: colors.mutedForeground }]}> → </Text>
                  {slot.slotEndMins >= 1440 ? '00h00' : minsToStr(slot.slotEndMins)}
                </Text>

                {/* Durée */}
                <View style={[styles.durBadge, { backgroundColor: '#4CAF5025' }]}>
                  <MaterialCommunityIcons name="timer-outline" size={10} color="#4CAF50" />
                  <Text style={styles.durText}>{durationLabel(slot.durationMins)}</Text>
                </View>

                {/* Météo */}
                {slot.weather ? (
                  <View style={styles.wxRow}>
                    <Text style={styles.wxEmoji}>{slot.weather.emoji}</Text>
                    <View style={styles.wxDetails}>
                      <Text style={[styles.wxTemp, { color: colors.foreground }]}>
                        {slot.weather.tempC}°C
                      </Text>
                      <Text style={[styles.wxRain, {
                        color: slot.weather.rainProb > 40 ? '#2196F3' : colors.mutedForeground,
                      }]}>
                        💧{slot.weather.rainProb}%
                      </Text>
                    </View>
                  </View>
                ) : (
                  loading
                    ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginTop: 8 }} />
                    : <Text style={[styles.wxMissing, { color: colors.mutedForeground }]}>—</Text>
                )}

                {/* Label météo */}
                {slot.weather && (
                  <Text style={[styles.wxLabel, { color: scoreColor(sc) }]} numberOfLines={1}>
                    {slot.weather.label}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 14,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title:  { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  count:  { fontSize: 11, fontFamily: 'Inter_400Regular' },

  criteria: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 14,
    marginBottom: 12,
  },

  empty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  scroll: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },

  slotCard: {
    width: 130,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 10,
  },

  topBar: {
    height: 4,
    width: '100%',
    marginBottom: 10,
  },

  dayLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 10,
    marginBottom: 4,
  },

  timeRange: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  arrow: { fontFamily: 'Inter_400Regular' },

  durBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#4CAF50',
  },

  wxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  wxEmoji:   { fontSize: 22 },
  wxDetails: { gap: 1 },
  wxTemp:    { fontSize: 13, fontFamily: 'Inter_700Bold' },
  wxRain:    { fontSize: 10, fontFamily: 'Inter_400Regular' },
  wxMissing: { fontSize: 12, paddingHorizontal: 10, marginTop: 8 },

  wxLabel: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 10,
  },
});
