import { Tabs } from 'expo-router';
import React from 'react';

import { CustomTabBar } from '@/components/CustomTabBar';
import { useColors } from '@/hooks/useColors';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
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
