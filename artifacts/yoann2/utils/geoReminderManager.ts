/**
 * geoReminderManager.ts
 *
 * Gère les rappels géolocalisés sur les tâches via expo-location geofencing.
 * defineTask() doit s'exécuter au chargement du module (avant tout démarrage).
 * Importer ce fichier depuis _layout.tsx pour que la définition soit prête.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import type { Task } from '@/types';

export const GEO_REMINDER_TASK = 'geo-reminder-task';
const TITLES_KEY = '@yoann2_geo_reminder_titles';

// ─── Définition de la tâche background ─────────────────────────────────────
TaskManager.defineTask(GEO_REMINDER_TASK, async ({ data, error }: any) => {
  if (error) return;
  const { eventType, region } = data ?? {};
  if (eventType !== Location.GeofencingEventType.Enter || !region?.identifier) return;

  try {
    const raw = await AsyncStorage.getItem(TITLES_KEY);
    const titles: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const body = titles[region.identifier as string] ?? 'Rappel de tâche';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📍 Rappel de lieu',
        body,
        data: { taskId: region.identifier },
      },
      trigger: null,
    });
  } catch {}
});

// ─── Synchronisation des geofences ─────────────────────────────────────────
export async function syncGeofences(tasks: Task[]): Promise<void> {
  try {
    const geoTasks = tasks.filter(
      t => t.reminderLat != null && t.reminderLng != null && t.status !== 'done',
    );

    // Persiste les titres pour la tâche background
    const titles: Record<string, string> = {};
    for (const t of geoTasks) titles[t.id] = t.title;
    await AsyncStorage.setItem(TITLES_KEY, JSON.stringify(titles));

    const isRunning = await Location.hasStartedGeofencingAsync(GEO_REMINDER_TASK).catch(() => false);

    if (geoTasks.length === 0) {
      if (isRunning) await Location.stopGeofencingAsync(GEO_REMINDER_TASK).catch(() => {});
      return;
    }

    const regions: Location.LocationRegion[] = geoTasks.map(t => ({
      identifier: t.id,
      latitude: t.reminderLat!,
      longitude: t.reminderLng!,
      radius: t.reminderRadius ?? 100,
      notifyOnEnter: true,
      notifyOnExit: false,
    }));

    await Location.startGeofencingAsync(GEO_REMINDER_TASK, regions);
  } catch (e) {
    console.warn('[GeoReminder] syncGeofences error:', e);
  }
}
