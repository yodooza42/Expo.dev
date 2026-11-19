import type { SubTask, Task } from '@/types';

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

export function subTaskPhotoAssignmentKey(taskId: string, subTaskId: string): string {
  return `${taskId}:${subTaskId}`;
}

export function buildProjectPhotoAssignmentUpdates(
  tasks: Task[],
  projectPhotoUris: string[],
  assignments: Record<string, string>,
): Array<{ id: string; updates: Partial<Task> }> {
  const projectPhotos = [...new Set(projectPhotoUris)];
  const projectPhotoSet = new Set(projectPhotos);
  const updates: Array<{ id: string; updates: Partial<Task> }> = [];

  for (const task of tasks) {
    if (!task.subTasks?.length) continue;
    const assignedToTask = projectPhotos.filter(uri =>
      assignments[uri] && task.subTasks!.some(subTask =>
        subTaskPhotoAssignmentKey(task.id, subTask.id) === assignments[uri]),
    );
    const subTasks: SubTask[] = task.subTasks.map(subTask => {
      const keptPhotos = (subTask.photoUris ?? []).filter(uri => !projectPhotoSet.has(uri));
      const assignedPhotos = projectPhotos.filter(uri =>
        assignments[uri] === subTaskPhotoAssignmentKey(task.id, subTask.id),
      );
      return { ...subTask, photoUris: [...new Set([...keptPhotos, ...assignedPhotos])] };
    });

    const photos = [...new Set([...(task.photos ?? []), ...assignedToTask])];
    const projectPhotoRefs = [...new Set([...(task.projectPhotoUris ?? []), ...assignedToTask])];
    const sameSubTasks = subTasks.every((subTask, index) =>
      JSON.stringify(subTask.photoUris ?? []) === JSON.stringify(task.subTasks![index].photoUris ?? []),
    );
    const samePhotos = photos.length === (task.photos ?? []).length
      && photos.every((uri, index) => uri === task.photos[index]);
    const sameProjectRefs = projectPhotoRefs.length === (task.projectPhotoUris ?? []).length
      && projectPhotoRefs.every((uri, index) => uri === task.projectPhotoUris?.[index]);
    if (sameSubTasks && samePhotos && sameProjectRefs) continue;

    updates.push({
      id: task.id,
      updates: {
        subTasks,
        photos,
        projectPhotoUris: projectPhotoRefs,
      },
    });
  }

  return updates;
}
