import React, { createContext, useContext } from 'react';

interface SplashContextValue {
  triggerSplash: () => void;
}

const SplashContext = createContext<SplashContextValue>({ triggerSplash: () => {} });

export function useSplash() {
  return useContext(SplashContext);
}

export function SplashProvider({ children }: { children: React.ReactNode }) {
  return (
    <SplashContext.Provider value={{ triggerSplash: () => {} }}>
      {children}
    </SplashContext.Provider>
  );
}
