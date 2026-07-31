import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/hooks/useColors';

interface BottomSheetProps {
  /** Contrôle l'ouverture/fermeture du panneau. */
  visible: boolean;
  /** Appelé au tap sur le fond assombri, au bouton retour Android, ou via un bouton "Fermer" du contenu. */
  onClose: () => void;
  /** Titre optionnel affiché sous la poignée, dans le style standard. Omettre si le contenu gère son propre en-tête. */
  title?: string;
  children: React.ReactNode;
  /** Hauteur max du panneau (ex. '85%'). Par défaut '90%'. */
  maxHeight?: DimensionValue;
  /** Enrobe le contenu d'un KeyboardAvoidingView — à activer si le sheet contient un TextInput. */
  avoidKeyboard?: boolean;
  /** Style additionnel pour le conteneur du panneau (ex. gap personnalisé). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Désactive la fermeture au tap sur le fond (rare — cas des sheets bloquants). */
  disableBackdropClose?: boolean;
}

/**
 * Panneau qui remonte du bas de l'écran, avec une apparence standardisée dans
 * toute l'app : poignée, coins arrondis, fond assombri, espacement, et
 * padding de zone de sécurité en bas. Remplace les Modal "sheet" codés à la
 * main pour que chaque panneau de l'app ait la même signature visuelle.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeight = '90%',
  avoidKeyboard = false,
  contentStyle,
  disableBackdropClose = false,
}: BottomSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const sheet = (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={disableBackdropClose ? undefined : onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
            maxHeight,
          },
          contentStyle,
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {title ? <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text> : null}
        {children}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {avoidKeyboard ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 20,
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
