export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'idea' | 'todo' | 'inprogress' | 'waiting' | 'done';
export type ProjectStatus = 'idea' | 'todo' | 'inprogress' | 'waiting' | 'done' | 'abandoned';
export type EisenhowerQuadrant = 'do_now' | 'schedule' | 'delegate' | 'eliminate';

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  photos: string[];
  startDate: string;
  dueDate: string;
  budget: number;
  spent: number;
  priority: Priority;
  status: ProjectStatus;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | null;

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  notes: string;
  photos: string[];
  dueDate: string;
  createdAt: string;
  completedAt?: string;
  priority: Priority;
  importance: number;
  urgency: number;
  status: TaskStatus;
  eisenhower: EisenhowerQuadrant;
  recurrence?: RecurrenceType;
  recurrenceFromId?: string; // id of the original task this was spawned from
}

export interface Expense {
  id: string;
  projectId: string;
  taskId?: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  description?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Appointment {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  category: string;
  createdAt: string;
}

export interface AppStats {
  totalProjects: number;
  totalTasks: number;
  overdueTasks: number;
  completedTasks: number;
  globalProgress: number;
}
