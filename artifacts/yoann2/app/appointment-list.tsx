import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function formatDateFR(isoDate: string): string {
  const d = new Date(isoDate);
  const dayName = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][d.getDay()];
  return `${dayName} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export default function AppointmentListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { appointments } = useApp();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = useMemo(() =>
    [...appointments]
      .filter(a => new Date(a.date) >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [appointments],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Rendez-vous" />

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun rendez-vous</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {sorted.map(appt => (
            <Pressable
              key={appt.id}
              onPress={() => router.push(`/appointment/${appt.id}` as any)}
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderLeftColor: appt.fromMarie ? '#EC4899' : '#7C3AED',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemDate, { color: colors.mutedForeground }]}>
                  {formatDateFR(appt.date)}{appt.time ? ` · ${appt.time}` : ''}
                </Text>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {appt.title}
                </Text>
                {appt.fromMarie && (
                  <Text style={[styles.itemSub, { color: '#EC4899' }]}>
                    <MaterialCommunityIcons name="heart-outline" size={11} /> Marie
                  </Text>
                )}
                {appt.location ? (
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    <MaterialCommunityIcons name="map-marker-outline" size={11} /> {appt.location}
                  </Text>
                ) : null}
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  scroll: { padding: 16, gap: 10 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 12, borderWidth: 1, borderLeftWidth: 4,
  },
  itemDate: { fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 3 },
  itemTitle: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  itemSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
