import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

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
};

const TAB_LABELS: Record<string, string> = {
  index:    'Accueil',
  projects: 'Projets',
  kanban:   'Kanban',
  expenses: 'Finances',
  calendar: 'Agenda',
};

export function CustomTabBar({ state, navigation }: TabBarProps) {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const isWeb     = Platform.OS === 'web';
  const bottomPad = isWeb ? 8 : insets.bottom;

  const HIDDEN_TABS = ['settings'];
  const currentRouteName: string = state.routes[state.index]?.name ?? '';

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.card,
          borderTopColor:  colors.border,
          paddingBottom:   bottomPad,
          height:          56 + bottomPad,
        },
      ]}
    >
      {/* Tab items */}
      <View style={styles.tabRow}>
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

      {/* Home button — only visible when not on the home tab */}
      {state.index !== 0 && (
        <Pressable
          onPress={() => navigation.navigate('index')}
          style={[styles.homeBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="home-variant-outline" size={20} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    justifyContent: 'flex-end',
  },
  tabRow: {
    flexDirection: 'row',
    height: 56,
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
  homeBtn: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
