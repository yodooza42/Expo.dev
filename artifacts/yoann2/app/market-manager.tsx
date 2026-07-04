import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useState } from 'react';
import {
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

import { useColors } from '@/hooks/useColors';
import {
  type MarketAsset,
  type MarketOperation,
  type MarketRecurring,
  addMarketAsset,
  addMarketOperation,
  addMarketRecurring,
  computeAssetBalance,
  computeMarketBalance,
  deleteMarketAsset,
  deleteMarketOperation,
  deleteMarketRecurring,
  getMarketAssets,
  getMarketOperations,
  getMarketRecurrings,
  processMarketRecurrings,
  updateMarketAsset,
} from '@/utils/marketStorage';

const MKT_GREEN = '#10B981';

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string) {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T12:00:00'));
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ModalMode = 'add_asset' | 'edit_asset' | 'add_op' | 'add_recurring' | null;

export default function MarketManagerScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const [assets, setAssets]       = useState<MarketAsset[]>([]);
  const [ops, setOps]             = useState<MarketOperation[]>([]);
  const [recs, setRecs]           = useState<MarketRecurring[]>([]);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // Selected context for op/recurring forms
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [opType, setOpType]   = useState<'buy' | 'sell'>('buy');
  const [editAsset, setEditAsset] = useState<MarketAsset | null>(null);

  // Form fields
  const [fAmount, setFAmount]   = useState('');
  const [fFees, setFFees]       = useState('');
  const [fDate, setFDate]       = useState(todayIso());
  const [fNote, setFNote]       = useState('');
  const [fName, setFName]       = useState('');
  const [fTicker, setFTicker]   = useState('');
  const [fFreq, setFFreq]       = useState<'monthly' | 'weekly'>('monthly');

  const load = useCallback(async () => {
    await processMarketRecurrings();
    const [a, o, r] = await Promise.all([getMarketAssets(), getMarketOperations(), getMarketRecurrings()]);
    setAssets(a);
    setOps(o);
    setRecs(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAddAsset() {
    setFName(''); setFTicker(''); setEditAsset(null);
    setModalMode('add_asset');
  }
  function openEditAsset(a: MarketAsset) {
    setFName(a.name); setFTicker(a.ticker ?? ''); setEditAsset(a);
    setModalMode('edit_asset');
  }
  function openAddOp(assetId: string, type: 'buy' | 'sell') {
    setSelectedAssetId(assetId); setOpType(type);
    setFAmount(''); setFFees(''); setFDate(todayIso()); setFNote('');
    setModalMode('add_op');
  }
  function openAddRecurring(assetId: string) {
    setSelectedAssetId(assetId);
    setFAmount(''); setFFees(''); setFFreq('monthly'); setFNote('');
    setModalMode('add_recurring');
  }
  function closeModal() { setModalMode(null); }

  async function handleSaveAsset() {
    if (!fName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (editAsset) {
      await updateMarketAsset(editAsset.id, { name: fName.trim(), ticker: fTicker.trim() || undefined });
    } else {
      await addMarketAsset({ name: fName.trim(), ticker: fTicker.trim() || undefined });
    }
    closeModal();
    load();
  }

  async function handleDeleteAsset(a: MarketAsset) {
    Alert.alert('Supprimer', `Supprimer l'actif "${a.name}" et toutes ses opérations ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await deleteMarketAsset(a.id);
        if (expanded === a.id) setExpanded(null);
        load();
      }},
    ]);
  }

  async function handleSaveOp() {
    const amount = parseFloat(fAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !selectedAssetId) return;
    const fees = parseFloat(fFees.replace(',', '.')) || 0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addMarketOperation({
      assetId: selectedAssetId,
      type: opType,
      amount,
      fees,
      date: fDate || todayIso(),
      note: fNote.trim() || undefined,
    });
    closeModal();
    load();
  }

  async function handleDeleteOp(id: string) {
    await deleteMarketOperation(id);
    load();
  }

  async function handleSaveRecurring() {
    const amount = parseFloat(fAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !selectedAssetId) return;
    const fees = parseFloat(fFees.replace(',', '.')) || 0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextDate = new Date();
    if (fFreq === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    else nextDate.setDate(nextDate.getDate() + 7);
    await addMarketRecurring({
      assetId: selectedAssetId,
      amount,
      fees,
      frequency: fFreq,
      nextDate: nextDate.toISOString(),
      note: fNote.trim() || undefined,
    });
    closeModal();
    load();
  }

  async function handleDeleteRecurring(id: string) {
    await deleteMarketRecurring(id);
    load();
  }

  async function openTR(ticker?: string) {
    const url = ticker
      ? `https://app.traderepublic.com/#/search/${encodeURIComponent(ticker)}`
      : 'https://app.traderepublic.com';
    await WebBrowser.openBrowserAsync(url);
  }

  const totalBalance = computeMarketBalance(ops);

  const assetRecs = (assetId: string) => recs.filter(r => r.assetId === assetId);
  const assetOps  = (assetId: string) => ops.filter(o => o.assetId === assetId);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>📈 Marché</Text>
        <Pressable onPress={openAddAsset} hitSlop={12} style={styles.addBtn}>
          <MaterialCommunityIcons name="plus-circle-outline" size={24} color={MKT_GREEN} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Total card */}
        <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>CAPITAL INVESTI TOTAL</Text>
          <Text style={[styles.totalAmount, { color: MKT_GREEN }]}>{fmt(totalBalance)}</Text>
        </View>

        {assets.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun actif. Appuie sur + pour ajouter.</Text>
          </View>
        )}

        {assets.map(asset => {
          const isExpanded = expanded === asset.id;
          const bal = computeAssetBalance(ops, asset.id);
          const aOps = assetOps(asset.id);
          const aRecs = assetRecs(asset.id);
          return (
            <View key={asset.id} style={[styles.assetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Asset header row */}
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setExpanded(isExpanded ? null : asset.id); }}
                style={styles.assetHeader}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.assetNameRow}>
                    <Text style={[styles.assetName, { color: colors.foreground }]}>{asset.name}</Text>
                    {asset.ticker ? (
                      <Text style={[styles.assetTicker, { color: MKT_GREEN }]}>{asset.ticker}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.assetBal, { color: bal > 0 ? MKT_GREEN : colors.mutedForeground }]}>
                    {fmt(bal)} investi
                  </Text>
                </View>
                <View style={styles.assetHeaderRight}>
                  <Pressable
                    onPress={() => openTR(asset.ticker)}
                    style={[styles.trBtn, { backgroundColor: MKT_GREEN + '18', borderColor: MKT_GREEN + '40' }]}
                    hitSlop={8}
                  >
                    <Text style={[styles.trBtnTxt, { color: MKT_GREEN }]}>TR</Text>
                  </Pressable>
                  <MaterialCommunityIcons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.mutedForeground}
                  />
                </View>
              </Pressable>

              {isExpanded && (
                <View style={[styles.assetBody, { borderTopColor: colors.border }]}>
                  {/* Action buttons */}
                  <View style={styles.opBtnRow}>
                    <Pressable
                      onPress={() => openAddOp(asset.id, 'buy')}
                      style={[styles.opBtn, { backgroundColor: MKT_GREEN + '18', borderColor: MKT_GREEN + '40' }]}
                    >
                      <MaterialCommunityIcons name="arrow-down-circle-outline" size={15} color={MKT_GREEN} />
                      <Text style={[styles.opBtnTxt, { color: MKT_GREEN }]}>Acheter</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openAddOp(asset.id, 'sell')}
                      style={[styles.opBtn, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
                    >
                      <MaterialCommunityIcons name="arrow-up-circle-outline" size={15} color="#EF4444" />
                      <Text style={[styles.opBtnTxt, { color: '#EF4444' }]}>Vendre</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openAddRecurring(asset.id)}
                      style={[styles.opBtn, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}
                    >
                      <MaterialCommunityIcons name="repeat" size={15} color="#F59E0B" />
                      <Text style={[styles.opBtnTxt, { color: '#F59E0B' }]}>Récurrent</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openEditAsset(asset)}
                      style={[styles.opBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.mutedForeground} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteAsset(asset)}
                      style={[styles.opBtn, { backgroundColor: '#EF444412', borderColor: '#EF444430' }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#EF4444" />
                    </Pressable>
                  </View>

                  {/* Recurring templates */}
                  {aRecs.length > 0 && (
                    <View style={[styles.recSection, { borderTopColor: colors.border }]}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIREMENTS RÉCURRENTS</Text>
                      {aRecs.map(rec => (
                        <View key={rec.id} style={[styles.recRow, { backgroundColor: '#F59E0B0A', borderColor: '#F59E0B30' }]}>
                          <MaterialCommunityIcons name="repeat" size={14} color="#F59E0B" />
                          <Text style={[styles.recTxt, { color: colors.foreground }]}>
                            {fmt(rec.amount)}{rec.fees > 0 ? ` + ${fmt(rec.fees)} frais` : ''} · {rec.frequency === 'monthly' ? 'mensuel' : 'hebdo'}
                          </Text>
                          <Text style={[styles.recNext, { color: colors.mutedForeground }]}>
                            prochain {fmtDate(rec.nextDate)}
                          </Text>
                          <Pressable onPress={() => handleDeleteRecurring(rec.id)} hitSlop={10}>
                            <MaterialCommunityIcons name="close" size={14} color={colors.mutedForeground} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Operations list */}
                  {aOps.length === 0 && aRecs.length === 0 && (
                    <Text style={[styles.noOps, { color: colors.mutedForeground }]}>Aucune opération</Text>
                  )}
                  {aOps.length > 0 && (
                    <View style={[styles.opsSection, { borderTopColor: colors.border }]}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HISTORIQUE</Text>
                      {aOps.map(op => {
                        const isBuy = op.type === 'buy';
                        const color = isBuy ? MKT_GREEN : '#EF4444';
                        const total = isBuy ? op.amount + op.fees : -(op.amount - op.fees);
                        return (
                          <View key={op.id} style={[styles.opRow, { borderBottomColor: colors.border }]}>
                            <MaterialCommunityIcons
                              name={isBuy ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                              size={16}
                              color={color}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.opRowLabel, { color: colors.foreground }]}>
                                {isBuy ? 'Achat' : 'Vente'}{op.fees > 0 ? ` + ${fmt(op.fees)} frais` : ''}
                                {op.note ? `  ·  ${op.note}` : ''}
                              </Text>
                              <Text style={[styles.opRowDate, { color: colors.mutedForeground }]}>{fmtDate(op.date)}</Text>
                            </View>
                            <Text style={[styles.opRowAmount, { color }]}>
                              {isBuy ? '+' : '-'}{fmt(Math.abs(total))}
                            </Text>
                            <Pressable onPress={() => handleDeleteOp(op.id)} hitSlop={10} style={{ paddingLeft: 4 }}>
                              <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.mutedForeground} />
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* ── Modal ── */}
      <Modal visible={modalMode !== null} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={closeModal} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            {/* Add / Edit asset */}
            {(modalMode === 'add_asset' || modalMode === 'edit_asset') && (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {modalMode === 'edit_asset' ? 'Modifier l\'actif' : 'Nouvel actif'}
                </Text>
                <TextInput
                  value={fName}
                  onChangeText={setFName}
                  placeholder="Nom (ex: Engie, MSCI World…)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  autoFocus
                />
                <TextInput
                  value={fTicker}
                  onChangeText={setFTicker}
                  placeholder="Ticker optionnel (ex: ENGI.PA)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  autoCapitalize="characters"
                />
                <Pressable
                  onPress={handleSaveAsset}
                  style={[styles.saveBtn, { backgroundColor: MKT_GREEN, opacity: fName.trim() ? 1 : 0.4 }]}
                  disabled={!fName.trim()}
                >
                  <Text style={styles.saveBtnTxt}>Enregistrer</Text>
                </Pressable>
              </>
            )}

            {/* Add operation */}
            {modalMode === 'add_op' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {opType === 'buy' ? '📈 Achat' : '📉 Vente'}
                  {selectedAssetId ? `  —  ${assets.find(a => a.id === selectedAssetId)?.name ?? ''}` : ''}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={fAmount}
                    onChangeText={setFAmount}
                    placeholder="Montant €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    autoFocus
                  />
                  <TextInput
                    value={fFees}
                    onChangeText={setFFees}
                    placeholder="Frais €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.input, { width: 90, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                </View>
                <TextInput
                  value={fDate}
                  onChangeText={setFDate}
                  placeholder="Date (AAAA-MM-JJ)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <TextInput
                  value={fNote}
                  onChangeText={setFNote}
                  placeholder="Note optionnelle (ex: cours 14.52€/action)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                {fAmount.length > 0 && !isNaN(parseFloat(fAmount.replace(',', '.'))) && (
                  <Text style={[styles.totalHint, { color: opType === 'buy' ? MKT_GREEN : '#EF4444' }]}>
                    {opType === 'buy'
                      ? `Capital investi : ${fmt(parseFloat(fAmount.replace(',', '.')) + (parseFloat(fFees.replace(',', '.')) || 0))}`
                      : `Récupéré net : ${fmt(parseFloat(fAmount.replace(',', '.')) - (parseFloat(fFees.replace(',', '.')) || 0))}`
                    }
                  </Text>
                )}
                <Pressable
                  onPress={handleSaveOp}
                  style={[styles.saveBtn, { backgroundColor: opType === 'buy' ? MKT_GREEN : '#EF4444', opacity: fAmount.trim() ? 1 : 0.4 }]}
                  disabled={!fAmount.trim()}
                >
                  <Text style={styles.saveBtnTxt}>Enregistrer</Text>
                </Pressable>
              </>
            )}

            {/* Add recurring */}
            {modalMode === 'add_recurring' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  🔁 Achat récurrent
                  {selectedAssetId ? `  —  ${assets.find(a => a.id === selectedAssetId)?.name ?? ''}` : ''}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={fAmount}
                    onChangeText={setFAmount}
                    placeholder="Montant mensuel €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    autoFocus
                  />
                  <TextInput
                    value={fFees}
                    onChangeText={setFFees}
                    placeholder="Frais €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    style={[styles.input, { width: 90, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                </View>
                <View style={styles.freqRow}>
                  {(['monthly', 'weekly'] as const).map(f => (
                    <Pressable
                      key={f}
                      onPress={() => setFFreq(f)}
                      style={[
                        styles.freqBtn,
                        { borderColor: fFreq === f ? MKT_GREEN : colors.border, backgroundColor: fFreq === f ? MKT_GREEN + '18' : colors.background },
                      ]}
                    >
                      <Text style={[styles.freqBtnTxt, { color: fFreq === f ? MKT_GREEN : colors.mutedForeground }]}>
                        {f === 'monthly' ? 'Mensuel' : 'Hebdomadaire'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={fNote}
                  onChangeText={setFNote}
                  placeholder="Note optionnelle"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <Pressable
                  onPress={handleSaveRecurring}
                  style={[styles.saveBtn, { backgroundColor: '#F59E0B', opacity: fAmount.trim() ? 1 : 0.4 }]}
                  disabled={!fAmount.trim()}
                >
                  <Text style={styles.saveBtnTxt}>Activer</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  addBtn: { padding: 4 },

  totalCard: {
    margin: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  totalAmount: { fontSize: 28, fontFamily: 'Inter_700Bold' },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText:  { fontSize: 14, fontFamily: 'Inter_400Regular' },

  assetCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  assetNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  assetName:    { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  assetTicker:  { fontSize: 11, fontFamily: 'Inter_500Medium', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: '#10B98118' },
  assetBal:     { fontSize: 13, fontFamily: 'Inter_500Medium' },
  assetHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  trBtnTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },

  assetBody: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 12 },

  opBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  opBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  opBtnTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  sectionLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  recSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  recTxt:  { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  recNext: { fontSize: 11, fontFamily: 'Inter_400Regular' },

  opsSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
  noOps: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 },
  opRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  opRowLabel:  { fontSize: 12, fontFamily: 'Inter_500Medium' },
  opRowDate:   { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 1 },
  opRowAmount: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },

  row: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  totalHint: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  saveBtn:    { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  freqRow: { flexDirection: 'row', gap: 10 },
  freqBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  freqBtnTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
