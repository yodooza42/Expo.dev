import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const TAB_ICONS: Record<string, string> = {
  bureau:     'clipboard-list-outline',
  accueil:    'home',
  projects:   'folder-multiple-outline',
  kanban:     'view-column-outline',
  expenses:   'bank-outline',
  calendar:   'calendar-month-outline',
  trips:      'road-variant',
  player:     'music-circle-outline',
  navigation: 'navigation-variant-outline',
  map:        'map-outline',
};

const TAB_LABELS: Record<string, string> = {
  bureau:     'Bureau',
  accueil:    'Accueil',
  projects:   'Projets',
  kanban:     'Kanban',
  expenses:   'Finance',
  calendar:   'Calendrier',
  trips:      'Trajets',
  player:     'Musique',
  navigation: 'Y aller',
  map:        'Carte',
};

const HIDDEN_TABS = ['settings', 'map', 'navigation', 'projects', 'kanban', 'player', 'index'];

export function CustomTabBar({ state, navigation }: TabBarProps) {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const router    = useRouter();
  const isWeb     = Platform.OS === 'web';
  const bottomPad = isWeb ? 8 : insets.bottom;

  const currentRouteName: string = state.routes[state.index]?.name ?? '';

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {/* ── Main tab row ── */}
      <View style={[styles.tabRow, { paddingBottom: bottomPad, height: 56 + bottomPad }]}>
        {state.routes
          .filter((route: any) => !HIDDEN_TABS.includes(route.name))
          .map((route: any) => {
            const isFocused  = currentRouteName === route.name;
            const isHomeTab  = route.name === 'accueil';
            const iconColor  = isHomeTab
              ? '#FFFFFF'
              : isFocused ? colors.primary : colors.mutedForeground;
            const iconName   = TAB_ICONS[route.name] ?? 'circle';
            const label      = TAB_LABELS[route.name] ?? route.name;

            if (isHomeTab) {
              return (
                <Pressable
                  key={route.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!isFocused && !event.defaultPrevented) {
                      navigation.navigate(route.name);
                    }
                  }}
                  style={styles.homeTabItem}
                >
                  {/* Raised home button */}
                  <View style={[
                    styles.homeBtn,
                    { backgroundColor: isFocused ? colors.primary : colors.mutedForeground + 'CC' },
                  ]}>
                    <MaterialCommunityIcons name={iconName as any} size={26} color="#FFFFFF" />
                  </View>
                </Pressable>
              );
            }

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
  homeTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  homeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
  },
});
