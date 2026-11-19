import type { JournalProjectPhotoSelection, Project, Task } from '@/types';
import type { Trip } from '@/types/trips';
import type { LifeAlbum } from '@/utils/lifeAlbumCore';
import { PHOTOS_DIR, isLibraryRef, joinRel, monthStamp, refId, safeName, tripFolderName } from '@/utils/library/paths';

/**
 * Where each photo belongs, derived only from the data that references it:
 * Photos/Catégorie/Projet/Tâche/Sous-tâche, or Photos/Trajets/AAAA-MM/….
 */

export function projectFolder(project: Pick<Project, 'name' | 'category'> | undefined): string {
  return joinRel(PHOTOS_DIR, safeName(project?.category, 'Sans catégorie'), safeName(project?.name, 'Sans projet'));
}

export function taskFolder(
  project: Pick<Project, 'name' | 'category'> | undefined,
  taskTitle: string | undefined,
  subTaskTitle?: string,
): string {
  return joinRel(projectFolder(project), safeName(taskTitle, 'Tâche sans titre'), subTaskTitle ? safeName(subTaskTitle) : '');
}

export function tripTitle(trip: Pick<Trip, 'activityTitle' | 'endAddress' | 'startAddress'>): string {
  return trip.activityTitle?.trim() || trip.endAddress?.split(',')[0]?.trim() || 'Trajet';
}

export function tripFolder(trip: Pick<Trip, 'startTime' | 'activityTitle' | 'endAddress' | 'startAddress'>): string {
  return joinRel(PHOTOS_DIR, 'Trajets', monthStamp(trip.startTime), tripFolderName(trip.startTime, tripTitle(trip)));
}

export function selectionUris(selection: JournalProjectPhotoSelection | undefined): string[] {
  if (!selection) return [];
  return (Array.isArray(selection) ? selection : [selection]).map(item => item.uri);
}

export type PhotoData = { projects: Project[]; tasks: Task[]; trips: Trip[]; album?: LifeAlbum };

/** Every photo reference held by the data (library ids and legacy links). */
export function collectReferences(data: PhotoData): { ids: Set<string>; legacy: Set<string> } {
  const ids = new Set<string>();
  const legacy = new Set<string>();
  const add = (uri: string | undefined) => {
    if (!uri) return;
    if (isLibraryRef(uri)) ids.add(refId(uri)); else legacy.add(uri);
  };
  for (const project of data.projects) {
    project.photos?.forEach(add);
    selectionUris(project.journalBeforeAfter?.before).forEach(add);
    selectionUris(project.journalBeforeAfter?.after).forEach(add);
  }
  for (const task of data.tasks) {
    task.photos?.forEach(add);
    task.projectPhotoUris?.forEach(add);
    task.subTasks?.forEach(subTask => subTask.photoUris?.forEach(add));
  }
  for (const trip of data.trips) trip.photos?.forEach(photo => add(photo.uri));
  for (const photo of data.album?.photos ?? []) add(photo.uri);
  return { ids, legacy };
}

/** Expected folder for each library photo. Task ownership wins over project, then trips. */
export function expectedFolders(data: PhotoData): Map<string, string> {
  const result = new Map<string, string>();
  const projectsById = new Map(data.projects.map(project => [project.id, project]));
  for (const task of data.tasks) {
    const project = projectsById.get(task.projectId);
    const shared = new Set(task.projectPhotoUris ?? []);
    for (const uri of task.photos ?? []) {
      if (!isLibraryRef(uri) || shared.has(uri)) continue;
      const id = refId(uri);
      if (result.has(id)) continue;
      const owners = (task.subTasks ?? []).filter(subTask => subTask.photoUris?.includes(uri));
      result.set(id, taskFolder(project, task.title, owners.length === 1 ? owners[0]!.title : undefined));
    }
  }
  for (const project of data.projects) {
    for (const uri of project.photos ?? []) {
      if (isLibraryRef(uri) && !result.has(refId(uri))) result.set(refId(uri), projectFolder(project));
    }
  }
  for (const trip of data.trips) {
    for (const photo of trip.photos ?? []) {
      if (isLibraryRef(photo.uri) && !result.has(refId(photo.uri))) result.set(refId(photo.uri), tripFolder(trip));
    }
  }
  const albumFolder = joinRel(PHOTOS_DIR, 'Album de vie');
  for (const photo of data.album?.photos ?? []) {
    if (isLibraryRef(photo.uri) && !result.has(refId(photo.uri))) result.set(refId(photo.uri), albumFolder);
  }
  return result;
}
