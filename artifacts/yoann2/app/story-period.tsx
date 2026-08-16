import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { useColors } from '@/hooks/useColors';
import { pH } from '@/styles/header';
import type { Trip, Vehicle } from '@/types/trips';
import { getTrips, getVehicleSettings } from '@/utils/tripStorage';
import { buildStoryPeriodHtml } from '@/utils/storyGeneratorPeriod';

const MONTHS_FR = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const MONTHS_FULL_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formatte une plage de dates façon "du 13 au 15 Août 2026". */
function dateRangeLabelFr(from: Date, to: Date): string {
  const sameDay   = from.toDateString() === to.toDateString();
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const sameYear  = from.getFullYear() === to.getFullYear();
  if (sameDay) {
    return `le ${from.getDate()} ${MONTHS_FULL_FR[from.getMonth()]} ${from.getFullYear()}`;
  }
  if (sameMonth) {
    return `du ${from.getDate()} au ${to.getDate()} ${MONTHS_FULL_FR[from.getMonth()]} ${from.getFullYear()}`;
  }
  if (sameYear) {
    return `du ${from.getDate()} ${MONTHS_FULL_FR[from.getMonth()]} au ${to.getDate()} ${MONTHS_FULL_FR[to.getMonth()]} ${to.getFullYear()}`;
  }
  return `du ${from.getDate()} ${MONTHS_FULL_FR[from.getMonth()]} ${from.getFullYear()} au ${to.getDate()} ${MONTHS_FULL_FR[to.getMonth()]} ${to.getFullYear()}`;
}

