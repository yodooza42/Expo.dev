import type { GalleryRecoveryAsset, GalleryRecoveryCase, GalleryRecoveryCandidate } from '@/types/galleryRecovery';
import { photoFilename } from '@/utils/photoReferences';
import { haversineKm } from '@/utils/haversine';

function secondsBetween(a?: number, b?: number) {
  return a != null && b != null && Number.isFinite(a) && Number.isFinite(b)
    ? Math.abs(a - b) / 1000 : Infinity;
}

/** An old fallback at trip end is NOT a verified camera timestamp. */
export function photoEvidence(item: GalleryRecoveryCase) {
  const photo = item.original;
  return {
    timestamp: photo.galleryMetadata?.takenAt ?? (photo.takenAtEstimated ? undefined : photo.takenAt),
    reliableTime: photo.galleryMetadata?.takenAt != null || photo.takenAtEstimated === false,
    filename: (photo.galleryMetadata?.filename ?? photoFilename(photo.uri)).toLowerCase(),
  };
}

export function rankGalleryCandidates(item: GalleryRecoveryCase, assets: GalleryRecoveryAsset[]): GalleryRecoveryCandidate[] {
  const evidence = photoEvidence(item);
  const saved = item.original.galleryMetadata;
  const scored: GalleryRecoveryCandidate[] = [];
  for (const asset of assets) {
    const delta = secondsBetween(evidence.timestamp, asset.takenAt);
    const sameName = !!evidence.filename && evidence.filename === asset.filename.toLowerCase();
    const sameId = !!saved?.assetId && saved.assetId === asset.assetId;
    const inTrip = asset.takenAt != null && asset.takenAt >= item.tripStartTime - 30 * 60000
      && asset.takenAt <= item.tripEndTime + 30 * 60000;
    if (!sameName && !sameId && delta > 120 && !inTrip) continue;
    let score = 0;
    const reasons: string[] = [];
    if (sameName) { score += 45; reasons.push('Même nom de fichier'); }
    if (sameId) { score += 30; reasons.push('Même identifiant de galerie'); }
    if (delta <= 2) {
      score += 60;
      reasons.push(evidence.reliableTime ? 'Même heure de prise de vue (±2 s)' : 'Heure proche du lien ancien, à confirmer');
    } else if (delta <= 120) {
      score += Math.max(5, 25 - delta / 6);
      reasons.push(`Heure proche (écart ${Math.round(delta)} s)`);
    } else if (inTrip) {
      score += 2;
      reasons.push('Photo prise pendant la période du trajet');
    }
    if (saved?.width && saved.height && asset.width === saved.width && asset.height === saved.height) {
      score += 8; reasons.push('Mêmes dimensions');
    }
    // Only compare actual camera GPS for certainty, never a manually moved route anchor.
    if (saved?.lat != null && saved.lng != null && asset.lat != null && asset.lng != null
      && haversineKm(saved.lat, saved.lng, asset.lat, asset.lng) <= 0.03) {
      score += 20; reasons.push('Même position GPS de la photo');
    }
    scored.push({ ...asset, score, reasons });
  }
  return scored.sort((a, b) => b.score - a.score
    || secondsBetween(evidence.timestamp, a.takenAt) - secondsBetween(evidence.timestamp, b.takenAt)
    || a.assetId.localeCompare(b.assetId));
}

/** Unique time evidence, no near-duplicate, no competing souvenir, no partial scan. */
export function automaticGalleryMatches(cases: GalleryRecoveryCase[], complete: boolean) {
  const matches = new Map<string, GalleryRecoveryCandidate>();
  if (!complete) return matches;
  for (const item of cases) {
    const evidence = photoEvidence(item);
    const first = item.candidates[0];
    if (!first || secondsBetween(evidence.timestamp, first.takenAt) > 2) continue;
    const sameName = evidence.filename === first.filename.toLowerCase();
    // Legacy timestamps without provenance need corroborating filename evidence.
    if (!evidence.reliableTime && !sameName) continue;
    const second = item.candidates[1];
    if (second && (secondsBetween(evidence.timestamp, second.takenAt) <= 15 || first.score - second.score < 30)) continue;
    const competing = cases.some(other => other.key !== item.key && other.tripId === item.tripId
      && other.candidates.some(candidate => candidate.assetId === first.assetId
        && (secondsBetween(photoEvidence(other).timestamp, candidate.takenAt) <= 15
          || candidate.score >= first.score - 15)));
    if (competing) continue;
    matches.set(item.key, first);
  }
  return matches;
}
