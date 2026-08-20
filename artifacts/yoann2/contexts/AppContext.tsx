import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Appointment, AppStats, CalendarPeriod, Category, Priority, Project, Task, TaskStatus } from '@/types';
import { saveBackup } from '@/utils/backup';
import { genId } from '@/utils/ids';
import { ensureAllTaskFolders, ensureTaskFolder } from '@/utils/photoStorage';
import {
  BankTransaction,
  getTransactions,
  saveTransactions,
  addTransaction as bankAddTx,
  updateTransaction as bankUpdateTx,
  deleteTransaction as bankDeleteTx,
  migrateExpensesToTransactions,
} from '@/utils/bankStorage';
import {
  SEED_APPOINTMENTS,
  SEED_BANK_RECURRING,
  SEED_BANK_SAVINGS,
  SEED_BANK_TRANSACTIONS,
  SEED_CATEGORIES,
  SEED_EXPENSE_CATEGORIES,
  SEED_EXPENSES,
  SEED_KNOWN_PLACES,
  SEED_NAV_SHORTCUTS,
  SEED_PLACE_CATEGORIES,
  SEED_PROJECTS,
  SEED_TASKS,
  SEED_TRIPS,
  SEED_VERSION,
} from '@/utils/seedData';
import {
  getApptReminderPref,
  scheduleAppointmentReminders,
} from '@/utils/notificationScheduler';
import { updateTodoWidget } from '@/widgets/updateWidget';

const STORAGE_KEYS = {
  PROJECTS: '@yoann2_projects',
  TASKS: '@yoann2_tasks',
  EXPENSES: '@yoann2_expenses',
  CATEGORIES: '@yoann2_categories',
  EXPENSE_CATEGORIES: '@yoann2_expense_categories',
  APPOINTMENTS: '@yoann2_appointments',
  CALENDAR_PERIODS: '@yoann2_calendar_periods',
  INITIALIZED: '@yoann2_initialized',
  SEED_VERSION: '@yoann2_seed_version',
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_garage', name: 'Garage' },
  { id: 'cat_atelier', name: 'Atelier' },
  { id: 'cat_maison', name: 'Maison' },
  { id: 'cat_jardin', name: 'Jardin' },
  { id: 'cat_pergola', name: 'Pergola' },
  { id: 'cat_terrasse', name: 'Terrasse' },
  { id: 'cat_vehicule', name: 'Véhicule' },
  { id: 'cat_admin', name: 'Administratif' },
  { id: 'cat_perso', name: 'Personnel' },
];


function computeEisenhower(urgency: number, importance: number): Task['eisenhower'] {
  const isUrgent = urgency >= 2;
  const isImportant = importance >= 2;
  if (isUrgent && isImportant) return 'do_now';
  if (!isUrgent && isImportant) return 'schedule';
  if (isUrgent && !isImportant) return 'delegate';
  return 'eliminate';
}

function makeTask(
  projectId: string,
  title: string,
  status: TaskStatus,
  priority: Priority,
  daysOffset: number
): Task {
  const due = new Date();
  due.setDate(due.getDate() + daysOffset);
  const importance = priority === 'critical' ? 3 : priority === 'high' ? 3 : 2;
  const urgency = daysOffset < 0 ? 3 : daysOffset < 7 ? 3 : 2;
  return {
    id: genId(),
    projectId,
    title,
    description: '',
    notes: '',
    photos: [],
    dueDate: due.toISOString(),
    createdAt: new Date().toISOString(),
    priority,
    importance,
    urgency,
    status,
    eisenhower: computeEisenhower(urgency, importance),
  };
}

