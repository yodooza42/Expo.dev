import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import baseColors from '@/constants/colors';

export type ThemeColorKey =
  | 'primary'
  | 'priorityLow'
  | 'priorityMedium'
  | 'priorityHigh'
  | 'priorityCritical'
  | 'statusIdea'
  | 'statusTodo'
  | 'statusInProgress'
  | 'statusWaiting'
  | 'statusDone';

export type AppColors = typeof baseColors.dark & { radius: number };

type CustomColors = Partial<Record<ThemeColorKey, string>>;

const STORAGE_KEY = '@yoann2_theme';

interface ThemeContextValue {
  colors: AppColors;
  updateColor: (key: ThemeColorKey, value: string) => void;
  resetColors: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [custom, setCustom] = useState<CustomColors>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setCustom(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const merged: AppColors = {
    ...baseColors.dark,
    ...custom,
    radius: baseColors.radius,
  };

  const updateColor = useCallback((key: ThemeColorKey, value: string) => {
    setCustom(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetColors = useCallback(() => {
    setCustom({});
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ThemeContext.Provider value={{ colors: merged, updateColor, resetColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
