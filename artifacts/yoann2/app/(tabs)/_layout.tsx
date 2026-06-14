import { Tabs } from 'expo-router';
import React from 'react';

import { CustomTabBar } from '@/components/CustomTabBar';
import { useColors } from '@/hooks/useColors';

export default function TabLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="projects" />
      <Tabs.Screen name="kanban" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="expenses" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
