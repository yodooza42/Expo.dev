import type { Appointment, Project, SubTask, Task } from '@/types';

export type DayGroup = {
  dateKey: string;
  date: Date;
  label: string;
  tasks: Task[];
  subTasks?: { task: Task; subTask: SubTask }[];
  projects?: Project[];
};
export type WeekGroup = { weekKey: string; label: string; days: DayGroup[] };

export type BureauHistoryRow =
  | { key: string; kind: 'week' | 'day'; label: string }
  | { key: string; kind: 'task'; task: Task }
  | { key: string; kind: 'subtask'; task: Task; subTask: SubTask }
  | { key: string; kind: 'project'; project: Project }
  | { key: string; kind: 'appointment'; appointment: Appointment };

/** Each card is a virtualized row, not a whole day/week of eagerly mounted photos. */
export function buildBureauHistoryRows(
  weeks: WeekGroup[], showAppointments: boolean, appointmentsByDay: Map<string, Appointment[]>,
): BureauHistoryRow[] {
  const rows: BureauHistoryRow[] = [];
  for (const week of weeks) {
    rows.push({ key: `week:${week.weekKey}`, kind: 'week', label: week.label });
    for (const day of week.days) {
      const prefix = `${week.weekKey}:${day.dateKey}`;
      rows.push({ key: `day:${prefix}`, kind: 'day', label: day.label });
      for (const task of day.tasks)
        rows.push({ key: `task:${prefix}:${task.id}`, kind: 'task', task });
      for (const { task, subTask } of day.subTasks ?? [])
        rows.push({ key: `subtask:${prefix}:${task.id}:${subTask.id}`, kind: 'subtask', task, subTask });
      for (const project of day.projects ?? [])
        rows.push({ key: `project:${prefix}:${project.id}`, kind: 'project', project });
      if (showAppointments) for (const appointment of appointmentsByDay.get(day.dateKey) ?? [])
        rows.push({ key: `appointment:${prefix}:${appointment.id}`, kind: 'appointment', appointment });
    }
  }
  return rows;
}
