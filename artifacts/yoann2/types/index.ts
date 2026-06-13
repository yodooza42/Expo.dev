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
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  notes: string;
  photos: string[];
  dueDate: string;
  createdAt: string;
  priority: Priority;
  importance: number;
  urgency: number;
  status: TaskStatus;
  eisenhower: EisenhowerQuadrant;
}

export interface Expense {
  id: string;
  projectId: string;
  name: string;
  amount: number;
  date: string;
  category: string;
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
