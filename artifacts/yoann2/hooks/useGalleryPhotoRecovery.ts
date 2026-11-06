import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import type { GalleryRecoveryReport } from '@/types/galleryRecovery';
import type { TripPhotoRecoveryEntry } from '@/types/tripPhotoRecovery';
import { applyGalleryCandidate, searchGalleryTripPhotos } from '@/utils/galleryPhotoRecovery';
import { getTrips } from '@/utils/tripStorage';
import { canUndoPhotoRecovery, tripPhotoSourceReadable, undoTripPhotoRecovery } from '@/utils/tripPhotoRecovery';

interface HistoryItem {
  tripId: string;
  entry: TripPhotoRecoveryEntry;
  canUndo: boolean;
  needsSelection: boolean;
}

export function useGalleryPhotoRecovery(tripId?: string) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'undoing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<GalleryRecoveryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [undoNotice, setUndoNotice] = useState<{ tripId: string; missing: boolean } | null>(null);
  const serial = useRef(0);
  const busy = useRef(false);
  const loadHistory = useCallback(async () => {
    const trips = await getTrips();
    const items = await Promise.all(trips.filter(trip => !tripId || trip.id === tripId).flatMap(trip =>
      (trip.photoRecoveryHistory ?? []).map(async entry => {
        const photo = trip.photos?.find(photo => photo.id === entry.photoId);
        let needsSelection = false;
        if (entry.undoneAt != null && photo?.recoveryRevision === `undo-${entry.id}`) {
          try { needsSelection = !await tripPhotoSourceReadable(photo.uri); }
          catch { needsSelection = true; }
        }
        return { tripId: trip.id, entry, canUndo: canUndoPhotoRecovery(photo, entry), needsSelection };
      })));
    setHistory(items.sort((a, b) => b.entry.repairedAt - a.entry.repairedAt));
  }, [tripId]);
  const reportRef = useRef<GalleryRecoveryReport | null>(null);
  const publish = useCallback((next: GalleryRecoveryReport) => {
    reportRef.current = next;
    setReport(next);
  }, []);
  const cancel = useCallback(() => {
    serial.current++;
    busy.current = false;
    setPhase(reportRef.current ? 'ready' : 'idle');
    setProgress('');
  }, []);
  useEffect(() => () => { serial.current++; }, []);
  const start = useCallback(async (selection?: { tripId: string; manualOnly: boolean }) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++serial.current;
    const current = () => serial.current === id;
    setPhase('scanning');
    setError(null);
    setUndoNotice(null);
    reportRef.current = null;
    setReport(null);
    try {
      const next = await searchGalleryTripPhotos({
        tripId: selection?.tripId ?? tripId, manualOnly: selection?.manualOnly, isCurrent: current,
        progress: value => { if (current()) setProgress(value); },
        onReport: value => { if (current()) publish(value); },
      });
      if (!current()) return;
      publish(next);
      setPhase(next.cases.some(item => item.status === 'pending' || item.status === 'missing') ? 'ready' : 'done');
    } catch (failure) {
      if (!current()) return;
      setError(failure instanceof Error ? failure.message : 'La galerie est inaccessible.');
      setPhase('error');
    } finally {
      await loadHistory();
      if (current()) busy.current = false;
    }
  }, [tripId, publish, loadHistory]);
  const choose = useCallback(async (key: string, assetId: string) => {
    if (busy.current) return;
    const item = reportRef.current?.cases.find(value => value.key === key);
    const candidate = item?.candidates.find(value => value.assetId === assetId);
    if (!item || !candidate || item.status !== 'pending') return;
    busy.current = true;
    const id = ++serial.current;
    const current = () => serial.current === id;
    setPhase('applying');
    setError(null);
    setProgress('Protection et rattachement de la photo choisie…');
    try {
      await applyGalleryCandidate(item, candidate, current);
      if (!current() || !reportRef.current) return;
      const next = {
        ...reportRef.current, manuallyRepaired: reportRef.current.manuallyRepaired + 1,
        cases: reportRef.current.cases.map(value => value.key === key ? { ...value, status: 'repaired' as const } : value),
      };
      publish(next);
      setUndoNotice(null);
      setPhase(next.cases.some(value => value.status === 'pending' || value.status === 'missing') ? 'ready' : 'done');
    } catch (failure) {
      if (!current()) return;
      setError(failure instanceof Error ? failure.message : 'Impossible de rattacher cette photo. Le souvenir reste inchangé.');
      setPhase('ready');
    } finally {
      await loadHistory();
      if (current()) busy.current = false;
    }
  }, [publish, loadHistory]);
  const undo = useCallback(async (target: HistoryItem) => {
    if (busy.current) return;
    busy.current = true;
    const id = ++serial.current;
    const current = () => serial.current === id;
    setPhase('undoing');
    setProgress('Restauration de l’ancien lien…');
    setError(null);
    try {
      const photo = await undoTripPhotoRecovery(target.tripId, target.entry.id);
      // Checking accessibility must not turn a committed undo into an apparent failure.
      let readable = false;
      try { readable = await tripPhotoSourceReadable(photo.uri); } catch { /* Offer another selection. */ }
      if (!current()) return;
      setUndoNotice({ tripId: target.tripId, missing: !readable });
      const previous = reportRef.current;
      if (previous) {
        const belongs = previous.cases.some(item => item.tripId === target.tripId && item.photoId === photo.id && item.status === 'repaired');
        publish({
          ...previous,
          automaticallyRepaired: Math.max(0, previous.automaticallyRepaired - (belongs && target.entry.context.automatic ? 1 : 0)),
          manuallyRepaired: Math.max(0, previous.manuallyRepaired - (belongs && !target.entry.context.automatic ? 1 : 0)),
          cases: previous.cases.flatMap(item => {
            if (item.tripId !== target.tripId || item.photoId !== photo.id) return [item];
            if (readable) return [];
            return [{
              ...item, original: photo, note: photo.note, expectedAt: photo.takenAt,
              status: item.candidates.length ? 'pending' as const : 'missing' as const,
            }];
          }),
        });
      }
      setPhase('ready');
    } catch (failure) {
      if (!current()) return;
      setError(failure instanceof Error ? failure.message : 'Impossible d’annuler ce rattachement.');
      setPhase('ready');
    } finally {
      await loadHistory();
      if (current()) busy.current = false;
    }
  }, [loadHistory, publish]);
  const skip = useCallback((key: string) => {
    if (busy.current || !reportRef.current) return;
    const next = { ...reportRef.current, cases: reportRef.current.cases.map(item =>
      item.key === key && item.status !== 'repaired' ? { ...item, status: 'skipped' as const } : item) };
    publish(next);
    setPhase(next.cases.some(item => item.status === 'pending' || item.status === 'missing') ? 'ready' : 'done');
  }, [publish]);
  const manageAccess = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (reportRef.current?.limitedAccess) await MediaLibrary.presentPermissionsPickerAsync(['photo']);
    else await Linking.openSettings();
  }, []);
  return { phase, progress, report, error, history, undoNotice, loadHistory, undo, start, choose, skip, cancel, manageAccess };
}