function createSampleData(): { projects: Project[]; tasks: Task[] } {
  const now = new Date().toISOString();
  const inMonth = new Date();
  inMonth.setMonth(inMonth.getMonth() + 2);

  const p1: Project = {
    id: genId(),
    name: 'Aménagement garage',
    description: 'Optimiser le rangement, poser OSB et installer les étagères.',
    category: 'Garage',
    photos: [],
    startDate: new Date().toISOString(),
    dueDate: inMonth.toISOString(),
    budget: 800,
    spent: 240,
    priority: 'high',
    status: 'inprogress',
    createdAt: now,
    updatedAt: now,
  };

  const inMonth2 = new Date();
  inMonth2.setMonth(inMonth2.getMonth() + 3);
  const p2: Project = {
    id: genId(),
    name: 'Pergola extérieure',
    description: 'Construction et aménagement de la pergola du jardin.',
    category: 'Pergola',
    photos: [],
    startDate: new Date().toISOString(),
    dueDate: inMonth2.toISOString(),
    budget: 3500,
    spent: 0,
    priority: 'medium',
    status: 'todo',
    createdAt: now,
    updatedAt: now,
  };

  const inMonth3 = new Date();
  inMonth3.setMonth(inMonth3.getMonth() + 4);
  const p3: Project = {
    id: genId(),
    name: 'Terrasse bois',
    description: "Pose d'une terrasse en bois naturel autour de la maison.",
    category: 'Terrasse',
    photos: [],
    startDate: new Date().toISOString(),
    dueDate: inMonth3.toISOString(),
    budget: 5000,
    spent: 0,
    priority: 'low',
    status: 'idea',
    createdAt: now,
    updatedAt: now,
  };

  const tasks: Task[] = [
    makeTask(p1.id, "Poser l'OSB sur les murs", 'inprogress', 'high', 5),
    makeTask(p1.id, 'Installer les étagères', 'todo', 'medium', 14),
    makeTask(p1.id, 'Ranger les outils', 'todo', 'low', 21),
    makeTask(p1.id, 'Créer stockage croquettes', 'todo', 'low', 30),

    makeTask(p2.id, 'Commander les câbles', 'todo', 'high', 10),
    makeTask(p2.id, 'Installer la structure', 'todo', 'high', 20),
    makeTask(p2.id, 'Poser la toile hivernale', 'todo', 'medium', 45),
    makeTask(p2.id, 'Poser la fibre de coco', 'todo', 'low', 60),

    makeTask(p3.id, 'Préparer le terrain', 'idea', 'medium', 30),
    makeTask(p3.id, 'Poser les lambourdes', 'idea', 'medium', 45),
    makeTask(p3.id, 'Installer les lames', 'idea', 'low', 60),
    makeTask(p3.id, 'Finition', 'idea', 'low', 75),
  ];

  return { projects: [p1, p2, p3], tasks };
}

