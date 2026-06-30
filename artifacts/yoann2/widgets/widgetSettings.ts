import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@yoann2_widget_settings';

export interface DaySchedule {
  off: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface WidgetSettings {
  taskFontSize: number;
  primaryColor: string;
  bgColor: string;
  bgOpacity: number;
  bgImageUri?: string;
  workSchedule: DaySchedule[]; // index 0=Dimanche .. 6=Samedi (convention Date.getDay())
  shiftNotif: boolean;
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
  taskFontSize: 16,
  primaryColor: '#FFC107',
  bgColor: '#121212',
  bgOpacity: 100,
  workSchedule: DEFAULT_WORK_SCHEDULE,
  shiftNotif: true,
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

/**
 * Build the card background color for react-native-android-widget.
 * The library uses CSS format #RRGGBBAA (NOT Android's #AARRGGBB).
 * Cards are a slightly lighter shade of bgColor for contrast.
 */
export function buildCardColor(bgColor: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(100, opacity)) * 2.55);
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  const hex = (bgColor.startsWith('#') ? bgColor.slice(1) : bgColor).padEnd(6, '0');
  const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 20).toString(16).padStart(2, '0');
  const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 20).toString(16).padStart(2, '0');
  const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 20).toString(16).padStart(2, '0');
  return `#${r}${g}${b}${alphaHex}`;
}

/**
 * Build the navbar background color for react-native-android-widget.
 * Uses bgColor directly (slightly darker than card) with the same alpha suffix.
 */
export function buildNavbarColor(bgColor: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(100, opacity)) * 2.55);
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  const hex = (bgColor.startsWith('#') ? bgColor.slice(1) : bgColor).padEnd(6, '0');
  return `#${hex}${alphaHex}`;
}

// "15h00 - 01h00" depuis "15:00" / "01:00"
export function formatScheduleLabel(day: DaySchedule): string {
  if (day.off) return 'Repos';
  const fmt = (t: string) => t.replace(':', 'h');
  return `${fmt(day.start)} - ${fmt(day.end)}`;
}
