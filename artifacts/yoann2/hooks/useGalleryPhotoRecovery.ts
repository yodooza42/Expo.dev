import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import type { GalleryRecoveryReport } from '@/types/galleryRecovery';
import { applyGalleryCandidate, searchGalleryTripPhotos } from '@/utils/galleryPhotoRecovery';

export function useGalleryPhotoRecovery(tripId?: string) {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'ready' | 'applying' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<GalleryRecoveryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serial = useRef(0);
  const busy = useRef(false);
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
  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const id = ++serial.current;
    const current = () => serial.current === id;
    setPhase('scanning');
    setError(null);
    reportRef.current = null;
    setReport(null);
    try {
      const next = await searchGalleryTripPhotos({
        tripId, isCurrent: current,
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
      if (current()) busy.current = false;
    }
  }, [tripId, publish]);
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
      setPhase(next.cases.some(value => value.status === 'pending' || value.status === 'missing') ? 'ready' : 'done');
    } catch (failure) {
      if (!current()) return;
      setError(failure instanceof Error ? failure.message : 'Impossible de rattacher cette photo. Le souvenir reste inchangé.');
      setPhase('ready');
    } finally {
      if (current()) busy.current = false;
    }
  }, [publish]);
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
  return { phase, progress, report, error, start, choose, skip, cancel, manageAccess };
}
