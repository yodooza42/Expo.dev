import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { useRouter, Stack } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TripTagModal } from '@/components/TripTagModal';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Trip, Vehicle } from '@/types/trips';
import { rebuildBackupListFromSAF, runDailyBackupIfNeeded } from '@/utils/backup';
import { purgeOldData, requestLocationPermissions, startManualTracking, LOCATION_TASK_NAME } from '@/utils/locationTracking';
import { recoverConfiguredManualTrip } from '@/utils/manualTripRecovery';
import '@/utils/geoReminderManager'; // enregistre la tâche background geo-reminder
import { DEPARTURE_CHECK_PREFIX, rescheduleIfNeeded } from '@/utils/departureAlert';
import { isManualTripActive } from '@/utils/manualTripStorage';
import { runMaintenanceScheduler } from '@/utils/maintenanceScheduler';
import { updateTodoWidget } from '@/widgets/updateWidget';
import { tripEvents } from '@/utils/tripEvents';
import {
  computeOdometer,
  getTrips,
  getVehicleSettings,
  migrateCleanGhostRoutes,
  purgeOldTrips,
  updateTrip,
} from '@/utils/tripStorage';

// Canal Android pour les notifications de trajet (sticky, non-dismissable)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('trip', {
    name: 'Trajet en cours',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [],
    enableVibrate: false,
    showBadge: false,
  }).catch(() => {});
  // Canal silencieux pour les recalculs d'itinéraire RDV le matin
  Notifications.setNotificationChannelAsync('departure_check', {
    name: 'Vérification itinéraire RDV',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: [],
    enableVibrate: false,
    showBadge: false,
  }).catch(() => {});
}

const queryClient = new QueryClient();

async function bootstrapLocationTracking() {
  purgeOldData().catch(() => {});
  purgeOldTrips(90).catch(() => {});
  const recovery = await recoverConfiguredManualTrip().catch(() => null);
  if (recovery?.status === 'recovered') {
    tripEvents.emitTripUpdated();
    updateTodoWidget().catch(() => {});
  }

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
    // Mode manuel : le GPS ne démarre que si un trajet manuel est en cours
    // (ex : l'app a été tuée pendant un trajet actif)
    if (await isManualTripActive()) {
      await startManualTracking();
    }
  } catch {
    // silently ignore — tracking is optional
  }
}

function RootLayoutNav() {
  const router = useRouter();
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
    runScheduler();
    rebuildBackupListFromSAF().catch(() => {});
    runDailyBackupIfNeeded().catch(() => {});
    getVehicleSettings().then(setVehicles).catch(() => {});
    migrateCleanGhostRoutes().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkPendingTrips]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        checkPendingTrips();
        updateTodoWidget().catch(() => {});
        runScheduler();
        runDailyBackupIfNeeded().catch(() => {});
        // Watchdog: redémarre le GPS si l'OS l'a tué et qu'un trajet manuel est actif
        import('@/utils/locationTracking').then(async ({ startManualTracking, LOCATION_TASK_NAME }) => {
          if (!(await isManualTripActive())) return;
          const Location = await import('expo-location');
          const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
          if (!running) await startManualTracking().catch(() => {});
        }).catch(() => {});
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkPendingTrips]);

  useEffect(() => {
    // Foreground: notification received while app is open → recalculate silently
    const fgSub = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      const action = data?.action as string | undefined;
      if (action === 'departure_check') {
        const apptId = data?.apptId as string | undefined;
        if (apptId) rescheduleIfNeeded(apptId).catch(() => {});
      }
    });
    return () => fgSub.remove();
  }, []);

  useEffect(() => {
    // User taps a notification (background/killed state)
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const action = data?.action as string | undefined;
      if (action === 'departure_check') {
        const apptId = data?.apptId as string | undefined;
        if (apptId) rescheduleIfNeeded(apptId).catch(() => {});
        return;
      }
      if (action === 'battery_optimization' && Platform.OS === 'android') {
        // Open the system dialog / app battery settings so the user can exempt
        // Yoann2.0 from battery optimisation (prevents One UI killing the GPS).
        IntentLauncher.startActivityAsync(
          'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
          { data: 'package:com.yoann2.app' },
        ).catch(() => {
          // Fallback: open generic battery settings if the direct intent fails.
          IntentLauncher.startActivityAsync(
            IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS,
          ).catch(() => {});
        });
        return;
      }
      const url = data?.url as string | undefined;
      if (url) router.push(url as any);
    });
    return () => sub.remove();
  }, [router]);

  const { addTask, updateTask, projects, tasks } = useApp();

  async function runScheduler() {
    try {
      const trips = await getTrips();
      await runMaintenanceScheduler({ trips, projects, tasks, addTask, updateTask });
    } catch {}
  }

  async function handleTag(vehicle: string) {
    if (!pendingTrip) return;
    const tripId = pendingTrip.id;
    setPendingTrip(null);

    await updateTrip(tripId, { vehicle });

    if (vehicle !== 'ignored') {
      try {
        const [trips, settings] = await Promise.all([getTrips(), getVehicleSettings()]);
        const updatedTrips = trips.map(t => t.id === tripId ? { ...t, vehicle } : t);
        const config = settings.find(v => v.id === vehicle);
        if (config) {
          const odometer = computeOdometer(updatedTrips, vehicle, config.odometerBaseKm, config.odometerAdjustments);
          const overdue = config.maintenanceItems.filter(
            item => item.intervalKm > 0 && odometer - item.lastResetKm >= item.intervalKm,
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
        <Stack.Screen name="calendar-period/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen
          name="voice"
          options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen name="marie" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="anna" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="vehicle-settings" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="project-reports" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="project-report/[id]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="trip/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="expense-stats" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="market-manager" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="savings-manager" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="shopping-list" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
      <TripTagModal trip={pendingTrip} vehicles={vehicles} onTag={handleTag} />
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <AppProvider>
                  <RootLayoutNav />
                </AppProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