interface AppContextValue {
  projects: Project[];
  tasks: Task[];
  transactions: BankTransaction[];
  categories: Category[];
  appointments: Appointment[];
  calendarPeriods: CalendarPeriod[];
  loading: boolean;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'eisenhower'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addTransactionCtx: (tx: Omit<BankTransaction, 'id'>) => Promise<BankTransaction>;
  updateTransactionCtx: (id: string, updates: Partial<Omit<BankTransaction, 'id'>>) => Promise<void>;
  deleteTransactionCtx: (id: string) => Promise<void>;
  reloadTransactions: () => Promise<void>;
  getProjectExpenses: (projectId: string) => BankTransaction[];
  getTaskExpenses: (taskId: string) => BankTransaction[];
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  reorderProjects: (newOrder: Project[]) => void;
  addAppointment: (a: Omit<Appointment, 'id' | 'createdAt'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  addCalendarPeriod: (p: Omit<CalendarPeriod, 'id' | 'createdAt'>) => void;
  updateCalendarPeriod: (id: string, updates: Partial<CalendarPeriod>) => void;
  deleteCalendarPeriod: (id: string) => void;
  getProjectTasks: (projectId: string) => Task[];
  getStats: () => AppStats;
  resetData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calendarPeriods, setCalendarPeriods] = useState<CalendarPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  const dirtyRef = useRef(false);
  const widgetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectsRef = useRef<Project[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const categoriesRef = useRef<Category[]>(DEFAULT_CATEGORIES);
  const appointmentsRef = useRef<Appointment[]>([]);

  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (widgetTimerRef.current) clearTimeout(widgetTimerRef.current);
      widgetTimerRef.current = setTimeout(() => {
        updateTodoWidget(tasks, appointments);
      }, 800);
    }
    return () => {
      if (widgetTimerRef.current) clearTimeout(widgetTimerRef.current);
    };
  }, [tasks, appointments, loading]);

  useEffect(() => {
    if (loading) return;
    getApptReminderPref().then(enabled => {
      if (enabled && appointments.length > 0) {
        scheduleAppointmentReminders(
          appointments.map(a => ({
            id: a.id,
            title: a.title,
            date: a.date,
            time: a.time,
          }))
        );
      }
    });
  }, [appointments, loading]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' && dirtyRef.current && !loading) {
        saveBackup().then(() => {
          dirtyRef.current = false;
        });
      }
    });
    return () => sub.remove();
  }, [loading]);

  function markDirty() {
    dirtyRef.current = true;
  }

  async function loadData() {
    try {
      const [initialized, storedSeedVersion] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED),
        AsyncStorage.getItem(STORAGE_KEYS.SEED_VERSION),
      ]);
      // Seeder uniquement si l'app n'a jamais été initialisée.
      // Un simple changement de SEED_VERSION ne doit PAS écraser les données réelles.
      const needsSeed = !initialized;
      if (needsSeed) {
        setProjects(SEED_PROJECTS);
        setTasks(SEED_TASKS);
        setCategories(SEED_CATEGORIES);
        setAppointments(SEED_APPOINTMENTS);
        setCalendarPeriods([]);
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.PROJECTS, JSON.stringify(SEED_PROJECTS)],
          [STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS)],
          [STORAGE_KEYS.EXPENSES, JSON.stringify(SEED_EXPENSES)],
          [STORAGE_KEYS.CATEGORIES, JSON.stringify(SEED_CATEGORIES)],
          [STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(SEED_EXPENSE_CATEGORIES)],
          [STORAGE_KEYS.APPOINTMENTS, JSON.stringify(SEED_APPOINTMENTS)],
           [STORAGE_KEYS.CALENDAR_PERIODS, JSON.stringify([])],
          [STORAGE_KEYS.INITIALIZED, 'true'],
          [STORAGE_KEYS.SEED_VERSION, SEED_VERSION],
          ['@yoann2/bank_transactions', SEED_BANK_TRANSACTIONS],
          ['@yoann2/bank_savings_balance', SEED_BANK_SAVINGS],
          ['@yoann2/bank_recurring_transfers', SEED_BANK_RECURRING],
          ['@yoann2_nav_shortcuts', SEED_NAV_SHORTCUTS],
          ['@yoann2_place_categories', SEED_PLACE_CATEGORIES],
          ['@yoann2_known_places', SEED_KNOWN_PLACES],
          ['@yoann2_trips', SEED_TRIPS],
        ]);
      } else {
        const [pRaw, tRaw, cRaw, aRaw, cpRaw] = await AsyncStorage.multiGet([
          STORAGE_KEYS.PROJECTS,
          STORAGE_KEYS.TASKS,
          STORAGE_KEYS.CATEGORIES,
          STORAGE_KEYS.APPOINTMENTS,
          STORAGE_KEYS.CALENDAR_PERIODS,
        ]);
        if (pRaw[1]) setProjects(JSON.parse(pRaw[1]));
        if (tRaw[1]) setTasks(JSON.parse(tRaw[1]));
        if (cRaw[1]) setCategories(JSON.parse(cRaw[1]));
        if (aRaw[1]) setAppointments(JSON.parse(aRaw[1]));
        if (cpRaw[1]) setCalendarPeriods(JSON.parse(cpRaw[1]));
      }

      // Migration one-shot : convert @yoann2_expenses → BankTransactions with projectId
      await migrateExpensesToTransactions();

      // Load bank transactions (source unique de vérité pour les dépenses)
      const txs = await getTransactions();
      setTransactions(txs);

      // Pré-créer les dossiers SAF de toutes les tâches existantes (fire-and-forget)
      // Permet de déposer des photos depuis le gestionnaire de fichiers sans ouvrir l'app.
      {
        const pRaw = await AsyncStorage.getItem(STORAGE_KEYS.PROJECTS);
        const tRaw = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
        const loadedProjects: Project[] = pRaw ? JSON.parse(pRaw) : [];
        const loadedTasks: Task[] = tRaw ? JSON.parse(tRaw) : [];
        const taskItems = loadedTasks
          .filter(t => t.status !== 'done')
          .map(t => {
            const proj = loadedProjects.find(p => p.id === t.projectId);
            return { id: t.id, title: t.title, projectName: proj?.name ?? 'Divers' };
          });
        ensureAllTaskFolders(taskItems).catch(() => {});
      }
    } catch (e) {
      console.error('Error loading data', e);
    } finally {
      setLoading(false);
    }
  }

  async function persist(
    p: Project[] = projects,
    t: Task[] = tasks,
    c: Category[] = categories,
    a: Appointment[] = appointments
  ) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(p)],
      [STORAGE_KEYS.TASKS, JSON.stringify(t)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(c)],
      [STORAGE_KEYS.APPOINTMENTS, JSON.stringify(a)],
    ]);
  }

  const addProject = useCallback((p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newP: Project = { ...p, id: genId(), createdAt: now, updatedAt: now };
    setProjects(prev => {
      const next = [...prev, newP];
      AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      );
      AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const reorderProjects = useCallback((newOrder: Project[]) => {
    setProjects(newOrder);
    AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(newOrder));
    markDirty();
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      markDirty();
      return next;
    });
    setTasks(prev => {
      const next = prev.filter(t => t.projectId !== id);
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      return next;
    });
    // Also remove project-linked bank transactions
    setTransactions(prev => {
      const next = prev.filter(t => t.projectId !== id);
      saveTransactions(next);
      return next;
    });
  }, []);

  const archiveProject = useCallback((id: string) => {
    setProjects(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, archived: true, updatedAt: new Date().toISOString() } : p
      );
      AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const unarchiveProject = useCallback((id: string) => {
    setProjects(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, archived: false, updatedAt: new Date().toISOString() } : p
      );
      AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const addTask = useCallback((t: Omit<Task, 'id' | 'createdAt' | 'eisenhower'>) => {
    const newT: Task = {
      ...t,
      id: genId(),
      createdAt: new Date().toISOString(),
      eisenhower: computeEisenhower(t.urgency, t.importance),
    };
    setTasks(prev => {
      const next = [...prev, newT];
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      markDirty();
      return next;
    });
    // Pré-créer le dossier SAF de la tâche en arrière-plan (fire-and-forget)
    const proj = projects.find(p => p.id === newT.projectId);
    if (proj) ensureTaskFolder(proj.name, newT.title, newT.id).catch(() => {});
  }, [projects]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => {
      let next = prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        if (updates.status === 'done' && t.status !== 'done') {
          const now = new Date();
          const dd   = String(now.getDate()).padStart(2, '0');
          const mm   = String(now.getMonth() + 1).padStart(2, '0');
          const yyyy = now.getFullYear();
          updated.completedAt = `${dd}/${mm}/${yyyy}`;
        }
        if (updates.status && updates.status !== 'done') {
          updated.completedAt = undefined;
        }
        updated.eisenhower = computeEisenhower(updated.urgency, updated.importance);
        return updated;
      });
      const task = prev.find(t => t.id === id);
      if (task && task.recurrence && updates.status === 'done' && task.status !== 'done') {
        const due = new Date(task.dueDate);
        if (!isNaN(due.getTime())) {
          const nextDue = new Date(due);
          if (task.recurrence === 'daily') nextDue.setDate(nextDue.getDate() + 1);
          else if (task.recurrence === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
          else if (task.recurrence === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
          const clone: Task = {
            ...task,
            id: genId(),
            createdAt: new Date().toISOString(),
            completedAt: undefined,
            dueDate: nextDue.toISOString(),
            status: 'todo',
            eisenhower: computeEisenhower(task.urgency, task.importance),
            recurrenceFromId: task.id,
          };
          next = [...next, clone];
        }
      }
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      markDirty();
      return next;
    });
    // Also remove task-linked bank transactions
    setTransactions(prev => {
      const next = prev.filter(t => t.taskId !== id);
      saveTransactions(next);
      return next;
    });
  }, []);

  const addTransactionCtx = useCallback(async (tx: Omit<BankTransaction, 'id'>): Promise<BankTransaction> => {
    const newTx = await bankAddTx(tx);
    setTransactions(prev => [newTx, ...prev]);
    markDirty();
    return newTx;
  }, []);

  const updateTransactionCtx = useCallback(async (id: string, updates: Partial<Omit<BankTransaction, 'id'>>): Promise<void> => {
    await bankUpdateTx(id, updates);
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    markDirty();
  }, []);

  const deleteTransactionCtx = useCallback(async (id: string): Promise<void> => {
    await bankDeleteTx(id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    markDirty();
  }, []);

  const reloadTransactions = useCallback(async (): Promise<void> => {
    const txs = await getTransactions();
    setTransactions(txs);
  }, []);

  const addCategory = useCallback((name: string) => {
    const newC: Category = { id: genId(), name };
    setCategories(prev => {
      const next = [...prev, newC];
      AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(next));
      return next;
    });
  }, []);

  const addAppointment = useCallback((a: Omit<Appointment, 'id' | 'createdAt'>) => {
    const newA: Appointment = { ...a, id: genId(), createdAt: new Date().toISOString() };
    setAppointments(prev => {
      const next = [...prev, newA];
      AsyncStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const updateAppointment = useCallback((id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => {
      const next = prev.map(a => (a.id === id ? { ...a, ...updates } : a));
      AsyncStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const deleteAppointment = useCallback((id: string) => {
    setAppointments(prev => {
      const next = prev.filter(a => a.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const addCalendarPeriod = useCallback((p: Omit<CalendarPeriod, 'id' | 'createdAt'>) => {
    const newPeriod: CalendarPeriod = { ...p, id: genId(), createdAt: new Date().toISOString() };
    setCalendarPeriods(prev => {
      const next = [...prev, newPeriod];
      AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_PERIODS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const updateCalendarPeriod = useCallback((id: string, updates: Partial<CalendarPeriod>) => {
    setCalendarPeriods(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_PERIODS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const deleteCalendarPeriod = useCallback((id: string) => {
    setCalendarPeriods(prev => {
      const next = prev.filter(p => p.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.CALENDAR_PERIODS, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const getProjectTasks = useCallback(
    (projectId: string) => tasks.filter(t => t.projectId === projectId),
    [tasks]
  );

  const getProjectExpenses = useCallback(
    (projectId: string) => transactions.filter(t => t.type === 'expense' && t.projectId === projectId),
    [transactions]
  );

  const getTaskExpenses = useCallback(
    (taskId: string) => transactions.filter(t => t.type === 'expense' && t.taskId === taskId),
    [transactions]
  );

  const getStats = useCallback((): AppStats => {
    const now = new Date();
    const activeProjects = projects.filter(p => !p.archived);
    const overdue = tasks.filter(
      t => t.status !== 'done' && new Date(t.dueDate) < now
    ).length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const progress =
      tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
    return {
      totalProjects: activeProjects.length,
      totalTasks: tasks.length,
      overdueTasks: overdue,
      completedTasks: completed,
      globalProgress: progress,
    };
  }, [projects, tasks]);

  const resetData = useCallback(() => {
    const sample = createSampleData();
    setProjects(sample.projects);
    setTasks(sample.tasks);
    setCategories(DEFAULT_CATEGORIES);
    setAppointments([]);
    setCalendarPeriods([]);
    AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(sample.projects)],
      [STORAGE_KEYS.TASKS, JSON.stringify(sample.tasks)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES)],
      [STORAGE_KEYS.APPOINTMENTS, JSON.stringify([])],
      [STORAGE_KEYS.CALENDAR_PERIODS, JSON.stringify([])],
      [STORAGE_KEYS.INITIALIZED, 'true'],
    ]);
    markDirty();
  }, []);

  return (
    <AppContext.Provider
      value={{
        projects,
        tasks,
        transactions,
        categories,
        appointments,
    calendarPeriods,
        loading,
        addProject,
        updateProject,
        deleteProject,
        archiveProject,
        unarchiveProject,
        reorderProjects,
        addTask,
        updateTask,
        deleteTask,
        addTransactionCtx,
        updateTransactionCtx,
        deleteTransactionCtx,
        reloadTransactions,
        addCategory,
        deleteCategory,
        addAppointment,
        updateAppointment,
        deleteAppointment,
    addCalendarPeriod,
    updateCalendarPeriod,
    deleteCalendarPeriod,
        getProjectTasks,
        getProjectExpenses,
        getTaskExpenses,
        getStats,
        resetData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
