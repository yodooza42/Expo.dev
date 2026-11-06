import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { GalleryRecoveryThumbnail } from '@/components/GalleryRecoveryThumbnail';
import { useColors } from '@/hooks/useColors';
import { useGalleryPhotoRecovery } from '@/hooks/useGalleryPhotoRecovery';
import type { GalleryRecoveryCandidate, GalleryRecoveryCase } from '@/types/galleryRecovery';

const PAGE = 12;

function fmt(ts?: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function GalleryPhotoRecoverySheet({ visible, onClose, tripId }: { visible: boolean; onClose: () => void; tripId?: string }) {
  const colors = useColors();
  const rec = useGalleryPhotoRecovery(tripId);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const cancelRef = useRef(rec.cancel);
  cancelRef.current = rec.cancel;
  useEffect(() => () => cancelRef.current(), []);
  const loadHistory = rec.loadHistory;
  useEffect(() => { if (visible) void loadHistory(); }, [visible, loadHistory]);
  const [historyLimit, setHistoryLimit] = useState(PAGE);

  const close = () => { if (rec.phase === 'scanning' || rec.phase === 'applying') rec.cancel(); onClose(); };
  const report = rec.report;
  const review = report?.cases.filter(c => c.status === 'pending' || c.status === 'missing') ?? [];
  const settled = report?.cases.filter(c => c.status === 'repaired' || c.status === 'skipped') ?? [];
  const busy = rec.phase === 'scanning' || rec.phase === 'applying' || rec.phase === 'undoing';
  const activeCase = review.find(item => item.key === activeKey) ?? review[0];
  const activeIndex = activeCase ? review.indexOf(activeCase) : -1;
  const t = { fg: colors.foreground, mu: colors.mutedForeground, pr: colors.primary };

  return (
    <BottomSheet visible={visible} onClose={close} maxHeight="92%">
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colors.muted }]}>
          <MaterialCommunityIcons name="image-search-outline" size={20} color={t.pr} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.fg }]}>Récupérer les photos</Text>
          <Text style={[styles.small, { color: t.mu }]}>Via la date, le nom et le GPS de la galerie</Text>
        </View>
        <Pressable onPress={close} hitSlop={10} testID="recovery-close" accessibilityRole="button" accessibilityLabel="Fermer">
          <MaterialCommunityIcons name="close" size={22} color={t.mu} />
        </Pressable>
      </View>

      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        {rec.phase === 'idle' && (
          <View style={[styles.box, { borderColor: colors.border }]}>
            <Text style={[styles.body, { color: t.fg }]}>
              Les liens cassés seront comparés à ta galerie. Les correspondances sûres sont réparées seules ; en cas de doute, tu choisis.
            </Text>
            <Text style={[styles.small, { color: t.mu }]}>Légendes, dates et positions sont conservées. Les photos originales ne sont pas modifiées.</Text>
          </View>
        )}

        {busy && (
          <View style={[styles.box, styles.row, { borderColor: colors.border }]}>
            <ActivityIndicator color={t.pr} />
            <Text style={[styles.body, { color: t.fg, flex: 1 }]}>{rec.progress || (rec.phase === 'scanning' ? 'Analyse de la galerie…' : 'Application…')}</Text>
          </View>
        )}

        {!!rec.error && (
          <View style={[styles.box, { borderColor: colors.destructive }]}>
            <Text style={[styles.body, { color: colors.destructive }]}>{rec.error ?? 'Une erreur est survenue.'}</Text>
            <Pressable onPress={() => { void rec.manageAccess().catch(() => {}); }} testID="recovery-permission-settings">
              <Text style={[styles.link, { color: t.pr }]}>Ouvrir les autorisations</Text>
            </Pressable>
          </View>
        )}

        {rec.undoNotice && (
          <View style={[styles.box, { borderColor: colors.border }]}>
            <Text style={[styles.body, { color: t.fg }]}>
              Rattachement annulé. Aucune photo ni copie n’a été supprimée.
            </Text>
            {rec.undoNotice.missing && <>
              <Text style={[styles.small, { color: t.mu }]}>L’ancien lien est toujours inaccessible. Choisis une autre correspondance ; aucun rattachement automatique ne sera refait pour ce souvenir.</Text>
              <Pressable testID="recovery-reselect" accessibilityRole="button" disabled={busy}
                onPress={() => { void rec.start({ tripId: rec.undoNotice!.tripId, manualOnly: true }); }}>
                <Text style={[styles.link, { color: t.pr }]}>Choisir une autre photo</Text>
              </Pressable>
            </>}
          </View>
        )}

        {report && (
          <>
            <View style={styles.stats}>
              <Stat label="Auto" value={report.automaticallyRepaired} c={colors} />
              <Stat label="Manuel" value={report.manuallyRepaired} c={colors} />
              <Stat label="À revoir" value={review.length} c={colors} />
              <Stat label="Analysées" value={report.scannedAssets} c={colors} />
            </View>
            {report.limitedAccess && (
              <View style={{ gap: 8 }}>
                <Note icon="lock-outline" color={t.pr} text="Accès limité : certaines photos peuvent manquer. Aucun rattachement automatique pour éviter une fausse correspondance." c={colors} />
                <Pressable onPress={() => { void rec.manageAccess().catch(() => {}); }} testID="recovery-expand-access">
                  <Text style={[styles.link, { color: t.pr }]}>Autoriser d’autres photos, puis relancer l’analyse</Text>
                </Pressable>
              </View>
            )}
            {report.issues.map((i, k) => <Note key={k} icon="alert-circle-outline" color={t.mu} text={i} c={colors} />)}
            {report.cases.length === 0 && (
              <Note icon="check-circle-outline" color={t.pr} text="Aucun lien cassé trouvé. Tout est en ordre." c={colors} />
            )}
            {report.cases.length > 0 && review.length === 0 && rec.phase !== 'scanning' && (
              <Note icon="check-circle-outline" color={t.pr} text="Terminé. Plus rien à revoir." c={colors} />
            )}
            {activeCase && !busy && (
              <>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Pressable disabled={activeIndex <= 0} onPress={() => setActiveKey(review[activeIndex - 1]!.key)}
                    testID="recovery-previous-case" accessibilityLabel="Souvenir précédent">
                    <Text style={[styles.link, { color: activeIndex <= 0 ? t.mu : t.pr }]}>Précédent</Text>
                  </Pressable>
                  <Text style={[styles.small, { color: t.mu }]}>{activeIndex + 1} / {review.length} à revoir</Text>
                  <Pressable disabled={activeIndex >= review.length - 1} onPress={() => setActiveKey(review[activeIndex + 1]!.key)}
                    testID="recovery-next-case" accessibilityLabel="Souvenir suivant">
                    <Text style={[styles.link, { color: activeIndex >= review.length - 1 ? t.mu : t.pr }]}>Suivant</Text>
                  </Pressable>
                </View>
                <CaseCard key={activeCase.key} c={activeCase} disabled={busy}
                  onChoose={a => rec.choose(activeCase.key, a)} onSkip={() => rec.skip(activeCase.key)} />
              </>
            )}
            {settled.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.section, { color: t.mu }]}>TRAITÉES</Text>
                {settled.map(c => (
                  <View key={c.key} style={[styles.row, styles.compact, { backgroundColor: colors.muted }]}>
                    <MaterialCommunityIcons name={c.status === 'repaired' ? 'check' : 'debug-step-over'} size={16} color={c.status === 'repaired' ? t.pr : t.mu} />
                    <Text numberOfLines={1} style={[styles.small, { color: t.fg, flex: 1 }]}>{c.note || fmt(c.expectedAt)}</Text>
                    <Text style={[styles.small, { color: t.mu }]}>{c.status === 'repaired' ? 'Réparée' : 'Ignorée'}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        {rec.history.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.section, { color: t.mu }]}>HISTORIQUE LOCAL DES RATTACHEMENTS</Text>
            <Text style={[styles.small, { color: t.mu }]}>Annuler rétablit l’ancien lien sans toucher aux légendes, dates, positions ou fichiers.</Text>
            {rec.history.slice(0, historyLimit).map(item => (
              <View key={item.entry.id} style={[styles.box, { borderColor: colors.border }]}>
                <Text numberOfLines={2} style={[styles.body, { color: t.fg }]}>{item.entry.context.note || 'Photo sans légende'}</Text>
                <Text style={[styles.small, { color: t.mu }]}>
                  {fmt(item.entry.repairedAt)} · {item.entry.context.automatic ? 'Automatique' : 'Choisie'}
                </Text>
                <Text numberOfLines={1} style={[styles.small, { color: t.mu }]}>{item.entry.after.galleryMetadata?.filename || 'Photo rattachée'}</Text>
                {item.entry.undoneAt != null ? (
                  <Text style={[styles.small, { color: t.mu }]}>Annulé le {fmt(item.entry.undoneAt)}</Text>
                ) : item.canUndo ? (
                  <Pressable testID={`recovery-undo-${item.entry.id}`} accessibilityRole="button"
                    accessibilityLabel="Annuler ce rattachement" disabled={busy}
                    onPress={() => Alert.alert('Annuler ce rattachement ?', 'L’ancien lien sera rétabli, même s’il est inaccessible. Les originaux et les copies seront conservés.', [
                      { text: 'Garder', style: 'cancel' },
                      { text: 'Annuler le rattachement', onPress: () => { void rec.undo(item); } },
                    ])}>
                    <Text style={[styles.link, { color: busy ? t.mu : t.pr }]}>Annuler le rattachement</Text>
                  </Pressable>
                ) : <Text style={[styles.small, { color: t.mu }]}>Source modifiée ou souvenir supprimé : annulation indisponible.</Text>}
                {item.needsSelection && (
                  <Pressable testID={`recovery-reselect-${item.entry.id}`} accessibilityRole="button" disabled={busy}
                    onPress={() => { void rec.start({ tripId: item.tripId, manualOnly: true }); }}>
                    <Text style={[styles.link, { color: busy ? t.mu : t.pr }]}>Ancien lien inaccessible : choisir une autre photo</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {rec.history.length > historyLimit && (
              <Pressable testID="recovery-more-history" onPress={() => setHistoryLimit(value => value + PAGE)}>
                <Text style={[styles.link, { color: t.pr }]}>Voir les rattachements précédents</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {(rec.phase === 'idle' || rec.phase === 'error' || rec.phase === 'done' || rec.phase === 'ready') && (
        <Pressable testID="recovery-start" accessibilityRole="button" onPress={() => { void rec.start(); }}
          style={({ pressed }) => [styles.primary, { backgroundColor: rec.phase === 'idle' || rec.phase === 'error' ? t.pr : colors.muted, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={[styles.btnText, { color: rec.phase === 'idle' || rec.phase === 'error' ? colors.primaryForeground : t.fg }]}>
            {rec.phase === 'idle' ? 'Lancer l\u2019analyse' : rec.phase === 'error' ? 'Réessayer' : 'Relancer l\u2019analyse'}
          </Text>
        </Pressable>
      )}
      {busy && rec.phase !== 'undoing' && (
        <Pressable testID="recovery-cancel" accessibilityRole="button" onPress={rec.cancel}
          style={[styles.primary, { backgroundColor: colors.muted }]}>
          <Text style={[styles.btnText, { color: t.fg }]}>Annuler</Text>
        </Pressable>
      )}
    </BottomSheet>
  );
}

type C = ReturnType<typeof useColors>;

function Stat({ label, value, c }: { label: string; value: number; c: C }) {
  return (
    <View style={[styles.stat, { backgroundColor: c.muted }]}>
      <Text style={[styles.statVal, { color: c.foreground }]}>{value}</Text>
      <Text style={[styles.tiny, { color: c.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function Note({ icon, color, text, c }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string; text: string; c: C }) {
  return (
    <View style={[styles.row, styles.box, { borderColor: c.border, alignItems: 'flex-start' }]}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={[styles.small, { color: c.foreground, flex: 1 }]}>{text}</Text>
    </View>
  );
}

function CaseCard({ c, onChoose, onSkip, disabled }: { c: GalleryRecoveryCase; onChoose: (assetId: string) => Promise<void>; onSkip: () => void; disabled: boolean }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState(Math.max(120, width - 80));
  const tileSize = Math.max(40, Math.floor((gridWidth - 12) / 3));
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<GalleryRecoveryCandidate | null>(null);
  const pending = c.status === 'pending';
  const list = c.candidates.slice(page * PAGE, (page + 1) * PAGE);
  const rest = c.candidates.length - (page + 1) * PAGE;

  const confirm = () => {
    if (!sel) return;
    Alert.alert('Remplacer le lien ?', `Utiliser « ${sel.filename} » (${fmt(sel.takenAt)}) pour cette photo ? Les fichiers existants sont conservés ; tu pourras annuler ce rattachement depuis l’historique local.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => { void onChoose(sel.assetId); } },
    ]);
  };

  return (
    <View style={[styles.box, { borderColor: colors.border, gap: 10 }]} testID={`recovery-case-${c.key}`}>
      <View style={styles.row}>
        <MaterialCommunityIcons name={pending ? 'help-circle-outline' : 'image-off-outline'} size={18} color={pending ? colors.primary : colors.mutedForeground} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[styles.body, { color: colors.foreground }]}>{c.note || 'Photo sans légende'}</Text>
          <Text style={[styles.small, { color: colors.mutedForeground }]}>Attendue vers {fmt(c.expectedAt)}</Text>
        </View>
      </View>
      {c.timeEstimated && (
        <Text style={[styles.tiny, { color: colors.primary }]}>Heure estimée : l'import d'origine peut différer de la prise de vue.</Text>
      )}
      {!pending && <Text style={[styles.small, { color: colors.mutedForeground }]}>Aucune candidate trouvée dans les périodes examinées. L’original peut se trouver ailleurs dans la galerie.</Text>}
      {pending && (
        <>
          <Text style={[styles.small, { color: colors.mutedForeground }]}>{c.candidates.length} possibilité{c.candidates.length > 1 ? 's' : ''} — touche pour sélectionner</Text>
          <View style={styles.grid} onLayout={event => {
            const measured = event.nativeEvent.layout.width;
            if (measured > 0) setGridWidth(measured);
          }}>
            {list.map(a => {
              const on = sel?.assetId === a.assetId;
              return (
                <View key={a.assetId} style={{ width: tileSize, gap: 2 }}>
                  <GalleryRecoveryThumbnail asset={a} size={tileSize} selected={on}
                    onSelect={() => { if (!disabled) setSel(on ? null : a); }}
                    onUnavailable={() => setSel(current => current?.assetId === a.assetId ? null : current)} />
                  <Text style={[styles.tiny, { color: colors.mutedForeground }]}>{fmt(a.takenAt)}</Text>
                </View>
              );
            })}
          </View>
          {(rest > 0 || page > 0) && (
            <View style={styles.row}>
              {page > 0 && <Pressable onPress={() => setPage(value => value - 1)} testID="recovery-previous-photos" hitSlop={6}>
                <Text style={[styles.link, { color: colors.primary }]}>Photos précédentes</Text>
              </Pressable>}
              {rest > 0 && <Pressable testID={`recovery-more-${c.key}`} onPress={() => setPage(value => value + 1)} hitSlop={6}>
                <Text style={[styles.link, { color: colors.primary }]}>Suivantes ({rest})</Text>
              </Pressable>}
            </View>
          )}
          {sel && (
            <View style={[styles.row, { backgroundColor: colors.muted, borderRadius: 10, padding: 8, alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={[styles.small, { color: colors.foreground }]}>{sel.filename}</Text>
                <Text style={[styles.tiny, { color: colors.mutedForeground }]}>{fmt(sel.takenAt)}</Text>
                {sel.reasons.map((r, i) => <Text key={i} style={[styles.tiny, { color: colors.mutedForeground }]}>• {r}</Text>)}
              </View>
            </View>
          )}
        </>
      )}
      <View style={styles.row}>
        <Pressable testID={`recovery-skip-${c.key}`} accessibilityRole="button" onPress={onSkip} disabled={disabled}
          style={[styles.btn, { backgroundColor: colors.muted }]}>
          <Text style={[styles.btnText, { color: colors.foreground }]}>Ignorer</Text>
        </Pressable>
        {pending && (
          <Pressable testID={`recovery-confirm-${c.key}`} accessibilityRole="button" onPress={confirm} disabled={!sel || disabled}
            style={[styles.btn, { backgroundColor: colors.primary, opacity: sel && !disabled ? 1 : 0.35 }]}>
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Utiliser cette photo</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  section: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  body: { fontSize: 14, fontFamily: 'Inter_500Medium', lineHeight: 19 },
  small: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  tiny: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 },
  link: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  compact: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  statVal: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  primary: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
