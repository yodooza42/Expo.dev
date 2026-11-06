import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import type { GalleryRecoveryAsset, GalleryRecoveryCase, GalleryRecoveryReport } from '@/types/galleryRecovery';
import { photoCandidates, photoExists } from '@/utils/photoReferences';
import { getTrips } from '@/utils/tripStorage';
import { automaticGalleryMatches, photoEvidence, rankGalleryCandidates } from '@/utils/galleryPhotoMatching';
import { photoTakenAt } from '@/utils/tripPhotoPlacement';
import { relinkTripPhoto } from '@/utils/tripPhotoRecovery';

const MAX_ASSETS = 5000;
export class GalleryRecoveryCancelled extends Error {}
function active(isCurrent: () => boolean) {
  if (!isCurrent()) throw new GalleryRecoveryCancelled('Recherche annulée.');
}

export function recoveryWindows(cases: GalleryRecoveryCase[]) {
  const intervals = cases.flatMap(item => {
    const time = photoEvidence(item).timestamp;
    const windows = [{ start: item.tripStartTime - 30 * 60000, end: item.tripEndTime + 30 * 60000 }];
    if (time != null && Number.isFinite(time)) windows.push({ start: time - 120000, end: time + 120000 });
    return windows;
  }).filter(window => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end >= window.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const item of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

export async function resolveRecoveryAsset(asset: GalleryRecoveryAsset): Promise<GalleryRecoveryAsset> {
  const info = await MediaLibrary.getAssetInfoAsync(asset.assetId, { shouldDownloadFromNetwork: false });
  if (info.isNetworkAsset && !info.localUri) {
    throw new Error('Cette photo est uniquement dans le cloud. Télécharge son original dans la galerie puis réessaie.');
  }
  const location = info.location;
  return {
    assetId: info.id, uri: info.localUri ?? info.uri,
    filename: info.filename, width: info.width, height: info.height,
    takenAt: photoTakenAt(info.exif as Record<string, unknown> | undefined, info.creationTime),
    lat: location?.latitude, lng: location?.longitude,
  };
}

export async function applyGalleryCandidate(
  item: GalleryRecoveryCase, asset: GalleryRecoveryAsset, isCurrent: () => boolean, automatic = false,
) {
  active(isCurrent);
  const resolved = await resolveRecoveryAsset(asset);
  active(isCurrent);
  if (automatic && (resolved.filename !== asset.filename
    || resolved.takenAt == null || asset.takenAt == null || Math.abs(resolved.takenAt - asset.takenAt) > 2000)) {
    throw new Error('Les métadonnées de cette photo ont changé. Choisis la correspondance pour la confirmer.');
  }
  const { uri, ...metadata } = resolved;
  await relinkTripPhoto(item.tripId, item.photoId, uri, {
    metadata, isCurrent, expectedUri: item.original.uri,
  });
}

export async function searchGalleryTripPhotos(options: {
  tripId?: string;
  isCurrent: () => boolean;
  progress: (message: string) => void;
  onReport?: (report: GalleryRecoveryReport) => void;
}): Promise<GalleryRecoveryReport> {
  if (Platform.OS === 'web') throw new Error('La recherche dans la galerie est disponible dans l’application sur le téléphone.');
  const { isCurrent, progress } = options;
  active(isCurrent);
  progress('Vérification des liens des souvenirs…');
  const trips = (await getTrips()).filter(trip => !options.tripId || trip.id === options.tripId);
  const cases: GalleryRecoveryCase[] = [];
  for (const trip of trips) {
    for (const photo of trip.photos ?? []) {
      active(isCurrent);
      const candidates = await photoCandidates(photo.uri);
      let readable = false;
      for (const uri of candidates) if (await photoExists(uri)) { readable = true; break; }
      if (readable) continue;
      cases.push({
        key: JSON.stringify([trip.id, photo.id]), tripId: trip.id, photoId: photo.id,
        tripStartTime: trip.startTime, tripEndTime: trip.endTime,
        note: photo.note, expectedAt: photo.takenAt,
        timeEstimated: photo.galleryMetadata?.takenAt == null && photo.takenAtEstimated !== false,
        original: photo, status: 'pending', candidates: [],
      });
    }
  }
  const report: GalleryRecoveryReport = {
    scannedAssets: 0, automaticallyRepaired: 0, manuallyRepaired: 0, limitedAccess: false, issues: [], cases,
  };
  if (!cases.length) return report;
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  active(isCurrent);
  if (!permission.granted) {
    throw new Error('L’accès aux photos est refusé. Autorise les photos dans les réglages de l’application puis relance la recherche.');
  }
  report.limitedAccess = permission.accessPrivileges === 'limited';
  const assets = new Map<string, GalleryRecoveryAsset>();
  const windows = recoveryWindows(cases);
  let complete = !report.limitedAccess;
  if (!windows.length) {
    complete = false;
    report.issues.push('Les dates des trajets sont invalides ; aucune recherche automatique n’a été effectuée.');
  }
  outer: for (const window of windows) {
    let cursor: string | undefined;
    do {
      active(isCurrent);
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo', createdAfter: Math.max(0, window.start - 1),
        createdBefore: window.end + 1, first: 100, after: cursor,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      });
      active(isCurrent);
      for (const asset of page.assets) {
        assets.set(asset.id, {
          assetId: asset.id, uri: asset.uri, filename: asset.filename,
          takenAt: asset.creationTime, width: asset.width, height: asset.height,
        });
      }
      report.scannedAssets = assets.size;
      progress(`${assets.size} photo(s) de galerie examinée(s)…`);
      if (assets.size >= MAX_ASSETS) {
        complete = false;
        report.issues.push(`Recherche limitée à ${MAX_ASSETS} photos : aucun rattachement automatique. Relance depuis un trajet pour restreindre la période.`);
        break outer;
      }
      if (!page.hasNextPage) break;
      if (!page.endCursor || page.endCursor === cursor) {
        complete = false;
        report.issues.push('La galerie n’a pas fourni toutes les pages. Choisis les correspondances manuellement.');
        break;
      }
      cursor = page.endCursor;
    } while (true);
  }
  // Resolve precise EXIF/GPS only for plausible close matches, not the whole gallery.
  const shortlist = new Set<string>();
  for (const item of cases) {
    const evidence = photoEvidence(item);
    for (const asset of assets.values()) {
      if (asset.filename.toLowerCase() === evidence.filename
        || asset.assetId === item.original.galleryMetadata?.assetId
        || (evidence.timestamp != null && asset.takenAt != null && Math.abs(asset.takenAt - evidence.timestamp) <= 120000)) {
        shortlist.add(asset.assetId);
      }
    }
  }
  if (shortlist.size > 1000) {
    complete = false;
    report.issues.push('Trop de métadonnées candidates pour une recherche complète. Les choix restent disponibles, sans rattachement automatique.');
  } else {
    let done = 0, failed = 0;
    for (const id of shortlist) {
      active(isCurrent);
      progress(`Lecture des métadonnées ${++done}/${shortlist.size}…`);
      try { assets.set(id, await resolveRecoveryAsset(assets.get(id)!)); }
      catch { failed++; }
    }
    if (failed) {
      complete = false;
      report.issues.push(`${failed} photo(s) sans métadonnées lisibles ou uniquement dans le cloud. Aucun rattachement automatique ; confirme les choix lisibles.`);
    }
  }
  for (const item of cases) {
    item.candidates = rankGalleryCandidates(item, [...assets.values()]);
    if (!item.candidates.length) item.status = 'missing';
  }
  const automatic = automaticGalleryMatches(cases, complete);
  options.onReport?.({ ...report });
  for (const item of cases) {
    active(isCurrent);
    const candidate = automatic.get(item.key);
    if (!candidate) continue;
    progress(`Rattachement certain ${report.automaticallyRepaired + 1}/${automatic.size}…`);
    try {
      await applyGalleryCandidate(item, candidate, isCurrent, true);
      item.status = 'repaired';
      report.automaticallyRepaired++;
      options.onReport?.({ ...report, cases: [...cases] });
    } catch (error) {
      active(isCurrent);
      report.issues.push(`Photo non rattachée (${item.note || item.photoId}) : ${error instanceof Error ? error.message : 'accès impossible'}`);
    }
  }
  return report;
}
