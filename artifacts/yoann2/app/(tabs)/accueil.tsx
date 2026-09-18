import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';
import { computeCurrentBalance, getTransactions } from '@/utils/bankStorage';
import { getTodayEntries } from '@/utils/consumptionStorage';
import { fmtEuro } from '@/utils/money';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';
import type { WidgetData } from '@/widgets/data';
import { getWidgetDataFromStorage } from '@/widgets/data';
import { WalkSlotsCard } from '@/components/WalkSlotsCard';

const DAYS_FR   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                   'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export default function AccueilScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const [wData,        setWData]        = useState<WidgetData | null>(null);
  const [monthBalance, setMonthBalance] = useState<number | null>(null);
  const [allBalance,   setAllBalance]   = useState<number | null>(null);
  const [monthKm,      setMonthKm]      = useState<number | null>(null);
  const [todayCoffee,  setTodayCoffee]  = useState(0);
  const [todayCigs,    setTodayCigs]    = useState(0);
  const [walkAlerts,   setWalkAlerts]   = useState<Array<{ name: string; vehicleName: string; daysSince: number | null }>>([]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      const [wd, txs, trips, todayEntries, vehicles] = await Promise.all([
        getWidgetDataFromStorage(),
        getTransactions(),
        getTrips(),
        getTodayEntries(),
        getVehicleSettings(),
      ]);
      if (!active) return;

      setWData(wd);
      setTodayCoffee(todayEntries.filter(e => e.type === 'coffee').length);
      setTodayCigs(todayEntries.filter(e => e.type === 'cigarette').length);
      setAllBalance(computeCurrentBalance(txs));

      const now          = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const monthNet = txs
        .filter(t => new Date(t.date).getTime() >= startOfMonth)
        .reduce((s, t) => {
          if (t.type === 'income') return s + t.amount;
          if (t.type === 'expense') return s - t.amount;
          return s;
        }, 0);
      setMonthBalance(monthNet);

      const monthTrips = trips.filter(
        t => t.endTime >= startOfMonth && t.vehicle && t.vehicle !== 'ignored',
      );
      setMonthKm(monthTrips.reduce((s, t) => s + t.distanceKm, 0));

      // Walk alerts for dogs
      const alerts: Array<{ name: string; vehicleName: string; daysSince: number | null }> = [];
      const nowMs = Date.now();
      for (const v of vehicles) {
        if (v.type !== 'walk') continue;
        for (const p of v.walkParticipants ?? []) {
          if (p.type !== 'dog' || !p.reminderDays) continue;
          const lastTrip = trips
            .filter(t => t.vehicle === v.id && (t.walkParticipants ?? []).includes(p.id))
            .sort((a, b) => b.endTime - a.endTime)[0];
          const lastTs = lastTrip?.endTime ?? null;
          if (!lastTs || (nowMs - lastTs) > p.reminderDays * 24 * 3_600_000) {
            const daysSince = lastTs ? Math.round((nowMs - lastTs) / (24 * 3_600_000)) : null;
            alerts.push({ name: p.name, vehicleName: v.name, daysSince });
          }
        }
      }
      setWalkAlerts(alerts);
    })();
    return () => { active = false; };
  }, []));

  const today    = new Date();
  const dayLabel = `${DAYS_FR[today.getDay()]} ${today.getDate()} ${MONTHS_FR[today.getMonth()]}`;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.foreground }]}>Bonjour Yoann</Text>
          <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{dayLabel}</Text>
        </View>
        <View style={styles.rowCenter}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/counters' as any); }}
            style={styles.counterBadges}
          >
            <Text style={[styles.counterText, { color: '#A1887F' }]}>☕ {todayCoffee}</Text>
            <Text style={[styles.counterText, { color: '#90A4AE' }]}>🚬 {todayCigs}</Text>
          </Pressable>
          {wData && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); router.push('/marie'); }}
              style={[styles.marieCircle, { backgroundColor: wData.marieCircleColor as any }]}
            >
              <Text style={styles.marieDay}>{today.getDate()}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Actions rapides ── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Actions rapides</Text>
      {/* Rangée 1 : Courses / Balade / RDV */}
      <View style={styles.rowPad}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: '#FF980012', borderColor: '#FF980040' }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/shopping-list' as any); }}
        >
          <MaterialCommunityIcons name="cart-outline" size={26} color="#FF9800" />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: '#4CAF5012', borderColor: '#4CAF5040' }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/trip/new?vehicleType=walk' as any); }}
        >
          <MaterialCommunityIcons name="walk" size={26} color="#4CAF50" />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/appointment/new' as any); }}
        >
          <MaterialCommunityIcons name="calendar-plus" size={26} color="#2196F3" />
        </Pressable>
      </View>
      {/* Rangée 2 : Dépense / Tâche / Plein */}
      <View style={[styles.rowPad, { marginBottom: 16 }]}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/expenses?add=1' as any); }}
        >
          <MaterialCommunityIcons name="plus-circle-outline" size={26} color="#4CAF50" />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/task/new' as any); }}
        >
          <MaterialCommunityIcons name="playlist-plus" size={26} color={colors.primary} />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: '#2196F312', borderColor: '#2196F340' }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/fuel-log?add=1' as any); }}
        >
          <MaterialCommunityIcons name="gas-station" size={26} color="#2196F3" />
        </Pressable>
      </View>

      {/* ── Travail + Nanny ── */}
      {wData && (
        <View style={[styles.card, styles.cardFull, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.between}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="briefcase-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginLeft: 6 }]}>Aujourd'hui</Text>
            </View>
            <Text style={[styles.workLabel, {
              color: wData.todayWork === 'Repos' ? colors.mutedForeground : colors.primary,
            }]}>
              {wData.todayWork}
            </Text>
          </View>
          {wData.nounouName ? (
            <View style={[styles.between, styles.nounouRow, { borderTopColor: colors.border }]}>
              <View style={styles.rowCenter}>
                <MaterialCommunityIcons name="account-heart-outline" size={15} color={wData.nounouColor as any} />
                <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginLeft: 6 }]}>
                  {wData.nounouName}
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: wData.nounouColor as any }]}>
                {wData.nounouPeriod} · {wData.nounouDuration}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Prochaines balades possibles ── */}
      <WalkSlotsCard />

      {/* ── Rappels balades ── */}
      {walkAlerts.length > 0 && (
        <View style={[styles.card, styles.cardFull, { backgroundColor: colors.card, borderColor: '#FF9800' }]}>
          <Pressable style={styles.between} onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/trips'); }}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="walk" size={15} color="#FF9800" />
              <Text style={[styles.cardLabel, { color: '#FF9800', marginLeft: 6 }]}>Balades</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#FF9800" />
          </Pressable>
          {walkAlerts.map((a, i) => (
            <View
              key={i}
              style={[styles.taskRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={[styles.taskDot, { backgroundColor: '#FF9800' }]} />
              <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={[styles.cardSub, { color: '#FF9800' }]}>
                {a.daysSince !== null ? `${a.daysSince}j sans sortie` : 'Jamais sorti'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Tâches prioritaires ── */}
      {wData && wData.tasks.length > 0 && (
        <View style={[styles.card, styles.cardFull, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable style={styles.between} onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/kanban'); }}>
            <View style={styles.rowCenter}>
              <MaterialCommunityIcons name="checkbox-marked-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginLeft: 6 }]}>Tâches</Text>
            </View>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              {wData.tasks.length} en cours
            </Text>
          </Pressable>
          {wData.tasks.slice(0, 3).map((t, i) => (
            <View
              key={t.id}
              style={[styles.taskRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={[styles.taskDot, { backgroundColor: t.color as any }]} />
              <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={1}>
                {t.title}
              </Text>
              {t.deadline ? (
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{t.deadline}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* ── Prochain RDV ── */}
      {wData && wData.widgetAppts.length > 0 && (
        <Pressable
          style={[styles.card, styles.cardFull, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/calendar'); }}
        >
          <View style={styles.rowCenter}>
            <MaterialCommunityIcons name="calendar-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.cardLabel, { color: colors.mutedForeground, marginLeft: 6 }]}>Prochain RDV</Text>
          </View>
          <Text style={[styles.apptTitle, { color: colors.foreground }]} numberOfLines={1}>
            {wData.widgetAppts[0]!.title}
          </Text>
          <Text style={[styles.apptWhen, { color: colors.primary }]}>
            {wData.widgetAppts[0]!.when}
          </Text>
        </Pressable>
      )}

      {/* ── Finance + Trajets ── */}
      <View style={styles.rowPad}>
        <Pressable
          style={[styles.card, styles.cardHalf, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/expenses'); }}
        >
          <MaterialCommunityIcons name="bank-outline" size={18} color={colors.mutedForeground} />
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Ce mois</Text>
          <Text style={[styles.cardValue, {
            color: (monthBalance ?? 0) >= 0 ? '#4CAF50' : '#EF4444',
          }]}>
            {monthBalance !== null ? fmtEuro(monthBalance) : '—'}
          </Text>
          {allBalance !== null && (
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Solde : {fmtEuro(allBalance)}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.card, styles.cardHalf, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/trips'); }}
        >
          <MaterialCommunityIcons name="road" size={18} color={colors.mutedForeground} />
          <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Km ce mois</Text>
          <Text style={[styles.cardValue, { color: '#2196F3' }]}>
            {monthKm !== null ? `${monthKm.toFixed(0)} km` : '—'}
          </Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  greeting:  { fontSize: 24, fontFamily: 'Inter_700Bold' },
  dateLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  marieCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  marieDay:  { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  rowPad:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  between:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  card:      { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHalf:  { flex: 1 },
  cardFull:  { marginHorizontal: 16 },
  cardLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4 },
  cardValue: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 4 },
  cardSub:   { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  workLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  nounouRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  apptTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  apptWhen:  { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  taskRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  taskDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  taskTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 16, marginBottom: 8, marginTop: 4,
    color: '#9E9E9E',
  },
  actionBtn: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center', gap: 6,
  },
  actionLabel:    { fontSize: 12, fontFamily: 'Inter_500Medium' },
  counterBadges:  { flexDirection: 'column', alignItems: 'flex-end', marginRight: 10, gap: 2 },
  counterText:    { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
