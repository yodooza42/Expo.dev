import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  type ActivePause,
  type PauseSession,
  type PauseStats,
  computeStats,
  currentShiftDate,
  getShiftDate,
  loadActivePause,
  loadSessions,
  saveActivePause,
  saveSessions,
} from '@/utils/pauseStorage';
import { DEFAULT_WORK_SCHEDULE, getWidgetSettings, type DaySchedule } from '@/widgets/widgetSettings';

type PauseContextType = {
  sessions: PauseSession[];
  activePause: ActivePause;
  stats: PauseStats;
  pauseLoading: boolean;
  workSchedule: DaySchedule[];
  todayShiftDate: string;
  startPause: () => Promise<void>;
  stopPause: () => Promise<void>;
  clearAllPauseSessions: () => Promise<void>;
};

const PauseContext = createContext<PauseContextType | null>(null);

export function PauseProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions]         = useState<PauseSession[]>([]);
  const [activePause, setActivePause]   = useState<ActivePause>(null);
  const [pauseLoading, setPauseLoading] = useState(true);
  const [workSchedule, setWorkSchedule] = useState<DaySchedule[]>(DEFAULT_WORK_SCHEDULE);

  // Tick pour forcer le recalcul des stats en live pendant une pause active
  const [, setTick]  = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([loadSessions(), loadActivePause(), getWidgetSettings()]).then(([s, ap, ws]) => {
      setSessions(s);
      setActivePause(ap);
      setWorkSchedule(ws.workSchedule ?? DEFAULT_WORK_SCHEDULE);
      setPauseLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activePause) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activePause]);

  const todayShiftDate = currentShiftDate(workSchedule);
  const stats = computeStats(sessions, activePause, workSchedule);

  const startPause = useCallback(async () => {
    if (activePause) return;
    const ap: ActivePause = { startTs: Date.now() };
    setActivePause(ap);
    await saveActivePause(ap);
  }, [activePause]);

  const stopPause = useCallback(async () => {
    if (!activePause) return;
    const endTs       = Date.now();
    const durationSecs = Math.max(1, Math.floor((endTs - activePause.startTs) / 1000));
    const session: PauseSession = {
      id:           `pause_${activePause.startTs}`,
      shiftDate:    getShiftDate(activePause.startTs, workSchedule),
      startTs:      activePause.startTs,
      endTs,
      durationSecs,
    };
    const updated = [...sessions, session];
    setSessions(updated);
    setActivePause(null);
    await Promise.all([saveSessions(updated), saveActivePause(null)]);
  }, [activePause, sessions, workSchedule]);

  const clearAllPauseSessions = useCallback(async () => {
    setSessions([]);
    setActivePause(null);
    await Promise.all([saveSessions([]), saveActivePause(null)]);
  }, []);

  return (
    <PauseContext.Provider value={{
      sessions, activePause, stats, pauseLoading,
      workSchedule, todayShiftDate,
      startPause, stopPause, clearAllPauseSessions,
    }}>
      {children}
    </PauseContext.Provider>
  );
}

export function usePause() {
  const ctx = useContext(PauseContext);
  if (!ctx) throw new Error('usePause must be used inside PauseProvider');
  return ctx;
}
