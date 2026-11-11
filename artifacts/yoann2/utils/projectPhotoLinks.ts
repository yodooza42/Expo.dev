export function collectProjectPhotoUris(projectPhotoUris: string[], projectTaskPhotoUris: string[]): string[] {
  return [...new Set([...projectPhotoUris, ...projectTaskPhotoUris])];
}

export function getUnlinkedProjectPhotos(projectPhotoUris: string[], taskPhotoUris: string[]): string[] {
  const attached = new Set(taskPhotoUris);
  return [...new Set(projectPhotoUris)].filter(uri => !attached.has(uri));
}

export function attachProjectPhotoReferences(
  taskPhotoUris: string[],
  linkedProjectPhotoUris: string[] = [],
  selectedProjectPhotoUris: string[],
): { photos: string[]; projectPhotoUris: string[] } {
  const additions = [...new Set(selectedProjectPhotoUris)].filter(uri => !taskPhotoUris.includes(uri));
  return {
    photos: [...taskPhotoUris, ...additions],
    projectPhotoUris: [...new Set([...linkedProjectPhotoUris, ...additions])],
  };
}

export function isSharedProjectPhoto(
  uri: string,
  linkedProjectPhotoUris: string[] = [],
  projectPhotoUris: string[] = [],
): boolean {
  return linkedProjectPhotoUris.includes(uri) || projectPhotoUris.includes(uri);
}
