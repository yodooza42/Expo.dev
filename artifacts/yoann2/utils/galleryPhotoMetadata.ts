import type { TripPhoto } from '@/types/trips';

/** Store source identity before a durable copy gives the file a different name. */
export function galleryPhotoMetadata(asset: {
  id?: string;
  assetId?: string | null;
  filename?: string;
  fileName?: string | null;
  width?: number;
  height?: number;
}, takenAt?: number): TripPhoto['galleryMetadata'] {
  return {
    assetId: asset.assetId ?? asset.id,
    filename: asset.filename ?? asset.fileName ?? undefined,
    width: asset.width, height: asset.height, takenAt,
  };
}
