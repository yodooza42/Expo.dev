import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const TAB_ICONS: Record<string, string> = {
  index:    'view-dashboard-outline',
  projects: 'folder-multiple-outline',
  kanban:   'view-column-outline',
  expenses: 'chart-line',
  calendar: 'calendar-month-outline',
  map:      'map-outline',
};

const TAB_LABELS: Record<string, string> = {
  index:    'Accueil',
  projects: 'Projets',
  kanban:   'Kanban',
  expenses: 'Finances',
  calendar: 'Agenda',
  map:      'Carte',
};

const QUICK_SHORTCUTS = [
  { key: 'work',     icon: 'briefcase-outline',    label: 'Travail',    route: '/work',            color: '#FFC107' },
  { key: 'marie',    icon: 'account-heart-outline', label: 'Marie',      route: '/marie',           color: '#FF9800' },
  { key: 'anna',     icon: 'baby-carriage',         label: 'Anna',       route: '/anna',            color: '#E91E63' },
  { key: 'settings', icon: 'cog-outline',           label: 'Paramètres', route: '/(tabs)/settings', color: '#9E9E9E' },
] as const;

const HIDDEN_TABS = ['settings'];

export function CustomTabBar({ state, navigation }: TabBarProps) {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const isWeb     = Platform.OS === 'web';
  const bottomPad = isWeb ? 8 : insets.bottom;

  const [quickOpen, setQuickOpen] = useState(false);

  const currentRouteName: string = state.routes[state.index]?.name ?? '';

  function toggleQuick() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuickOpen(v => !v);
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card, borderTopColor: colors.border }]}>

      {/* ── Quick access bar ── */}
      {quickOpen && (
        <View style={[styles.quickBar, { borderBottomColor: colors.border }]}>
          {QUICK_SHORTCUTS.map(s => (
            <Pressable
              key={s.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setQuickOpen(false);
                router.push(s.route as any);
              }}
              style={({ pressed }) => [styles.quickItem, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: s.color + '22' }]}>
                <MaterialCommunityIcons name={s.icon as any} size={20} color={s.color} />
              </View>
              <Text style={[styles.quickLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Toggle arrow (transparent, no background) ── */}
      <Pressable onPress={toggleQuick} hitSlop={16} style={styles.toggleRow}>
        <MaterialCommunityIcons
          name={quickOpen ? 'chevron-down' : 'chevron-up'}
          size={15}
          color={colors.mutedForeground + '70'}
        />
      </Pressable>

      {/* ── Main tab row ── */}
      <View style={[styles.tabRow, { paddingBottom: bottomPad, height: 50 + bottomPad }]}>
        {state.routes
          .filter((route: any) => !HIDDEN_TABS.includes(route.name))
          .map((route: any) => {
            const isFocused = currentRouteName === route.name;
            const iconColor = isFocused ? colors.primary : colors.mutedForeground;
            const iconName  = TAB_ICONS[route.name] ?? 'circle';
            const label     = TAB_LABELS[route.name] ?? route.name;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                style={styles.tabItem}
              >
                <MaterialCommunityIcons name={iconName as any} size={22} color={iconColor} />
                <Text style={[styles.tabLabel, { color: iconColor }]}>{label}</Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  toggleRow: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 12,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
  },
});
