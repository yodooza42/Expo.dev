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
  index:      'clipboard-list-outline',
  accueil:    'home-outline',
  projects:   'folder-multiple-outline',
  kanban:     'view-column-outline',
  expenses:   'bank-outline',
  calendar:   'calendar-month-outline',
  trips:      'road-variant',
  navigation: 'navigation-variant-outline',
  map:        'map-outline',
};

const TAB_LABELS: Record<string, string> = {
  index:      'Bureau',
  accueil:    'Accueil',
  projects:   'Projets',
  kanban:     'Kanban',
  expenses:   'Finance',
  calendar:   'Calendrier',
  trips:      'Trajets',
  navigation: 'Y aller',
  map:        'Carte',
};

const HIDDEN_TABS = ['settings', 'map', 'navigation', 'projects', 'kanban'];

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
