import { NativeModules } from 'react-native';

const { WidgetAlarm } = NativeModules as {
  WidgetAlarm?: {
    scheduleAlarm: (intervalMs: number) => void;
    cancelAlarm: () => void;
  };
};

export const WIDGET_IMMINENT_REFRESH_TASK = 'WIDGET_IMMINENT_REFRESH';

const ALARM_INTERVAL_MS = 60_000; // 60 seconds (AlarmManager.setRepeating)

export async function scheduleImminentRefresh(): Promise<void> {
  WidgetAlarm?.scheduleAlarm(ALARM_INTERVAL_MS);
}

export async function cancelImminentRefresh(): Promise<void> {
  WidgetAlarm?.cancelAlarm();
}
