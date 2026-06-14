import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { updateTodoWidget } from '@/widgets/updateWidget';
import {
  DEFAULT_WIDGET_SETTINGS,
  getWidgetBgColor,
  getWidgetSettings,
  saveWidgetSettings,
  type WidgetSettings,
} from '@/widgets/widgetSettings';

const COLOR_PALETTE = [
  '#FFC107', '#FF9800', '#FF5722', '#F44336', '#E91E63',
  '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#FFFFFF',
  '#795548', '#9E9E9E', '#607D8B', '#CCAA44', '#444444',
];

const BG_PALETTE = [
  '#121212', '#0D0D0D', '#1A1A2E', '#0F1923', '#1C1C1E',
  '#1E1E2E', '#13111C', '#0A0A0A', '#181818', '#101820',
];

const FONT_SIZES = [
  { label: 'Petit', value: 13 },
  { label: 'Moyen', value: 16 },
  { label: 'Grand', value: 19 },
];

function OpacitySlider({
  value,
  onChange,
  primaryColor,
}: {
  value: number;
  onChange: (v: number) => void;
  primaryColor: string;
}) {
  const [sliderWidth, setSliderWidth] = useState(240);
  const sliderWidthRef = useRef(240);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: evt => {
          const pct = Math.max(0, Math.min(100, Math.round((evt.nativeEvent.locationX / sliderWidthRef.current) * 100)));
          onChangeRef.current(pct);
        },
        onPanResponderMove: evt => {
          const pct = Math.max(0, Math.min(100, Math.round((evt.nativeEvent.locationX / sliderWidthRef.current) * 100)));
          onChangeRef.current(pct);
        },
      }),
    []
  );

  const thumbLeft = Math.max(0, Math.min(sliderWidth - 24, (sliderWidth * value) / 100 - 12));

  return (
    <View style={{ gap: 8 }}>
      <View
        style={styles.sliderHitArea}
        onLayout={e => {
          sliderWidthRef.current = e.nativeEvent.layout.width;
          setSliderWidth(e.nativeEvent.layout.width);
        }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.sliderTrack, { backgroundColor: '#333' }]}>
          <View
            style={[
              styles.sliderFill,
              { width: `${value}%`, backgroundColor: primaryColor },
            ]}
          />
        </View>
        <View
          style={[
            styles.sliderThumb,
            { left: thumbLeft, backgroundColor: primaryColor },
          ]}
        />
      </View>
      <Text style={styles.sliderLabel}>{value} %</Text>
    </View>
  );
}

export default function WidgetSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, appointments } = useApp();

  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    getWidgetSettings().then(s => setSettings(s));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveWidgetSettings(settings);
      await updateTodoWidget(tasks, appointments);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  }

  function ColorGrid({
    value,
    palette,
    onChange,
  }: {
    value: string;
    palette: string[];
    onChange: (c: string) => void;
  }) {
    return (
      <View style={styles.palette}>
        {palette.map(c => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            style={[
              styles.paletteCell,
              { backgroundColor: c },
              value === c && styles.paletteCellSelected,
            ]}
          >
            {value === c && (
              <MaterialCommunityIcons
                name="check"
                size={16}
                color={c === '#FFFFFF' || c === '#CCAA44' || c === '#8BC34A' ? '#000' : '#fff'}
              />
            )}
          </Pressable>
        ))}
      </View>
    );
  }

  const previewBgColor = getWidgetBgColor(settings);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBar, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Paramètres du widget</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        >
          <Text style={[styles.saveTxt, { color: colors.primaryForeground }]}>
            {saving ? '…' : 'Appliquer'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.previewBox, { backgroundColor: previewBgColor, borderColor: colors.border }]}>
          <Text style={[styles.previewTitle, { color: '#FFFFFF', fontSize: settings.taskFontSize }]}>
            ● Exemple de tâche  ·  15 juin
          </Text>
          <Text style={[styles.previewSub, { color: settings.primaryColor }]}>
            Aujourd'hui : 10h Médecin
          </Text>
          <View style={styles.previewBar}>
            {['+ Tâche', '+ Projet', '+ RDV'].map(l => (
              <Text key={l} style={[styles.previewBarItem, { color: settings.primaryColor, fontSize: 12 }]}>{l}</Text>
            ))}
            <Text style={[styles.previewBarItem, { color: '#9E9E9E', fontSize: 12 }]}>↺</Text>
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Taille du texte des tâches</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chipRow}>
            {FONT_SIZES.map(fs => (
              <Pressable
                key={fs.value}
                onPress={() => setSettings(s => ({ ...s, taskFontSize: fs.value }))}
                style={[
                  styles.chip,
                  settings.taskFontSize === fs.value
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[
                  styles.chipTxt,
                  { color: settings.taskFontSize === fs.value ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {fs.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Couleur principale</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ColorGrid
            value={settings.primaryColor}
            palette={COLOR_PALETTE}
            onChange={c => setSettings(s => ({ ...s, primaryColor: c }))}
          />
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Couleur de fond</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ColorGrid
            value={settings.bgColor}
            palette={BG_PALETTE}
            onChange={c => setSettings(s => ({ ...s, bgColor: c }))}
          />
        </View>

        <Text style={[styles.section, { color: colors.mutedForeground }]}>Opacité du fond</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <OpacitySlider
            value={settings.bgOpacity}
            onChange={v => setSettings(s => ({ ...s, bgOpacity: v }))}
            primaryColor={settings.primaryColor}
          />
        </View>

        <Pressable
          onPress={() => setSettings(DEFAULT_WIDGET_SETTINGS)}
          style={[styles.resetBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.resetTxt, { color: colors.mutedForeground }]}>
            Réinitialiser les valeurs par défaut
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 16, gap: 8 },
  section: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  previewBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginTop: 16,
  },
  previewTitle: { fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  previewSub: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  previewBar: { flexDirection: 'row', gap: 12, marginTop: 4 },
  previewBarItem: { fontFamily: 'Inter_500Medium' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  chipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  paletteCell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paletteCellSelected: { borderColor: '#FFFFFF' },
  sliderHitArea: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderFill: {
    height: 5,
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    top: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  sliderLabel: {
    color: '#9E9E9E',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  resetBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  resetTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
