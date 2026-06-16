import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { DaySchedule } from '@/widgets/widgetSettings';

const KEY_WEEKLY = '@yoann2_notif_weekly';
const KEY_MONTHLY = '@yoann2_notif_monthly';
const KEY_WEEKLY_ID = '@yoann2_notif_weekly_id';
const KEY_MONTHLY_ID = '@yoann2_notif_monthly_id';
const KEY_SHIFT_IDS = '@yoann2_notif_shift_ids';
const KEY_APPT_REMINDER = '@yoann2_notif_appt_reminder';
const KEY_APPT_IDS = '@yoann2_notif_appt_ids';

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export async function getNotifPrefs(): Promise<{ weekly: boolean; monthly: boolean }> {
  const [w, m] = await AsyncStorage.multiGet([KEY_WEEKLY, KEY_MONTHLY]);
  return {
    weekly: w[1] === 'true',
    monthly: m[1] === 'true',
  };
}

export async function requestNotifPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function nextLastDayOfMonth(): Date {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 16, 0, 0, 0);
  if (lastDay <= now) {
    return new Date(now.getFullYear(), now.getMonth() + 2, 0, 16, 0, 0, 0);
  }
  return lastDay;
}

export async function scheduleWeeklyReport(): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestNotifPermission();
  if (!granted) return;

  const existing = await AsyncStorage.getItem(KEY_WEEKLY_ID);
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Rapport hebdomadaire',
      body: 'Votre résumé de la semaine est prêt. Tapez pour le consulter.',
      data: { url: '/rapport', type: 'weekly' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 16,
      minute: 0,
    },
  });

  await AsyncStorage.multiSet([
    [KEY_WEEKLY, 'true'],
    [KEY_WEEKLY_ID, id],
  ]);
}

export async function cancelWeeklyReport(): Promise<void> {
  const id = await AsyncStorage.getItem(KEY_WEEKLY_ID);
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await AsyncStorage.multiSet([
    [KEY_WEEKLY, 'false'],
    [KEY_WEEKLY_ID, ''],
  ]);
}

export async function scheduleMonthlyReport(): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestNotifPermission();
  if (!granted) return;

  const existing = await AsyncStorage.getItem(KEY_MONTHLY_ID);
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing).catch(() => {});
  }

  const triggerDate = nextLastDayOfMonth();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '📅 Rapport mensuel',
      body: 'Votre bilan du mois est disponible. Tapez pour le consulter.',
      data: { url: '/rapport', type: 'monthly' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  await AsyncStorage.multiSet([
    [KEY_MONTHLY, 'true'],
    [KEY_MONTHLY_ID, id],
  ]);
}

export async function cancelMonthlyReport(): Promise<void> {
  const id = await AsyncStorage.getItem(KEY_MONTHLY_ID);
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await AsyncStorage.multiSet([
    [KEY_MONTHLY, 'false'],
    [KEY_MONTHLY_ID, ''],
  ]);
}

export async function rescheduleMonthlyAfterFire(): Promise<void> {
  await scheduleMonthlyReport();
}

export async function cancelShiftNotifications(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_SHIFT_IDS);
  if (raw) {
    try {
      const ids: string[] = JSON.parse(raw);
      for (const id of ids) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
    } catch {}
  }
  await AsyncStorage.removeItem(KEY_SHIFT_IDS);
}

// Programme une notif hebdomadaire 1h avant le début de chaque jour travaillé.
export async function scheduleShiftNotifications(schedule: DaySchedule[]): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelShiftNotifications();
  const granted = await requestNotifPermission();
  if (!granted) return;

  const ids: string[] = [];
  for (let dayIdx = 0; dayIdx < schedule.length; dayIdx++) {
    const day = schedule[dayIdx];
    if (!day || day.off) continue;

    const [hStr, mStr] = day.start.split(':');
    let hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    if (isNaN(hour) || isNaN(minute)) continue;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;

    // 1h avant l'embauche
    let notifDayIdx = dayIdx;
    hour -= 1;
    if (hour < 0) {
      hour += 24;
      notifDayIdx = (dayIdx + 6) % 7; // jour précédent
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Embauche dans 1h',
        body: `Ton service de ${DAY_NAMES_FR[dayIdx]} commence à ${day.start.replace(':', 'h')}.`,
        data: { type: 'shift' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: notifDayIdx + 1, // expo : 1=dimanche .. 7=samedi
        hour,
        minute,
      },
    });
    ids.push(id);
  }

  await AsyncStorage.setItem(KEY_SHIFT_IDS, JSON.stringify(ids));
}

// ── Notifications RDV (rappel 24h avant + jour J à 8h) ──

interface ApptInput {
  id: string;
  title: string;
  date: string;
  time: string;
}

export async function getApptReminderPref(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY_APPT_REMINDER);
  return raw === 'true';
}

export async function setApptReminderPref(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_APPT_REMINDER, String(enabled));
}

export async function cancelAppointmentReminders(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_APPT_IDS);
  if (raw) {
    try {
      const ids: string[] = JSON.parse(raw);
      for (const id of ids) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      }
    } catch {}
  }
  await AsyncStorage.removeItem(KEY_APPT_IDS);
}

export async function scheduleAppointmentReminders(appointments: ApptInput[]): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelAppointmentReminders();
  const enabled = await getApptReminderPref();
  if (!enabled) return;
  const granted = await requestNotifPermission();
  if (!granted) return;

  const now = new Date();
  const ids: string[] = [];

  for (const a of appointments) {
    if (!a.date) continue;
    const apptDate = new Date(a.date);
    if (isNaN(apptDate.getTime()) || apptDate < now) continue;

    // 1) Rappel 24h avant
    const reminder24 = new Date(apptDate);
    reminder24.setDate(reminder24.getDate() - 1);
    reminder24.setHours(8, 0, 0, 0);
    if (reminder24 > now) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 Rappel RDV demain',
          body: `${a.title} ${a.time ? `à ${a.time.replace(':', 'h')}` : ''}`,
          data: { type: 'appointment', apptId: a.id, url: '/calendar' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder24,
        },
      });
      ids.push(id);
    }

    // 2) Jour J à 8h
    const morning = new Date(apptDate);
    morning.setHours(8, 0, 0, 0);
    if (morning > now) {
      const id2 = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📅 RDV aujourd\'hui',
          body: `${a.title} ${a.time ? `à ${a.time.replace(':', 'h')}` : ''}`,
          data: { type: 'appointment', apptId: a.id, url: '/calendar' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: morning,
        },
      });
      ids.push(id2);
    }
  }

  await AsyncStorage.setItem(KEY_APPT_IDS, JSON.stringify(ids));
}
