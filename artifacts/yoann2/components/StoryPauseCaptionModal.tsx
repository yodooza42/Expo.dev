import React from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { StoryPause } from '@/utils/storyPlaybackTimeline';

type Props = {
  visible: boolean;
  pauses: StoryPause[];
  drafts: string[];
  accentColor: string;
  cardColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  onChange: (index: number, value: string) => void;
  onCancel: () => void;
  onContinue: () => void;
  onHidePauses: () => void;
};

export function StoryPauseCaptionModal({
  visible, pauses, drafts, accentColor, cardColor, borderColor, textColor, mutedColor,
  onChange, onCancel, onContinue, onHidePauses,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: cardColor, borderRadius: 18, padding: 20, maxHeight: '85%' }}>
          <Text style={{ color: textColor, fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 6 }}>
            Ajouter un souvenir aux pauses ?
          </Text>
          <Text style={{ color: mutedColor, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 14 }}>
            Tu peux afficher les pauses avec un message facultatif, ou les masquer. Les temps d’arrêt restent accélérés et le trajet ne sera pas modifié.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onHidePauses}
            style={{ paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: accentColor, marginBottom: 14 }}
          >
            <Text style={{ color: accentColor, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>Ne pas afficher les pauses</Text>
          </Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1, maxHeight: 420 }}>
            {pauses.map((pause, index) => (
              <View key={`${pause.startMs}-${index}`} style={{ marginBottom: 14 }}>
                <Text style={{ color: accentColor, fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 7 }}>
                  Pause de {Math.max(1, Math.round(pause.durationMs / 60_000))} min
                </Text>
                <TextInput
                  value={drafts[index] ?? ''}
                  onChangeText={value => onChange(index, value)}
                  placeholder="Ex. Apéro au bord de la plage"
                  placeholderTextColor={mutedColor}
                  maxLength={90}
                  returnKeyType="done"
                  style={{
                    color: textColor, backgroundColor: 'rgba(127,127,127,0.12)', borderColor,
                    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                    fontSize: 14, fontFamily: 'Inter_400Regular',
                  }}
                />
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable
              onPress={onCancel}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(127,127,127,0.14)' }}
            >
              <Text style={{ color: mutedColor, fontFamily: 'Inter_600SemiBold' }}>Annuler</Text>
            </Pressable>
            <Pressable
              onPress={onContinue}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: accentColor }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Continuer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
