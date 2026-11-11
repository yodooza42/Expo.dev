import { parseCompletionDate } from '@/utils/completionDate';
import type { Project, SubTask, Task } from '@/types';

function latestDate(values: Array<string | undefined>): string | undefined {
  const dated = values
    .map(value => ({ value, date: value ? parseCompletionDate(value) : null }))
    .filter((entry): entry is { value: string; date: Date } => !!entry.value && !!entry.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return dated[0]?.value;
}

/** Returns a parent task date only when every subtask is complete and dated. */
export function latestCompletedSubTaskDate(subTasks: SubTask[] | undefined): string | undefined {
  if (!subTasks?.length || subTasks.some(subTask => !subTask.done || !subTask.completedAt || !parseCompletionDate(subTask.completedAt))) {
    return undefined;
  }
  return latestDate(subTasks.map(subTask => subTask.completedAt));
}

/** Returns a project date only when it has tasks and every task is complete and dated. */
export function latestCompletedProjectTaskDate(project: Project, tasks: Task[]): string | undefined {
  const projectTasks = tasks.filter(task => task.projectId === project.id);
  if (!projectTasks.length || projectTasks.some(task =>
    task.status !== 'done' || !task.completedAt || !parseCompletionDate(task.completedAt)
  )) {
    return undefined;
  }
  return latestDate(projectTasks.map(task => task.completedAt));
}
