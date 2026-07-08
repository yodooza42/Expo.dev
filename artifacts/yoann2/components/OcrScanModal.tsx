import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useState } from 'react';

import { CameraOcrIcon } from '@/components/CameraOcrIcon';
import { genId } from '@/utils/ids';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useColors } from '@/hooks/useColors';
import { CategoryConfig, getCategoryConfigs } from '@/utils/bankStorage';
import { displayDateToIso, OcrLine, parseBankStatementText } from '@/utils/parseBankStatement';

type Step = 'pick' | 'processing' | 'review';

interface Props {
  visible: boolean;
  onClose: () => void;
}


export function OcrScanModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { projects, addTransactionCtx } = useApp();
  const [expCatConfigs, setExpCatConfigs] = React.useState<CategoryConfig[]>([]);
  React.useEffect(() => {
    getCategoryConfigs().then(cs => setExpCatConfigs(cs.filter(c => c.type === 'expense')));
  }, []);

  const [step, setStep] = useState<Step>('pick');
  const [lines, setLines] = useState<OcrLine[]>([]);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [catPickerFor, setCatPickerFor] = useState<string | null>(null);
  const [projPickerFor, setProjPickerFor] = useState<string | null>(null);

  function reset() {
    setStep('pick');
    setLines([]);
    setOcrError(null);
    setCatPickerFor(null);
    setProjPickerFor(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickAndProcess(source: 'camera' | 'library') {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission requise', 'Autorisez l\'accès à la caméra dans les paramètres.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.9, base64: false });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission requise', 'Autorisez l\'accès à la galerie dans les paramètres.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, base64: false });
      }

      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;
      setStep('processing');
      setOcrError(null);

      try {
        const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
        const recognized = await TextRecognition.recognize(uri);
        const rawText = recognized.text ?? '';
        const parsed = parseBankStatementText(rawText);

        if (parsed.length === 0) {
          setOcrError('Aucune ligne de dépense détectée. Vérifiez la qualité de l\'image et réessayez, ou ajoutez des lignes manuellement.');
          setLines([]);
        } else {
          setLines(parsed);
        }
        setStep('review');
      } catch (err) {
        setOcrError('Erreur lors de la reconnaissance OCR. Vérifiez que l\'image est nette et lisible.');
        setLines([]);
        setStep('review');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'accéder à la caméra ou à la galerie.');
      setStep('pick');
    }
  }

  function updateLine(id: string, patch: Partial<OcrLine>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function deleteLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function addBlankLine() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    setLines(prev => [...prev, {
      id: genId(),
      selected: true,
      date: `${dd}/${mm}/${today.getFullYear()}`,
      name: '',
      amount: '',
      category: '',
      projectId: projects[0]?.id ?? '',
    }]);
  }

  const selectedLines = lines.filter(l => l.selected);

  async function handleImport() {
    const toImport = selectedLines.filter(l => l.name.trim() && parseFloat(l.amount) > 0);
    if (toImport.length === 0) {
      Alert.alert('Aucune dépense valide', 'Renseignez au moins un nom et un montant pour chaque ligne sélectionnée.');
      return;
    }
    if (toImport.some(l => !l.projectId)) {
      Alert.alert('Projet manquant', 'Assignez un projet à chaque dépense sélectionnée avant d\'importer.');
      return;
    }

    for (const l of toImport) {
      await addTransactionCtx({
        type: 'expense',
        projectId: l.projectId,
        label: l.name.trim(),
        amount: parseFloat(l.amount) || 0,
        date: displayDateToIso(l.date),
        category: l.category,
        userNote: 'Importé via OCR',
      });
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Importé !', `${toImport.length} dépense${toImport.length > 1 ? 's ajoutées' : ' ajoutée'} avec succès.`, [
      { text: 'OK', onPress: handleClose },
    ]);
  }

  const catPickerLine = catPickerFor ? lines.find(l => l.id === catPickerFor) : null;
  const projPickerLine = projPickerFor ? lines.find(l => l.id === projPickerFor) : null;

  const cardBg = colors.card;
  const border = colors.border;
  const fg = colors.foreground;
  const muted = colors.mutedForeground;
  const primary = colors.primary;
  const bg = colors.background;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: bg, borderBottomColor: border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: fg }]}>Scan relevé bancaire</Text>
            {step === 'review' && (
              <Text style={[styles.subtitle, { color: muted }]}>
                {ocrError ? 'Erreur OCR — saisie manuelle possible' : `${lines.length} ligne${lines.length !== 1 ? 's' : ''} détectée${lines.length !== 1 ? 's' : ''}`}
              </Text>
            )}
          </View>
          {step !== 'pick' && (
            <Pressable
              onPress={() => { reset(); }}
              hitSlop={8}
              style={[styles.iconBtn, { backgroundColor: cardBg, borderColor: border }]}
            >
              <MaterialCommunityIcons name="restart" size={18} color={muted} />
            </Pressable>
          )}
          <Pressable
            onPress={handleClose}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: cardBg, borderColor: border }]}
          >
            <MaterialCommunityIcons name="close" size={18} color={muted} />
          </Pressable>
        </View>

        {/* ── Step: Pick ─────────────────────────────────────── */}
        {step === 'pick' && (
          <View style={styles.pickWrap}>
            <View style={[styles.ocrIconCircle, { backgroundColor: primary + '18', borderColor: primary + '40' }]}>
              <CameraOcrIcon size={48} color={primary} />
            </View>
            <Text style={[styles.pickTitle, { color: fg }]}>Scanner un relevé</Text>
            <Text style={[styles.pickHint, { color: muted }]}>
              Prenez en photo ou importez une image de votre relevé bancaire. L'OCR extrait automatiquement les lignes de dépenses.
            </Text>
            <View style={styles.pickBtns}>
              <Pressable
                onPress={() => pickAndProcess('camera')}
                style={[styles.pickBtn, { backgroundColor: primary }]}
              >
                <MaterialCommunityIcons name="camera-outline" size={22} color="#121212" />
                <Text style={[styles.pickBtnTxt, { color: '#121212' }]}>Caméra</Text>
              </Pressable>
              <Pressable
                onPress={() => pickAndProcess('library')}
                style={[styles.pickBtn, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
              >
                <MaterialCommunityIcons name="image-outline" size={22} color={primary} />
                <Text style={[styles.pickBtnTxt, { color: fg }]}>Galerie</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step: Processing ───────────────────────────────── */}
        {step === 'processing' && (
          <View style={styles.processingWrap}>
            <ActivityIndicator size="large" color={primary} />
            <Text style={[styles.processingTxt, { color: fg }]}>Analyse OCR en cours…</Text>
            <Text style={[styles.processingHint, { color: muted }]}>Extraction du texte depuis l'image</Text>
          </View>
        )}

        {/* ── Step: Review ───────────────────────────────────── */}
        {step === 'review' && (
          <>
            <ScrollView
              style={styles.reviewScroll}
              contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 10 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Error notice */}
              {ocrError && (
                <View style={[styles.errorBox, { backgroundColor: '#FF534420', borderColor: '#FF5344' }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF5344" />
                  <Text style={[styles.errorTxt, { color: '#FF5344' }]}>{ocrError}</Text>
                </View>
              )}

              {/* Expense lines */}
              {lines.map((line, idx) => (
                <ExpenseLine
                  key={line.id}
                  line={line}
                  index={idx}
                  expenseCategories={expCatConfigs}
                  projects={projects}
                  onChange={patch => updateLine(line.id, patch)}
                  onDelete={() => deleteLine(line.id)}
                  onPickCategory={() => { Haptics.selectionAsync(); setCatPickerFor(line.id); }}
                  onPickProject={() => { Haptics.selectionAsync(); setProjPickerFor(line.id); }}
                  colors={{ cardBg, border, fg, muted, primary, bg }}
                />
              ))}

              {/* Add line */}
              <Pressable
                onPress={() => { Haptics.selectionAsync(); addBlankLine(); }}
                style={[styles.addLineBtn, { borderColor: border }]}
              >
                <MaterialCommunityIcons name="plus" size={16} color={muted} />
                <Text style={[styles.addLineTxt, { color: muted }]}>Ajouter une ligne</Text>
              </Pressable>
            </ScrollView>

            {/* Import bar */}
            <View style={[styles.importBar, { backgroundColor: bg, borderTopColor: border, paddingBottom: insets.bottom + 12 }]}>
              <Pressable
                onPress={handleImport}
                disabled={selectedLines.length === 0}
                style={[
                  styles.importBtn,
                  { backgroundColor: selectedLines.length === 0 ? primary + '40' : primary },
                ]}
              >
                <MaterialCommunityIcons name="check-all" size={18} color="#121212" />
                <Text style={styles.importBtnTxt}>
                  {selectedLines.length === 0
                    ? 'Sélectionnez des dépenses'
                    : `Importer ${selectedLines.length} dépense${selectedLines.length > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Category picker ────────────────────────────────── */}
        <Modal
          visible={!!catPickerFor}
          animationType="slide"
          transparent
          onRequestClose={() => setCatPickerFor(null)}
        >
          <Pressable style={styles.pickerBackdrop} onPress={() => setCatPickerFor(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: cardBg, borderColor: border, paddingBottom: insets.bottom + 8 }]}>
            <Text style={[styles.pickerTitle, { color: fg }]}>Catégorie</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {['', ...expCatConfigs.map((c: CategoryConfig) => c.name)].map((name, i) => {
                const isSelected = catPickerLine?.category === name;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      if (catPickerFor) updateLine(catPickerFor, { category: name });
                      setCatPickerFor(null);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: border }]}
                  >
                    <Text style={[styles.pickerRowTxt, { color: isSelected ? primary : fg }]}>
                      {name || 'Non classé'}
                    </Text>
                    {isSelected && <MaterialCommunityIcons name="check" size={16} color={primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Modal>

        {/* ── Project picker ─────────────────────────────────── */}
        <Modal
          visible={!!projPickerFor}
          animationType="slide"
          transparent
          onRequestClose={() => setProjPickerFor(null)}
        >
          <Pressable style={styles.pickerBackdrop} onPress={() => setProjPickerFor(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: cardBg, borderColor: border, paddingBottom: insets.bottom + 8 }]}>
            <Text style={[styles.pickerTitle, { color: fg }]}>Projet</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {projects.map(p => {
                const isSelected = projPickerLine?.projectId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      if (projPickerFor) updateLine(projPickerFor, { projectId: p.id });
                      setProjPickerFor(null);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: border }]}
                  >
                    <Text style={[styles.pickerRowTxt, { color: isSelected ? primary : fg }]}>{p.name}</Text>
                    {isSelected && <MaterialCommunityIcons name="check" size={16} color={primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Sub-component: ExpenseLine ──────────────────────────────────────────────

interface ExpenseLineProps {
  line: OcrLine;
  index: number;
  expenseCategories: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  onChange: (patch: Partial<OcrLine>) => void;
  onDelete: () => void;
  onPickCategory: () => void;
  onPickProject: () => void;
  colors: { cardBg: string; border: string; fg: string; muted: string; primary: string; bg: string };
}

function ExpenseLine({ line, index, projects, onChange, onDelete, onPickCategory, onPickProject, colors: c }: ExpenseLineProps) {
  const projName = projects.find(p => p.id === line.projectId)?.name ?? '';

  return (
    <View style={[styles.lineCard, { backgroundColor: c.cardBg, borderColor: line.selected ? c.primary + '60' : c.border }]}>
      {/* Row 1: checkbox + date + amount + delete */}
      <View style={styles.lineRow1}>
        <Pressable
          onPress={() => onChange({ selected: !line.selected })}
          hitSlop={6}
          style={[styles.checkbox, { borderColor: line.selected ? c.primary : c.border, backgroundColor: line.selected ? c.primary + '20' : 'transparent' }]}
        >
          {line.selected && <MaterialCommunityIcons name="check" size={12} color={c.primary} />}
        </Pressable>

        <TextInput
          value={line.date}
          onChangeText={v => onChange({ date: v })}
          placeholder="jj/mm/aaaa"
          placeholderTextColor={c.muted}
          keyboardType="numeric"
          style={[styles.dateInput, { color: c.fg, borderColor: c.border }]}
        />

        <View style={[styles.amountBox, { borderColor: c.border }]}>
          <TextInput
            value={line.amount}
            onChangeText={v => onChange({ amount: v.replace(',', '.') })}
            placeholder="0.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            style={[styles.amountInput, { color: c.primary }]}
          />
          <Text style={[styles.euro, { color: c.muted }]}>€</Text>
        </View>

        <Pressable onPress={onDelete} hitSlop={6} style={styles.deleteBtn}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={c.muted} />
        </Pressable>
      </View>

      {/* Row 2: name */}
      <TextInput
        value={line.name}
        onChangeText={v => onChange({ name: v })}
        placeholder="Libellé de la dépense"
        placeholderTextColor={c.muted}
        style={[styles.nameInput, { color: c.fg, borderColor: c.border }]}
        multiline={false}
      />

      {/* Row 3: category + project */}
      <View style={styles.lineRow3}>
        <Pressable
          onPress={onPickCategory}
          style={[styles.tagChip, { backgroundColor: c.border + '60', borderColor: c.border }]}
        >
          <MaterialCommunityIcons name="tag-outline" size={12} color={c.muted} />
          <Text style={[styles.tagTxt, { color: line.category ? c.fg : c.muted }]} numberOfLines={1}>
            {line.category || 'Catégorie'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onPickProject}
          style={[styles.tagChip, { backgroundColor: c.border + '60', borderColor: line.projectId ? c.primary + '40' : c.border }]}
        >
          <MaterialCommunityIcons name="folder-outline" size={12} color={line.projectId ? c.primary : c.muted} />
          <Text style={[styles.tagTxt, { color: line.projectId ? c.primary : c.muted }]} numberOfLines={1}>
            {projName || 'Projet *'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  // Pick
  pickWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  ocrIconCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  pickHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  pickBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  pickBtnTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },

  // Processing
  processingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  processingTxt: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  processingHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Review
  reviewScroll: { flex: 1 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: 1 },
  errorTxt: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  addLineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12 },
  addLineTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  // Import bar
  importBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  importBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#121212' },

  // Line card
  lineCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  lineRow1: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dateInput: { fontSize: 12, fontFamily: 'Inter_500Medium', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, width: 96 },
  amountBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  amountInput: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', minWidth: 50 },
  euro: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  deleteBtn: { padding: 4 },
  nameInput: { fontSize: 13, fontFamily: 'Inter_400Regular', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  lineRow3: { flexDirection: 'row', gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, flex: 1 },
  tagTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  // Pickers
  pickerBackdrop: { flex: 1, backgroundColor: '#00000060' },
  pickerSheet: { maxHeight: '60%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, padding: 16 },
  pickerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerRowTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
