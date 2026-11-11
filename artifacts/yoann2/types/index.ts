export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'idea' | 'todo' | 'inprogress' | 'waiting' | 'done';
export type ProjectStatus = 'idea' | 'todo' | 'inprogress' | 'waiting' | 'done' | 'abandoned';
export type EisenhowerQuadrant = 'do_now' | 'schedule' | 'delegate' | 'eliminate';
export type JournalProjectPhoto = { photoId: string; uri: string; dateLabel: string; sourceTitle: string };
export type JournalProjectPhotoSelection = JournalProjectPhoto | JournalProjectPhoto[];

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
  completedAt?: string;
  journalBeforeAfter?: {
    before?: JournalProjectPhotoSelection;
    after?: JournalProjectPhotoSelection;
  };
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | null;

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  /** Real completion day, independent of the parent task's completion day. */
  completedAt?: string;
  completedAtSource?: 'photo' | 'manual';
  /** Task photo URIs assigned to this subtask for its progress story. */
  photoUris?: string[];
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
  completedAt?: string;
  /** Photo URIs shared from the owning project rather than copied into the task. */
  projectPhotoUris?: string[];
  priority: Priority;
  importance: number;
  urgency: number;
  status: TaskStatus;
  eisenhower: EisenhowerQuadrant;
  recurrence?: RecurrenceType;
  recurrenceFromId?: string; // id of the original task this was spawned from
  subTasks?: SubTask[];
  /** Taken-at timestamps for protected task photos, keyed by their stored URI. */
  photoTakenAt?: Record<string, number>;
  /** Avoid asking again after the user accepts or dismisses a photo/subtask split. */
  subTaskPhotosReviewed?: boolean;
  // Rappel géolocalisé
  reminderLat?: number;
  reminderLng?: number;
  reminderRadius?: number; // mètres, défaut 100
  reminderAddress?: string;
}

export interface ProjectTimelineEvent {
  id: string;
  taskId: string;
  subTaskId?: string;
  kind: 'task' | 'subtask';
  title: string;
  taskTitle: string;
  dateLabel: string | null;
  timestamp: number | null;
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
  /** Geocoded street address for navigation (e.g. "12 rue de la Paix, Paris") */
  address?: string;
  /** Latitude from geocoding, used for widget navigation */
  addressLat?: number;
  /** Longitude from geocoding, used for widget navigation */
  addressLng?: number;
  date: string;
  time: string;
  category: string;
  createdAt: string;
  fromMarie?: boolean;
}

export type CalendarPeriodOwner = 'yoann' | 'marie' | 'both';

export interface CalendarPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string;
  owner: CalendarPeriodOwner;
  createdAt: string;
}

export interface AppStats {
  totalProjects: number;
  totalTasks: number;
  overdueTasks: number;
  completedTasks: number;
  globalProgress: number;
}
