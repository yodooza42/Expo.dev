import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { CustomTabBar } from '@/components/CustomTabBar';
import { useColors } from '@/hooks/useColors';

export const unstable_settings = {
  initialRouteName: 'index',
};

function BackGuard() {
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const currentTab = (segments[segments.length - 1] ?? '') as string;
    const isHome = currentTab === 'index' || currentTab === '(tabs)';

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isHome) {
        router.replace('/(tabs)/' as any);
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
      initialRouteName="index"
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="map" options={{ href: null }} />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="kanban" />
      <Tabs.Screen name="expenses" />
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="navigation" />
      <Tabs.Screen name="index" />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
