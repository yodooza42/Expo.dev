import type { TripPhoto } from '@/types/trips';

export interface GalleryRecoveryAsset {
  assetId: string;
  uri: string;
  filename: string;
  takenAt?: number;
  width?: number;
  height?: number;
  lat?: number;
  lng?: number;
}

export interface GalleryRecoveryCandidate extends GalleryRecoveryAsset {
  score: number;
  reasons: string[];
}

export interface GalleryRecoveryCase {
  key: string;
  tripId: string;
  photoId: string;
  tripStartTime: number;
  tripEndTime: number;
  note?: string;
  expectedAt?: number;
  timeEstimated: boolean;
  original: TripPhoto;
  status: 'pending' | 'repaired' | 'skipped' | 'missing';
  candidates: GalleryRecoveryCandidate[];
}

export interface GalleryRecoveryReport {
  scannedAssets: number;
  automaticallyRepaired: number;
  manuallyRepaired: number;
  limitedAccess: boolean;
  issues: string[];
  cases: GalleryRecoveryCase[];
}
