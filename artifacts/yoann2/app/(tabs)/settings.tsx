import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { type ThemeColorKey, useTheme } from '@/contexts/ThemeContext';
import { useColors } from '@/hooks/useColors';

const COLOR_PALETTE = [
  '#FFC107', '#FF9800', '#FF5722', '#F44336', '#E91E63',
  '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
  '#795548', '#9E9E9E', '#607D8B', '#FFFFFF', '#444444',
];

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: 'Couleur principale',
  priorityLow: 'Priorité Faible',
  priorityMedium: 'Priorité Moyenne',
  priorityHigh: 'Priorité Haute',
  priorityCritical: 'Priorité Critique',
  statusIdea: 'Statut Idée',
  statusTodo: 'Statut À faire',
  statusInProgress: 'Statut En cours',
  statusWaiting: 'Statut En attente',
  statusDone: 'Statut Terminé',
};

const COLOR_KEYS: ThemeColorKey[] = [
  'primary',
  'priorityLow', 'priorityMedium', 'priorityHigh', 'priorityCritical',
  'statusIdea', 'statusTodo', 'statusInProgress', 'statusWaiting', 'statusDone',
];

function SettingRow({
  icon,
  label,
  sublabel,
  onPress,
  accent,
  colors,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  accent?: string;
  colors: ReturnType<typeof useColors>;
}) {
  const iconColor = accent ?? colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconColor + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { updateColor, resetColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { exportData, importData, resetData, projects, tasks, categories, addCategory, deleteCategory } = useApp();

  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState('');
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [colorPickerKey, setColorPickerKey] = useState<ThemeColorKey | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  function handleExport() {
    const json = exportData();
    if (Platform.OS !== 'web') {
      Clipboard.setStringAsync(json).then(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Export', 'Données copiées dans le presse-papiers. Collez dans un fichier texte pour sauvegarder.');
      });
    } else {
      Alert.alert('Export JSON', json.substring(0, 200) + '...');
    }
  }

  function handleImport() {
    const ok = importData(importText);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Import réussi', 'Les données ont été restaurées avec succès.');
      setImportModalVisible(false);
      setImportText('');
    } else {
      Alert.alert('Erreur', 'JSON invalide. Vérifiez le format des données.');
    }
  }

  function handleReset() {
    Alert.alert(
      'Réinitialiser',
      "Toutes les données seront supprimées et les données d'exemple seront restaurées. Continuer ?",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => {
            resetData();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  function handleAddCategory() {
    if (newCatName.trim()) {
      addCategory(newCatName.trim());
      setNewCatName('');
    }
  }

  function handlePickColor(key: ThemeColorKey, color: string) {
    updateColor(key, color);
    Haptics.selectionAsync();
  }

  function handleResetColors() {
    Alert.alert(
      'Réinitialiser les couleurs',
      'Restaurer les couleurs par défaut ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', onPress: () => { resetColors(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
      ]
    );
  }

  const currentColorValue = colorPickerKey ? (colors as Record<string, string>)[colorPickerKey] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Paramètres</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.section, { color: colors.mutedForeground }]}>Statistiques</Text>
        <View style={[styles.statsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { label: 'Projets', value: projects.length, icon: 'folder-multiple-outline' },
            { label: 'Tâches', value: tasks.length, icon: 'format-list-checks' },
            { label: 'Catégories', value: categories.length, icon: 'tag-multiple-outline' },
          ].map((s, i) => (
            <View key={i} style={[styles.statRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <MaterialCommunityIcons name={s.icon as any} size={18} color={colors.primary} />
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Couleurs</Text>
        <View style={[styles.colorsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {COLOR_KEYS.map((key, i) => {
            const colorVal = (colors as Record<string, string>)[key] ?? '#888';
            return (
              <Pressable
                key={key}
                onPress={() => setColorPickerKey(key)}
                style={({ pressed }) => [
                  styles.colorRow,
                  i < COLOR_KEYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.colorSwatch, { backgroundColor: colorVal }]} />
                <Text style={[styles.colorLabel, { color: colors.foreground }]}>{COLOR_LABELS[key]}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={handleResetColors}
          style={[styles.resetColorsBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.resetColorsLabel, { color: colors.mutedForeground }]}>Réinitialiser les couleurs par défaut</Text>
        </Pressable>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Sauvegarde</Text>
        <SettingRow
          icon="export-variant"
          label="Exporter les données"
          sublabel="Copie le JSON dans le presse-papiers"
          onPress={handleExport}
          colors={colors}
        />
        <SettingRow
          icon="import"
          label="Importer des données"
          sublabel="Restaurer depuis un JSON"
          onPress={() => setImportModalVisible(true)}
          colors={colors}
        />

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Catégories</Text>
        <SettingRow
          icon="tag-multiple-outline"
          label="Gérer les catégories"
          sublabel={`${categories.length} catégories`}
          onPress={() => setCatModalVisible(true)}
          colors={colors}
        />

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Danger</Text>
        <SettingRow
          icon="delete-alert-outline"
          label="Réinitialiser les données"
          sublabel="Restaure les données d'exemple"
          onPress={handleReset}
          accent={colors.destructive}
          colors={colors}
        />

        <View style={[styles.about, { borderColor: colors.border }]}>
          <Text style={[styles.aboutTitle, { color: colors.foreground }]}>Yoann2.0 - par et pour Gorge Yoann</Text>
          <Text style={[styles.aboutSub, { color: colors.mutedForeground }]}>Gestion de mes projets & idées</Text>
          <Text style={[styles.aboutSub, { color: colors.mutedForeground }]}>v.1.0.1</Text>
        </View>
      </ScrollView>

      <Modal visible={importModalVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setImportModalVisible(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Importer des données</Text>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Collez votre JSON de sauvegarde ci-dessous.
            </Text>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              placeholder="Collez le JSON ici…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[styles.jsonInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border }]}
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setImportModalVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
                <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleImport} style={[styles.importBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.importLabel, { color: colors.primaryForeground }]}>Importer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={catModalVisible} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setCatModalVisible(false)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Catégories</Text>
            <View style={[styles.catInput, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <TextInput
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="Nouvelle catégorie…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.catInputField, { color: colors.foreground }]}
              />
              <Pressable onPress={handleAddCategory} style={[styles.catAddBtn, { backgroundColor: colors.primary }]}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 240 }}>
              {categories.map(c => (
                <View key={c.id} style={[styles.catRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{c.name}</Text>
                  <Pressable onPress={() => deleteCategory(c.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="close" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setCatModalVisible(false)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={colorPickerKey !== null} animationType="slide" transparent>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setColorPickerKey(null)} />
          <View style={[styles.modal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {colorPickerKey ? COLOR_LABELS[colorPickerKey] : ''}
            </Text>
            <View style={styles.palette}>
              {COLOR_PALETTE.map(c => (
                <Pressable
                  key={c}
                  onPress={() => {
                    if (colorPickerKey) handlePickColor(colorPickerKey, c);
                    setColorPickerKey(null);
                  }}
                  style={[
                    styles.paletteCell,
                    { backgroundColor: c },
                    currentColorValue === c && styles.paletteCellSelected,
                  ]}
                >
                  {currentColorValue === c && (
                    <MaterialCommunityIcons name="check" size={16} color={c === '#FFFFFF' ? '#000' : '#fff'} />
                  )}
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setColorPickerKey(null)} style={[styles.cancelBtn, { borderColor: colors.border }]}>
              <Text style={[styles.cancelLabel, { color: colors.mutedForeground }]}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
  },
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  rowSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  statsBox: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  colorsBox: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  colorLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  resetColorsBtn: {
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  resetColorsLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  about: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    gap: 4,
    paddingBottom: 20,
  },
  aboutTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  aboutSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  modalSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  jsonInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  importBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  importLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  catInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  catInputField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  catAddBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  catName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  paletteCell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteCellSelected: {
    borderColor: '#fff',
  },
});
