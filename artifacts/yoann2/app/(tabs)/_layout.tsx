import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { CustomTabBar } from '@/components/CustomTabBar';
import { useColors } from '@/hooks/useColors';

export const unstable_settings = {
  initialRouteName: 'accueil',
};

function BackGuard() {
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const currentTab = (segments[segments.length - 1] ?? '') as string;
    const isHome = currentTab === 'accueil' || currentTab === '(tabs)';

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isHome) {
        router.replace('/(tabs)/accueil' as any);
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [segments, router]);

  return null;
}

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      initialRouteName="accueil"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="expenses" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="accueil" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="player" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ href: null }} />
      <Tabs.Screen name="projects" options={{ href: null }} />
      <Tabs.Screen name="kanban" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
