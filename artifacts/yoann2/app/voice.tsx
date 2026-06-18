import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Status = 'listening' | 'result' | 'error';

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('listening');
  const [text, setText] = useState('');

  useEffect(() => {
    void listen();
  }, []);

  async function listen() {
    try {
      setStatus('listening');
      const result = await IntentLauncher.startActivityAsync(
        'android.speech.action.RECOGNIZE_SPEECH',
        {
          extra: {
            'android.speech.extra.LANGUAGE_MODEL': 'free_form',
            'android.speech.extra.PROMPT': 'Parlez…',
            'android.speech.extra.LANGUAGE': 'fr-FR',
            'android.speech.extra.MAX_RESULTS': 1,
          },
        }
      );
      if (result.resultCode === -1) {
        const extra = result.extra as Record<string, unknown> | undefined;
        const texts = (extra?.['android.speech.extra.RESULTS'] ?? []) as string[];
        const recognized = texts[0] ?? '';
        if (recognized) {
          setText(recognized);
          setStatus('result');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setStatus('error');
        }
      } else {
        router.back();
      }
    } catch {
      setStatus('error');
    }
  }

  function goTask() {
    router.replace(`/task/new?title=${encodeURIComponent(text)}` as any);
  }

  function goRdv() {
    router.replace(`/appointment/new?title=${encodeURIComponent(text)}` as any);
  }

  return (
    <View style={[styles.overlay, { paddingBottom: insets.bottom + 24, paddingTop: insets.top + 24 }]}>
      {status === 'listening' && (
        <>
          <ActivityIndicator size="large" color="#FFC107" style={{ marginBottom: 12 }} />
          <Text style={styles.hint}>Écoute en cours…</Text>
          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Annuler</Text>
          </Pressable>
        </>
      )}

      {status === 'result' && (
        <>
          <Text style={styles.label}>J'ai entendu :</Text>
          <Text style={styles.result}>"{text}"</Text>
          <View style={styles.actions}>
            <Pressable onPress={goTask} style={[styles.btn, styles.btnPrimary]}>
              <Text style={[styles.btnTxt, { color: '#121212' }]}>📋 Tâche</Text>
            </Pressable>
            <Pressable onPress={goRdv} style={[styles.btn, styles.btnSecondary]}>
              <Text style={[styles.btnTxt, { color: '#FFFFFF' }]}>📅 RDV</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Annuler</Text>
          </Pressable>
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.label}>Rien compris 😕</Text>
          <Text style={styles.hint}>Réessayez en parlant clairement</Text>
          <Pressable onPress={listen} style={[styles.btn, styles.btnPrimary, { marginTop: 8 }]}>
            <Text style={[styles.btnTxt, { color: '#121212' }]}>🎤 Réessayer</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelTxt}>Annuler</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  hint: {
    color: '#9E9E9E',
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  label: {
    color: '#9E9E9E',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  result: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#FFC107',
  },
  btnSecondary: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  btnTxt: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 8,
  },
  cancelTxt: {
    color: '#616161',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
});
