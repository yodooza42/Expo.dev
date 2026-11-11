import type { Project, Task } from '@/types';

export type CompletionPrompt =
  | {
      id: string;
      signature: string;
      kind: 'task';
      entityId: string;
      title: string;
      childCount: number;
    }
  | {
      id: string;
      signature: string;
      kind: 'project';
      entityId: string;
      title: string;
      childCount: number;
    };

function signature(parts: string[]): string {
  return parts.sort().join('|');
}

export function getCompletionPrompts(projects: Project[], tasks: Task[]): CompletionPrompt[] {
  const prompts: CompletionPrompt[] = [];
  const inactiveProjectIds = new Set(
    projects.filter(project => project.archived || project.status === 'abandoned').map(project => project.id),
  );

  for (const task of tasks) {
    const subTasks = task.subTasks ?? [];
    if (inactiveProjectIds.has(task.projectId) || task.status === 'done' || subTasks.length === 0 || !subTasks.every(subTask => subTask.done)) continue;
    prompts.push({
      id: `task:${task.id}`,
      signature: signature(subTasks.map(subTask => `${subTask.id}:${subTask.completedAt ?? ''}`)),
      kind: 'task',
      entityId: task.id,
      title: task.title,
      childCount: subTasks.length,
    });
  }

  for (const project of projects) {
    if (project.archived || project.status === 'done' || project.status === 'abandoned') continue;
    const projectTasks = tasks.filter(task => task.projectId === project.id);
    if (projectTasks.length === 0 || !projectTasks.every(task => task.status === 'done')) continue;
    prompts.push({
      id: `project:${project.id}`,
      signature: signature(projectTasks.map(task => `${task.id}:${task.completedAt ?? ''}:${task.status}`)),
      kind: 'project',
      entityId: project.id,
      title: project.name,
      childCount: projectTasks.length,
    });
  }

  return prompts;
}

export function getUndismissedCompletionPrompts(
  prompts: CompletionPrompt[],
  dismissed: Record<string, string>,
): CompletionPrompt[] {
  return prompts.filter(prompt => dismissed[prompt.id] !== prompt.signature);
}
