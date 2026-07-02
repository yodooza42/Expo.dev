import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TripTagModal } from '@/components/TripTagModal';
import { AppProvider } from '@/contexts/AppContext';
import { SplashProvider } from '@/contexts/SplashContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Trip, VehicleType } from '@/types/trips';
import { isTrackingPaused, purgeOldData, requestLocationPermissions, startTracking } from '@/utils/locationTracking';
import {
  computeOdometer,
  getTrips,
  getVehicleSettings,
  purgeOldTrips,
  updateTrip,
} from '@/utils/tripStorage';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

async function bootstrapLocationTracking() {
  purgeOldData().catch(() => {});
  purgeOldTrips(90).catch(() => {});

  try {
    const fg = await import('expo-location').then(m => m.getForegroundPermissionsAsync());
    if (fg.status !== 'granted') {
      const granted = await requestLocationPermissions();
      if (!granted) return;
    } else {
      const bg = await import('expo-location').then(m => m.getBackgroundPermissionsAsync());
      if (bg.status !== 'granted') {
        const granted = await requestLocationPermissions();
        if (!granted) return;
      }
    }
    const paused = await isTrackingPaused();
    if (!paused) await startTracking();
  } catch {
    // silently ignore — tracking is optional
  }
}

function RootLayoutNav() {
  const router = useRouter();
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null);
  const checkingRef = useRef(false);

  const checkPendingTrips = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const trips = await getTrips();
      const first = trips.find(t => t.vehicle === null) ?? null;
      setPendingTrip(first);
    } catch {
      // ignore
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    bootstrapLocationTracking();
    checkPendingTrips();
  }, [checkPendingTrips]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') checkPendingTrips();
    });
    return () => sub.remove();
  }, [checkPendingTrips]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const url = data?.url as string | undefined;
      if (url) router.push(url as any);
    });
    return () => sub.remove();
  }, [router]);

  async function handleTag(vehicle: VehicleType) {
    if (!pendingTrip) return;
    const tripId = pendingTrip.id;
    setPendingTrip(null);

    await updateTrip(tripId, { vehicle });

    if (vehicle !== 'ignored') {
      try {
        const [trips, settings] = await Promise.all([getTrips(), getVehicleSettings()]);
        const updatedTrips = trips.map(t => t.id === tripId ? { ...t, vehicle } : t);
        const config = settings[vehicle];
        const odometer = computeOdometer(updatedTrips, vehicle, config.odometerBaseKm);
        const overdue = config.maintenanceItems.filter(
          item => odometer - item.lastResetKm >= item.intervalKm,
        );
        if (overdue.length > 0) {
          const lines = overdue.map(item => {
            const kmOver = Math.round(odometer - item.lastResetKm - item.intervalKm);
            return `• ${item.name} — +${kmOver} km dépassés`;
          });
          Alert.alert(
            '⚠️ Entretien requis',
            lines.join('\n'),
            [{ text: 'OK', style: 'default' }],
          );
        }
      } catch {}
    }

    // Check for next pending trip
    await checkPendingTrips();
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#121212' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="project/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="task/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="appointment/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="appointment/[id]" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen
          name="voice"
          options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen name="marie" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="anna" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="vehicle-settings" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
      <TripTagModal trip={pendingTrip} onTag={handleTag} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <SplashProvider>
                  <AppProvider>
                    <RootLayoutNav />
                  </AppProvider>
                </SplashProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
