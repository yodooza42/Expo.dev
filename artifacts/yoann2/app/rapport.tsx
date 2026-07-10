import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { SubPageHeader } from '@/components/SubPageHeader';
import { fmtEuro } from '@/utils/money';

type Period = 'weekly' | 'monthly';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function RapportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { projects, tasks, transactions, appointments } = useApp();
  const [period, setPeriod] = useState<Period>('weekly');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const stats = useMemo(() => {
    const days = period === 'weekly' ? 7 : 30;
    const since = daysAgo(days);
    const now = new Date();

    const tasksCompleted = tasks.filter(t => {
      if (t.status !== 'done') return false;
      const d = new Date(t.createdAt);
      return d >= since;
    }).length;

    const tasksOverdue = tasks.filter(t => {
      if (t.status === 'done') return false;
      return t.dueDate && new Date(t.dueDate) < now;
    }).length;

    const newExpenses = transactions.filter(t => t.type === 'expense' && new Date(t.date) >= since);
    const expensesTotal = newExpenses.reduce((s, t) => s + t.amount, 0);
    const expensesCount = newExpenses.length;

    const projectsUpdated = projects.filter(p => {
      if (p.archived) return false;
      return new Date(p.updatedAt) >= since;
    }).length;

    const appointmentsCount = appointments.filter(a => {
      const d = new Date(a.date);
      return d >= since && d <= now;
    }).length;

    const newTasks = tasks.filter(t => new Date(t.createdAt) >= since).length;

    const expByCategory = newExpenses.reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {});

    const topCategories = Object.entries(expByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const tasksByPriority = {
      critical: tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length,
      high: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length,
    };

    return {
      tasksCompleted,
      tasksOverdue,
      expensesTotal,
      expensesCount,
      projectsUpdated,
      appointmentsCount,
      newTasks,
      topCategories,
      tasksByPriority,
    };
  }, [period, tasks, transactions, projects, appointments]);

  const periodLabel = period === 'weekly' ? '7 derniers jours' : '30 derniers jours';

  function StatRow({ icon, label, value, accent, sub }: { icon: string; label: string; value: string | number; accent?: string; sub?: string }) {
    const ic = accent ?? colors.primary;
    return (
      <View style={[styles.statRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.statIcon, { backgroundColor: ic + '20' }]}>
          <MaterialCommunityIcons name={icon as any} size={18} color={ic} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
          {sub && <Text style={[styles.statSub, { color: colors.mutedForeground }]}>{sub}</Text>}
        </View>
        <Text style={[styles.statValue, { color: ic }]}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SubPageHeader title="Rapports" />

      <View style={[styles.segmented, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(['weekly', 'monthly'] as Period[]).map(p => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[
              styles.segBtn,
              period === p && { backgroundColor: colors.primary },
            ]}
          >
            <Text style={[
              styles.segLabel,
              { color: period === p ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {p === 'weekly' ? '📅 Hebdo' : '📆 Mensuel'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.periodLabel, { color: colors.mutedForeground }]}>{periodLabel}</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Tâches</Text>
          <StatRow icon="check-circle-outline" label="Terminées" value={stats.tasksCompleted} accent="#4CAF50" />
          <StatRow icon="plus-circle-outline" label="Créées" value={stats.newTasks} accent="#2196F3" />
          <StatRow icon="clock-alert-outline" label="En retard" value={stats.tasksOverdue} accent={colors.destructive}
            sub="total courant" />
          <StatRow icon="alert-circle-outline" label="Critiques actives" value={stats.tasksByPriority.critical} accent="#E91E63" />
          <StatRow icon="alert-outline" label="Haute priorité actives" value={stats.tasksByPriority.high} accent="#FF9800" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Dépenses</Text>
          <StatRow icon="receipt" label="Enregistrées" value={stats.expensesCount} />
          <StatRow
            icon="cash-multiple"
            label="Total"
            value={fmtEuro(stats.expensesTotal)}
            accent={colors.primary}
          />
        </View>

        {stats.topCategories.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Top catégories de dépenses</Text>
            {stats.topCategories.map(([cat, amt], i) => (
              <StatRow
                key={cat}
                icon="tag-outline"
                label={cat}
                value={fmtEuro(amt)}
                accent={(['#FFC107', '#FF9800', '#2196F3'] as string[])[i] ?? colors.primary}
              />
            ))}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Projets & Agenda</Text>
          <StatRow icon="folder-edit-outline" label="Projets mis à jour" value={stats.projectsUpdated} />
          <StatRow icon="calendar-check-outline" label="RDV passés" value={stats.appointmentsCount} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  segmented: {
    flexDirection: 'row',
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  periodLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 12,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  statSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  statValue: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
});
