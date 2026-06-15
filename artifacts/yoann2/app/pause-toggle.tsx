import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { usePause } from '@/contexts/PauseContext';
import { updateTodoWidget } from '@/widgets/updateWidget';

export default function PauseToggleScreen() {
  const router = useRouter();
  const { activePause, startPause, stopPause } = usePause();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    async function toggle() {
      if (activePause) {
        await stopPause();
      } else {
        await startPause();
      }
      try { await updateTodoWidget(); } catch {}
      router.back();
    }

    toggle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = activePause ? 'Arrêt de la pause…' : 'Démarrage de la pause…';

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FFC107" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    fontSize: 15,
    color: '#9E9E9E',
    fontFamily: 'Inter_400Regular',
  },
});
