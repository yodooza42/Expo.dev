import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { PhoenixSplash } from '@/components/PhoenixSplash';

interface SplashContextValue {
  triggerSplash: () => void;
}

const SplashContext = createContext<SplashContextValue>({ triggerSplash: () => {} });

export function useSplash() {
  return useContext(SplashContext);
}

export function SplashProvider({ children }: { children: React.ReactNode }) {
  // Commence caché : on affiche le splash seulement si l'app n'est PAS
  // ouverte depuis un deep link widget (yoann2://)
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    Linking.getInitialURL()
      .then(url => {
        const fromWidget = typeof url === 'string' && url.startsWith('yoann2://');
        if (!fromWidget) setVisible(true);
      })
      .catch(() => setVisible(true));
  }, []);

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
      {visible && <PhoenixSplash key={key} onDone={handleDone} />}
    </SplashContext.Provider>
  );
}
