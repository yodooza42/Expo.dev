import React, { createContext, useCallback, useContext, useState } from 'react';

import { PhoenixWebSplash } from '@/components/PhoenixWebSplash';

interface SplashContextValue {
  triggerSplash: () => void;
}

const SplashContext = createContext<SplashContextValue>({ triggerSplash: () => {} });

export function useSplash() {
  return useContext(SplashContext);
}

export function SplashProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const [key, setKey] = useState(0);

  const triggerSplash = useCallback(() => {
    setKey(k => k + 1);
    setVisible(true);
  }, []);

  const handleDone = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <SplashContext.Provider value={{ triggerSplash }}>
      {children}
      {visible && <PhoenixWebSplash key={key} onDone={handleDone} />}
    </SplashContext.Provider>
  );
}
