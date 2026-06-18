import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widgets/taskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    console.warn('[widget] task handler registration failed', e);
  }
}