function fmtDur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1)  return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function periodLabel(from: Date, to: Date): string {
  if (
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear() &&
    from.getDate() === 1 &&
    to.getDate() === new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate()
  ) {
    return `${MONTHS_FR[from.getMonth()]} ${from.getFullYear()}`;
  }
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${MONTHS_FR[from.getMonth()]} ${from.getFullYear()}`;
  }
  return `${from.getDate()} ${MONTHS_FR[from.getMonth()]} → ${to.getDate()} ${MONTHS_FR[to.getMonth()]} ${to.getFullYear()}`;
}

// ── Durée courante sélectionnée ────────────────────────────────────────────────
type StoryDur = 10 | 20 | 30 | 60 | 120;
const DURATIONS: StoryDur[] = [10, 20, 30, 60, 120];

export default function StoryPeriodScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const now = new Date();
  const [dateFrom, setDateFrom] = useState<Date>(() =>
    new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  );
  const [dateTo, setDateTo] = useState<Date>(() =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  );

  const [allTrips,  setAllTrips]  = useState<Trip[]>([]);
  const [vehicles,  setVehicles]  = useState<Vehicle[]>([]);
  const [duration,  setDuration]  = useState<StoryDur>(20);
  const [storyName, setStoryName] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerModalOpen, setPickerModalOpen] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress,     setProgress]     = useState(0);

  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [pickerDraft,  setPickerDraft]  = useState<Date>(new Date());

  const storyChunksRef = useRef<{ mime: string; chunks: string[]; total: number }>({ mime: 'video/mp4', chunks: [], total: 0 });
  const webViewRef   = useRef<WebView>(null);
  const storyHtml    = useRef(buildStoryPeriodHtml()).current;

  // ── Chargement des données ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getTrips(), getVehicleSettings()]).then(([t, v]) => {
      setAllTrips(t.sort((a, b) => a.startTime - b.startTime)); // ordre chrono
      setVehicles(v);
    });
  }, []);

  // ── Map vehicleId → Vehicle ────────────────────────────────────────────────
  const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);

  function getVType(t: Trip): 'car' | 'moto' | 'walk' {
    const v = vehicleMap.get(t.vehicle ?? '');
    if (!v) return 'car';
    return v.type === 'moto' ? 'moto' : v.type === 'walk' ? 'walk' : 'car';
  }

  // ── Trajets filtrés ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const fromMs = dateFrom.getTime();
    const toMs   = dateTo.getTime();
    return allTrips.filter(
      t => t.startTime >= fromMs && t.startTime <= toMs && t.vehicle !== 'ignored'
    );
  }, [allTrips, dateFrom, dateTo]);

  const withRoute = useMemo(
    () => filtered.filter(t => t.route && t.route.length >= 2),
    [filtered]
  );
  const withRouteIdsKey = useMemo(() => withRoute.map(t => t.id).join(','), [withRoute]);

  // Par défaut, tous les trajets avec tracé GPS de la période sont inclus.
  // On réinitialise la sélection uniquement quand l'ensemble de trajets disponibles
  // change (nouvelle période) — pas à chaque re-render.
  useEffect(() => {
    setSelectedIds(new Set(withRoute.map(t => t.id)));
  }, [withRouteIdsKey]);

  const selectedTrips = useMemo(
    () => withRoute.filter(t => selectedIds.has(t.id)),
    [withRoute, selectedIds]
  );

  function toggleTrip(id: string) {
    void Haptics.selectionAsync();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllTrips() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds(prev =>
      prev.size === withRoute.length ? new Set() : new Set(withRoute.map(t => t.id))
    );
  }

  // ── Stats de la période ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let carKm = 0, motoKm = 0, walkKm = 0, driveMs = 0, walkMs = 0;
    for (const t of filtered) {
      const type = getVType(t);
      const dur  = t.endTime - t.startTime;
      if (type === 'walk') { walkKm += t.distanceKm; walkMs += dur; }
      else if (type === 'moto') { motoKm += t.distanceKm; driveMs += dur; }
      else { carKm += t.distanceKm; driveMs += dur; }
    }
    return { carKm, motoKm, walkKm, driveMs, walkMs, total: carKm + motoKm + walkKm };
  }, [filtered, vehicleMap]);

  // ── WebView — assemblage des chunks ───────────────────────────────────────
  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(event.nativeEvent.data) as Record<string, unknown>; } catch { return; }

    if (msg.type === 'story_progress') {
      setProgress(msg.p as number ?? 0);
      return;
    }
    if (msg.type === 'story_chunk') {
      const idx   = msg.index as number ?? 0;
      const total = msg.total as number ?? 1;
      const mime  = msg.mime  as string ?? 'video/mp4';
      const data  = msg.data  as string ?? '';
      if (idx === 0) {
        storyChunksRef.current = { mime, chunks: new Array(total).fill(''), total };
      }
      storyChunksRef.current.chunks[idx] = data;
      const received = storyChunksRef.current.chunks.filter(s => s !== '').length;
      if (received === storyChunksRef.current.total) {
        const { mime: m, chunks } = storyChunksRef.current;
        const ext  = m === 'video/mp4' ? 'mp4' : 'webm';
        const path = `${FileSystem.cacheDirectory ?? ''}story_period_${Date.now()}.${ext}`;
        const b64  = chunks.join('');
        void (async () => {
          try {
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            setIsGenerating(false);
            await Sharing.shareAsync(path, { mimeType: m, dialogTitle: 'Partager la story période' });
          } catch {
            setIsGenerating(false);
            Alert.alert('Erreur', 'Impossible de générer la story.');
          }
        })();
      }
    }
  }, []);

  // ── Lancement de la génération ─────────────────────────────────────────────
  function handleGenerate() {
    if (selectedTrips.length === 0) {
      Alert.alert('Story', 'Aucun trajet sélectionné pour cette story.');
      return;
    }

    const tripsOpts = selectedTrips.map(t => {
      const d = new Date(t.startTime);
      return {
        route:       t.route!,
        distKm:      t.distanceKm,
        durationMs:  t.endTime - t.startTime,
        startTimeMs: t.startTime,
        vehicleType: getVType(t),
        dateLabel:   `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`,
      };
    });

    const driveDurTxt = stats.driveMs > 0 ? `🚗 ${fmtDur(stats.driveMs)}` : '';
    const walkDurTxt  = stats.walkMs  > 0 ? `${driveDurTxt ? '  ·  ' : ''}🚶 ${fmtDur(stats.walkMs)}` : '';

    const trimmedName = storyName.trim();

    const opts = {
      trips:         tripsOpts,
      periodLabel:   periodLabel(dateFrom, dateTo),
      tripCountLabel:`${selectedTrips.length} trajet${selectedTrips.length > 1 ? 's' : ''}`,
      driveDurLabel: driveDurTxt,
      walkDurLabel:  walkDurTxt,
      videoDurationSec: duration,
      customName:    trimmedName || undefined,
      dateRangeLabel: trimmedName ? dateRangeLabelFr(dateFrom, dateTo) : undefined,
    };

    setIsGenerating(true);
    setProgress(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    webViewRef.current?.injectJavaScript(
      `(function(){window.generatePeriodStory(${JSON.stringify(opts)});})();true;`
    );
  }

  // ── Date picker handlers ───────────────────────────────────────────────────
  function openPicker(target: 'from' | 'to') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerDraft(target === 'from' ? dateFrom : dateTo);
    setPickerTarget(target);
  }

  function handlePickerChange(_: unknown, selected?: Date) {
    setPickerTarget(null);
    if (!selected) return;
    if (pickerTarget === 'from') {
      const d = new Date(selected);
      d.setHours(0, 0, 0, 0);
      setDateFrom(d);
      if (d > dateTo) {
        const to = new Date(d);
        to.setHours(23, 59, 59, 999);
        setDateTo(to);
      }
    } else {
      const d = new Date(selected);
      d.setHours(23, 59, 59, 999);
      setDateTo(d);
      if (d < dateFrom) {
        const from = new Date(d);
        from.setHours(0, 0, 0, 0);
        setDateFrom(from);
      }
    }
  }

  const canGenerate = selectedTrips.length > 0 && !isGenerating;

  function vehIcon(t: Trip): { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string } {
    const type = getVType(t);
    if (type === 'walk') return { name: 'walk', color: '#4CAF50' };
    if (type === 'moto') return { name: 'motorbike', color: '#FF9800' };
    return { name: 'car', color: '#2196F3' };
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[pH.row, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[pH.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, flex: 1 }]}>Story Période</Text>
        <MaterialCommunityIcons name="movie-play-outline" size={20} color={colors.mutedForeground} style={{ marginRight: 4 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>

        {/* ── Sélection de la période ─────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PÉRIODE</Text>
        <View style={styles.dateRow}>
          <Pressable
            onPress={() => openPicker('from')}
            style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="calendar-start" size={16} color="#2196F3" />
            <View>
              <Text style={[styles.dateBtnLabel, { color: colors.mutedForeground }]}>Du</Text>
              <Text style={[styles.dateBtnValue, { color: colors.foreground }]}>{fmtDate(dateFrom)}</Text>
            </View>
          </Pressable>

          <MaterialCommunityIcons name="arrow-right" size={16} color={colors.mutedForeground} />

          <Pressable
            onPress={() => openPicker('to')}
            style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <MaterialCommunityIcons name="calendar-end" size={16} color="#2196F3" />
            <View>
              <Text style={[styles.dateBtnLabel, { color: colors.mutedForeground }]}>Au</Text>
              <Text style={[styles.dateBtnValue, { color: colors.foreground }]}>{fmtDate(dateTo)}</Text>
            </View>
          </Pressable>
        </View>

        {/* ── Résultats de la période ─────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>RÉSULTATS</Text>
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {filtered.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Aucun trajet dans cette période.
            </Text>
          ) : (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{filtered.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>trajet{filtered.length > 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#FFC107' }]}>{stats.total.toFixed(0)}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>km total</Text>
                </View>
                {stats.driveMs > 0 && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: '#2196F3' }]}>{fmtDur(stats.driveMs)}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>conduite</Text>
                  </View>
                )}
                {stats.walkMs > 0 && (
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: '#4CAF50' }]}>{fmtDur(stats.walkMs)}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>balade</Text>
                  </View>
                )}
              </View>

              {/* Détail par véhicule */}
              {(stats.carKm > 0 || stats.motoKm > 0 || stats.walkKm > 0) && (
                <View style={styles.vehRow}>
                  {stats.carKm > 0  && <Text style={[styles.vehChip, { color: '#2196F3' }]}>🚗 {stats.carKm.toFixed(0)} km</Text>}
                  {stats.motoKm > 0 && <Text style={[styles.vehChip, { color: '#FF9800' }]}>🏍 {stats.motoKm.toFixed(0)} km</Text>}
                  {stats.walkKm > 0 && <Text style={[styles.vehChip, { color: '#4CAF50' }]}>🚶 {stats.walkKm.toFixed(0)} km</Text>}
                </View>
              )}

              <Pressable
                onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickerModalOpen(true); }}
                disabled={withRoute.length === 0}
                style={styles.routeAvailRow}
              >
                <Text style={[styles.routeAvailText, { color: selectedTrips.length > 0 ? '#4CAF50' : colors.mutedForeground }]}>
                  {withRoute.length === 0
                    ? 'Aucun tracé GPS disponible'
                    : `✓ ${selectedTrips.length} / ${withRoute.length} trajet${withRoute.length > 1 ? 's' : ''} inclus dans la story`
                  }
                </Text>
                {withRoute.length > 0 && (
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.mutedForeground} />
                )}
              </Pressable>
            </>
          )}
        </View>

        {/* ── Nom personnalisé de la story ─────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>NOM (OPTIONNEL)</Text>
        <View style={[styles.nameBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            value={storyName}
            onChangeText={setStoryName}
            placeholder="Nom : Road trip La Rochelle"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.nameInput, { color: colors.foreground }]}
          />
        </View>
        {storyName.trim().length > 0 && (
          <Text style={[styles.namePreview, { color: colors.mutedForeground }]}>
            {`${storyName.trim()}\n${dateRangeLabelFr(dateFrom, dateTo)}`}
          </Text>
        )}

        {/* ── Durée de la vidéo ────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>DURÉE DE LA VIDÉO</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map(s => (
            <Pressable
              key={s}
              onPress={() => { void Haptics.selectionAsync(); setDuration(s); }}
              style={[
                styles.durChip,
                {
                  backgroundColor: duration === s ? '#2196F322' : colors.card,
                  borderColor:     duration === s ? '#2196F3'   : colors.border,
                },
              ]}
            >
              <Text style={[styles.durChipText, { color: duration === s ? '#2196F3' : colors.foreground }]}>
                {s === 120 ? '2 min' : s === 60 ? '1 min' : `${s} s`}
              </Text>
              {duration === s && (
                <MaterialCommunityIcons name="check" size={13} color="#2196F3" />
              )}
            </Pressable>
          ))}
        </View>

        {/* ── Bouton Générer ───────────────────────────────────────────── */}
        <Pressable
          onPress={handleGenerate}
          disabled={!canGenerate}
          style={({ pressed }) => [
            styles.generateBtn,
            { backgroundColor: canGenerate ? '#2196F3' : colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <MaterialCommunityIcons name="movie-play-outline" size={20} color={canGenerate ? '#fff' : colors.mutedForeground} />
          <Text style={[styles.generateBtnText, { color: canGenerate ? '#fff' : colors.mutedForeground }]}>
            {selectedTrips.length === 0
              ? 'Aucun trajet sélectionné'
              : `Générer la story · ${selectedTrips.length} trajet${selectedTrips.length > 1 ? 's' : ''}`
            }
          </Text>
        </Pressable>

        {/* Explication durée */}
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {`Animation : ${duration - 5} s · Récapitulatif final : 5 s`}
        </Text>

      </ScrollView>

      {/* Date pickers (Android natif) */}
      {pickerTarget !== null && (
        <DateTimePicker
          value={pickerDraft}
          mode="date"
          display="calendar"
          maximumDate={new Date()}
          onChange={handlePickerChange}
        />
      )}

      {/* Overlay de progression */}
      {isGenerating && (
        <View style={styles.progressOverlay}>
          <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={[styles.progressTitle, { color: colors.foreground }]}>
              Génération en cours…
            </Text>
            <View style={[styles.progressBarTrack, { backgroundColor: colors.muted }]}>
              <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: '#2196F3' }]} />
            </View>
            <Text style={[styles.progressPct, { color: colors.mutedForeground }]}>{progress}%</Text>
          </View>
        </View>
      )}

      {/* Modal — sélection des trajets inclus dans la story */}
      <Modal
        visible={pickerModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {`Trajets inclus (${selectedTrips.length}/${withRoute.length})`}
              </Text>
              <Pressable onPress={() => setPickerModalOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Pressable onPress={toggleAllTrips} style={styles.selectAllRow}>
              <MaterialCommunityIcons
                name={selectedTrips.length === withRoute.length ? 'checkbox-multiple-marked' : 'checkbox-multiple-blank-outline'}
                size={18}
                color="#2196F3"
              />
              <Text style={[styles.selectAllText, { color: '#2196F3' }]}>
                {selectedTrips.length === withRoute.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Text>
            </Pressable>

            <FlatList
              data={withRoute}
              keyExtractor={t => t.id}
              style={styles.modalList}
              renderItem={({ item }) => {
                const checked = selectedIds.has(item.id);
                const icon = vehIcon(item);
                const d = new Date(item.startTime);
                return (
                  <Pressable
                    onPress={() => toggleTrip(item.id)}
                    style={[styles.tripRow, { borderColor: colors.border }]}
                  >
                    <MaterialCommunityIcons
                      name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={20}
                      color={checked ? '#2196F3' : colors.mutedForeground}
                    />
                    <MaterialCommunityIcons name={icon.name} size={16} color={icon.color} style={{ marginLeft: 8 }} />
                    <View style={styles.tripRowInfo}>
                      <Text style={[styles.tripRowDate, { color: colors.foreground }]}>
                        {`${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`}
                      </Text>
                      <Text style={[styles.tripRowMeta, { color: colors.mutedForeground }]}>
                        {`${item.distanceKm.toFixed(1)} km${fmtDur(item.endTime - item.startTime) ? '  ·  ' + fmtDur(item.endTime - item.startTime) : ''}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <Pressable
              onPress={() => setPickerModalOpen(false)}
              style={[styles.modalDoneBtn, { backgroundColor: '#2196F3' }]}
            >
              <Text style={styles.modalDoneBtnText}>Valider</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* WebView caché — moteur de génération vidéo */}
      <WebView
        ref={webViewRef}
        source={{ html: storyHtml }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        style={styles.hiddenWebView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  headerTitle:     { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginLeft: 10 },

  scroll:          { padding: 16, gap: 10 },
  sectionLabel:    { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 },

  nameBox:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 4 },
  nameInput:       { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', paddingVertical: 10 },
  namePreview:     { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 17 },

  dateRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  dateBtnLabel:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  dateBtnValue:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 2 },

  statsCard:       { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  emptyText:       { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 8 },
  statsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statItem:        { alignItems: 'center', gap: 2, minWidth: 64 },
  statValue:       { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel:       { fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase' },
  vehRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  vehChip:         { fontSize: 13, fontFamily: 'Inter_500Medium' },
  routeAvailRow:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  routeAvailText:  { fontSize: 12, fontFamily: 'Inter_400Regular' },

  durationRow:     { flexDirection: 'row', gap: 8 },
  durChip:         {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, borderRadius: 10, borderWidth: 1, paddingVertical: 12,
  },
  durChipText:     { fontSize: 14, fontFamily: 'Inter_500Medium' },

  generateBtn:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, paddingVertical: 16, marginTop: 8,
  },
  generateBtnText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  hint:            { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  progressCard:    { borderRadius: 18, padding: 28, alignItems: 'center', gap: 16, width: 260 },
  progressTitle:   { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  progressBarTrack:{ width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  progressPct:     { fontSize: 13, fontFamily: 'Inter_400Regular' },

  hiddenWebView:   { position: 'absolute', width: 1, height: 1, opacity: 0, top: -100, left: -100 },

  modalOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle:      { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  selectAllRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 4 },
  selectAllText:   { fontSize: 14, fontFamily: 'Inter_500Medium' },
  modalList:       { maxHeight: 380 },
  tripRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tripRowInfo:     { marginLeft: 10, flex: 1 },
  tripRowDate:     { fontSize: 14, fontFamily: 'Inter_500Medium' },
  tripRowMeta:     { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  modalDoneBtn:    { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  modalDoneBtnText:{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
