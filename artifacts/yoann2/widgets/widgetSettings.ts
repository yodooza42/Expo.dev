import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@yoann2_widget_settings';

export interface DaySchedule {
  off: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export type TripAudioPreset = 'sine_220' | 'sine_440' | 'sine_110' | 'noise';

export interface WidgetSettings {
  primaryColor: string;
  bgColor: string;
  workSchedule: DaySchedule[]; // index 0=Dimanche .. 6=Samedi (convention Date.getDay())
  shiftNotif: boolean;
  tripAudio: TripAudioPreset;
}

// index 0=Dimanche .. 6=Samedi
export const DEFAULT_WORK_SCHEDULE: DaySchedule[] = [
  { off: false, start: '20:00', end: '00:00' }, // Dimanche
  { off: false, start: '15:00', end: '01:00' }, // Lundi
  { off: false, start: '17:00', end: '00:00' }, // Mardi
  { off: false, start: '16:00', end: '01:00' }, // Mercredi
  { off: false, start: '17:00', end: '01:00' }, // Jeudi
  { off: true,  start: '09:00', end: '17:00' }, // Vendredi (repos)
  { off: true,  start: '09:00', end: '17:00' }, // Samedi (repos)
];

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  primaryColor: '#FFC107',
  bgColor: '#121212',
  workSchedule: DEFAULT_WORK_SCHEDULE,
  shiftNotif: true,
  tripAudio: 'sine_220',
};

export async function getWidgetSettings(): Promise<WidgetSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WIDGET_SETTINGS,
        ...parsed,
        workSchedule:
          Array.isArray(parsed.workSchedule) && parsed.workSchedule.length === 7
            ? parsed.workSchedule
            : DEFAULT_WORK_SCHEDULE,
      };
    }
  } catch {}
  return DEFAULT_WIDGET_SETTINGS;
}

export async function saveWidgetSettings(s: WidgetSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function getWidgetBgColor(settings: WidgetSettings): string {
  return settings.bgColor;
}

// "15h00 - 01h00" depuis "15:00" / "01:00"
export function formatScheduleLabel(day: DaySchedule): string {
  if (day.off) return 'Repos';
  const fmt = (t: string) => t.replace(':', 'h');
  return `${fmt(day.start)} - ${fmt(day.end)}`;
}
