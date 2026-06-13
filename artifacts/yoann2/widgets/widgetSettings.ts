import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@yoann2_widget_settings';

export interface WidgetSettings {
  taskFontSize: number;
  primaryColor: string;
  bgColor: string;
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  taskFontSize: 16,
  primaryColor: '#FFC107',
  bgColor: '#121212',
};

export async function getWidgetSettings(): Promise<WidgetSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_WIDGET_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_WIDGET_SETTINGS;
}

export async function saveWidgetSettings(s: WidgetSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
