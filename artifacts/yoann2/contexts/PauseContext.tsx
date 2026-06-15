import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  type ActivePause,
  type PauseSession,
  type PauseStats,
  computeStats,
  loadActivePause,
  loadSessions,
  saveActivePause,
  saveSessions,
  todayStr,
} from '@/utils/pauseStorage';

type PauseContextType = {
  sessions: PauseSession[];
  activePause: ActivePause;
  stats: PauseStats;
  pauseLoading: boolean;
  startPause: () => Promise<void>;
  stopPause: () => Promise<void>;
  clearAllPauseSessions: () => Promise<void>;
};

const PauseContext = createContext<PauseContextType | null>(null);

export function PauseProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions]       = useState<PauseSession[]>([]);
  const [activePause, setActivePause] = useState<ActivePause>(null);
  const [pauseLoading, setPauseLoading] = useState(true);

  // Compteur tick pour forcer le recalcul des stats en live
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([loadSessions(), loadActivePause()]).then(([s, ap]) => {
      setSessions(s);
      setActivePause(ap);
      setPauseLoading(false);
    });
  }, []);

  // Mettre à jour le tick chaque seconde si une pause est active
  useEffect(() => {
    if (activePause) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activePause]);

  const stats = computeStats(sessions, activePause);

  const startPause = useCallback(async () => {
    if (activePause) return;
    const ap: ActivePause = { startTs: Date.now() };
    setActivePause(ap);
    await saveActivePause(ap);
  }, [activePause]);

  const stopPause = useCallback(async () => {
    if (!activePause) return;
    const endTs = Date.now();
    const durationSecs = Math.max(1, Math.floor((endTs - activePause.startTs) / 1000));
    const session: PauseSession = {
      id: `pause_${activePause.startTs}`,
      date: todayStr(),
      startTs: activePause.startTs,
      endTs,
      durationSecs,
    };
    const updated = [...sessions, session];
    setSessions(updated);
    setActivePause(null);
    await Promise.all([saveSessions(updated), saveActivePause(null)]);
  }, [activePause, sessions]);

  const clearAllPauseSessions = useCallback(async () => {
    setSessions([]);
    setActivePause(null);
    await Promise.all([saveSessions([]), saveActivePause(null)]);
  }, []);

  return (
    <PauseContext.Provider value={{
      sessions, activePause, stats, pauseLoading,
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
