import { useSyncExternalStore } from 'react';

import { catalogueVersion, onCatalogueChange } from '@/utils/library/catalogue';

/** Re-render when photo files move or the catalogue is reloaded (new folder, restore). */
export function useCatalogueVersion(): number {
  return useSyncExternalStore(onCatalogueChange, catalogueVersion, catalogueVersion);
}
