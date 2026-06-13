import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const TAB_ICONS: Record<string, string> = {
  index: 'view-dashboard-outline',
  projects: 'folder-multiple-outline',
  kanban: 'view-column-outline',
  calendar: 'calendar-month-outline',
  settings: 'cog-outline',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Accueil',
  projects: 'Projets',
  kanban: 'Kanban',
  calendar: 'Agenda',
  settings: 'Réglages',
};

export function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);
  const fabRotation = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  const isWeb = Platform.OS === 'web';
  const bottomPad = isWeb ? 8 : insets.bottom;
  const tabBarHeight = 56 + bottomPad;
  const FAB_OFFSET = 28;

  function toggleFab() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const opening = !fabOpen;
    setFabOpen(opening);
    fabRotation.value = withSpring(opening ? 45 : 0, { damping: 15 });
    overlayOpacity.value = withTiming(opening ? 1 : 0, { duration: 180 });
  }

  function closeFab() {
    setFabOpen(false);
    fabRotation.value = withSpring(0, { damping: 15 });
    overlayOpacity.value = withTiming(0, { duration: 180 });
  }

  const fabIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${fabRotation.value}deg` }],
  }));

  function navigateTo(path: string) {
    closeFab();
    setTimeout(() => router.push(path as any), 100);
  }

  const tabs = state.routes;

  return (
    <>
      {fabOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: 'rgba(0,0,0,0.65)' }]}
          onPress={closeFab}
        />
      )}

      {fabOpen && (
        <View
          style={[
            styles.fabMenu,
            { bottom: tabBarHeight + FAB_OFFSET + 8 },
          ]}
        >
          {[
            { label: 'Nouveau projet', icon: 'folder-plus-outline', path: '/project/new' },
            { label: 'Nouvelle tâche', icon: 'plus-circle-outline', path: '/task/new' },
          ].map((item, i) => (
            <Pressable
              key={i}
              onPress={() => navigateTo(item.path)}
              style={({ pressed }) => [
                styles.fabMenuItem,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.8 },
              ]}
            >
              <MaterialCommunityIcons name={item.icon as any} size={20} color={colors.primary} />
              <Text style={[styles.fabMenuLabel, { color: colors.foreground }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: bottomPad,
            height: tabBarHeight + FAB_OFFSET,
          },
        ]}
      >
        <View style={styles.tabRow}>
          {tabs.map((route: any, index: number) => {
            const isFocused = state.index === index;
            const isMiddle = index === 2;
            const routeName = route.name;
            const iconName = TAB_ICONS[routeName] ?? 'circle';
            const label = TAB_LABELS[routeName] ?? routeName;
            const iconColor = isFocused ? colors.primary : colors.mutedForeground;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                style={[styles.tabItem, isMiddle && styles.middleTab]}
              >
                <MaterialCommunityIcons name={iconName as any} size={22} color={iconColor} />
                <Text style={[styles.tabLabel, { color: iconColor }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={toggleFab}
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Animated.View style={fabIconStyle}>
            <MaterialCommunityIcons name="plus" size={28} color={colors.primaryForeground} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    position: 'relative',
    alignItems: 'stretch',
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
  middleTab: {
    paddingTop: 26,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  fab: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    top: -27,
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 5,
  },
  fabMenu: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 20,
    gap: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fabMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMenuLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
