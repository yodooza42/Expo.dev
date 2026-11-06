import type { TripPhoto } from './trips';

export type PhotoSource = Pick<TripPhoto, 'uri' | 'galleryMetadata'>;

export interface TripPhotoRecoveryEntry {
  id: string;
  photoId: string;
  repairedAt: number;
  undoneAt?: number;
  before: PhotoSource;
  after: PhotoSource;
  context: {
    automatic: boolean;
    source: string;
    tripStartTime: number;
    tripEndTime: number;
    note?: string;
    expectedAt: number;
  };
}
