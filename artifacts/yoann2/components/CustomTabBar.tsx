import * as Haptics from 'expo-haptics';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

const TAB_IMAGES: Record<string, ReturnType<typeof require>> = {
  index:    require('@/assets/images/icon_acceuil.png'),
  calendar: require('@/assets/images/icon_rdv.png'),
  kanban:   require('@/assets/images/icon_tache.png'),
  projects: require('@/assets/images/icon_idee.png'),
  expenses: require('@/assets/images/icon_reset.png'),
};

const HIDDEN_TABS = ['settings'];

export function CustomTabBar({ state, navigation }: TabBarProps) {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const isWeb     = Platform.OS === 'web';
  const bottomPad = isWeb ? 8 : insets.bottom;

  const currentRouteName: string = state.routes[state.index]?.name ?? '';

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.card,
          borderTopColor:  colors.border,
          paddingBottom:   bottomPad,
          height:          52 + bottomPad,
        },
      ]}
    >
      <View style={styles.tabRow}>
        {state.routes
          .filter((route: any) => !HIDDEN_TABS.includes(route.name))
          .map((route: any) => {
            const isFocused = currentRouteName === route.name;
            const imgSource = TAB_IMAGES[route.name];

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
                {imgSource ? (
                  <Image
                    source={imgSource}
                    style={[styles.tabIcon, { opacity: isFocused ? 1 : 0.35 }]}
                    resizeMode="contain"
                  />
                ) : null}
              </Pressable>
            );
          })}
      </View>
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
    height: 52,
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabIcon: {
    width: 30,
    height: 30,
  },
});
