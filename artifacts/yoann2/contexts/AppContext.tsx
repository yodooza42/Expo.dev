import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Appointment, AppStats, Category, Expense, Priority, Project, ProjectStatus, Task, TaskStatus } from '@/types';
import { saveBackup } from '@/utils/backup';
import { genId } from '@/utils/ids';
import {
  SEED_APPOINTMENTS,
  SEED_CATEGORIES,
  SEED_EXPENSE_CATEGORIES,
  SEED_EXPENSES,
  SEED_PROJECTS,
  SEED_TASKS,
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
  INITIALIZED: '@yoann2_initialized',
  SEED_VERSION: '@yoann2_seed_version',
};

const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: 'ecat_outillage', name: 'Outillage' },
  { id: 'ecat_electromenager', name: 'Électroménager' },
  { id: 'ecat_consommable', name: 'Consommable' },
  { id: 'ecat_mobilier', name: 'Mobilier' },
  { id: 'ecat_materiaux', name: 'Matériaux' },
  { id: 'ecat_maindoeuvre', name: "Main d'œuvre" },
  { id: 'ecat_quincaillerie', name: 'Quincaillerie' },
  { id: 'ecat_equipement', name: 'Équipement' },
  { id: 'ecat_transport', name: 'Transport' },
  { id: 'ecat_divers', name: 'Divers' },
];

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

function createSampleData(): { projects: Project[]; tasks: Task[]; expenses: Expense[] } {
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

  const expenses: Expense[] = [
    {
      id: genId(),
      projectId: p1.id,
      name: 'Panneaux OSB',
      amount: 180,
      date: new Date().toISOString(),
      category: 'Matériaux',
    },
    {
      id: genId(),
      projectId: p1.id,
      name: 'Visserie et fixations',
      amount: 60,
      date: new Date().toISOString(),
      category: 'Quincaillerie',
    },
  ];

  return { projects: [p1, p2, p3], tasks, expenses };
}

interface AppContextValue {
  projects: Project[];
  tasks: Task[];
  expenses: Expense[];
  categories: Category[];
  expenseCategories: Category[];
  appointments: Appointment[];
  loading: boolean;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'eisenhower'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => Expense;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  getTaskExpenses: (taskId: string) => Expense[];
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  reorderProjects: (newOrder: Project[]) => void;
  addExpenseCategory: (name: string) => void;
  deleteExpenseCategory: (id: string) => void;
  addAppointment: (a: Omit<Appointment, 'id' | 'createdAt'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  getProjectTasks: (projectId: string) => Task[];
  getProjectExpenses: (projectId: string) => Expense[];
  getStats: () => AppStats;
  resetData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const dirtyRef = useRef(false);
  const widgetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectsRef = useRef<Project[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const expensesRef = useRef<Expense[]>([]);
  const categoriesRef = useRef<Category[]>(DEFAULT_CATEGORIES);
  const expenseCategoriesRef = useRef<Category[]>(DEFAULT_EXPENSE_CATEGORIES);
  const appointmentsRef = useRef<Appointment[]>([]);

  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { expenseCategoriesRef.current = expenseCategories; }, [expenseCategories]);
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

  // Reschedule appointment reminder notifications when appointments change
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
      const needsSeed = !initialized || storedSeedVersion !== SEED_VERSION;
      if (needsSeed) {
        setProjects(SEED_PROJECTS);
        setTasks(SEED_TASKS);
        setExpenses(SEED_EXPENSES);
        setCategories(SEED_CATEGORIES);
        setExpenseCategories(SEED_EXPENSE_CATEGORIES);
        setAppointments(SEED_APPOINTMENTS);
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.PROJECTS, JSON.stringify(SEED_PROJECTS)],
          [STORAGE_KEYS.TASKS, JSON.stringify(SEED_TASKS)],
          [STORAGE_KEYS.EXPENSES, JSON.stringify(SEED_EXPENSES)],
          [STORAGE_KEYS.CATEGORIES, JSON.stringify(SEED_CATEGORIES)],
          [STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(SEED_EXPENSE_CATEGORIES)],
          [STORAGE_KEYS.APPOINTMENTS, JSON.stringify(SEED_APPOINTMENTS)],
          [STORAGE_KEYS.INITIALIZED, 'true'],
          [STORAGE_KEYS.SEED_VERSION, SEED_VERSION],
        ]);
      } else {
        const [pRaw, tRaw, eRaw, cRaw, ecRaw, aRaw] = await AsyncStorage.multiGet([
          STORAGE_KEYS.PROJECTS,
          STORAGE_KEYS.TASKS,
          STORAGE_KEYS.EXPENSES,
          STORAGE_KEYS.CATEGORIES,
          STORAGE_KEYS.EXPENSE_CATEGORIES,
          STORAGE_KEYS.APPOINTMENTS,
        ]);
        if (pRaw[1]) setProjects(JSON.parse(pRaw[1]));
        if (tRaw[1]) setTasks(JSON.parse(tRaw[1]));
        if (eRaw[1]) setExpenses(JSON.parse(eRaw[1]));
        if (cRaw[1]) setCategories(JSON.parse(cRaw[1]));
        if (ecRaw[1]) setExpenseCategories(JSON.parse(ecRaw[1]));
        if (aRaw[1]) setAppointments(JSON.parse(aRaw[1]));
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
    e: Expense[] = expenses,
    c: Category[] = categories,
    ec: Category[] = expenseCategories,
    a: Appointment[] = appointments
  ) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(p)],
      [STORAGE_KEYS.TASKS, JSON.stringify(t)],
      [STORAGE_KEYS.EXPENSES, JSON.stringify(e)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(c)],
      [STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(ec)],
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
    setExpenses(prev => {
      const next = prev.filter(e => e.projectId !== id);
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
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
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => {
      let next = prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        // Auto-stamp completedAt the first time a task reaches 'done'
        if (updates.status === 'done' && !t.completedAt) {
          const now = new Date();
          const dd   = String(now.getDate()).padStart(2, '0');
          const mm   = String(now.getMonth() + 1).padStart(2, '0');
          const yyyy = now.getFullYear();
          updated.completedAt = `${dd}/${mm}/${yyyy}`;
        }
        // Clear completedAt if task is moved back out of done
        if (updates.status && updates.status !== 'done') {
          updated.completedAt = undefined;
        }
        updated.eisenhower = computeEisenhower(updated.urgency, updated.importance);
        return updated;
      });
      // ── Recurrence: spawn next instance when a recurring task is marked done ──
      const task = prev.find(t => t.id === id);
      if (task && task.recurrence && updates.status === 'done' && !task.completedAt) {
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
    setExpenses(prev => {
      const next = prev.filter(e => e.taskId !== id);
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      return next;
    });
  }, []);

  const addExpense = useCallback((e: Omit<Expense, 'id'>): Expense => {
    const newE: Expense = { ...e, id: genId() };
    setExpenses(prev => {
      const next = [...prev, newE];
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      markDirty();
      return next;
    });
    return newE;
  }, []);

  const updateExpense = useCallback((id: string, updates: Partial<Expense>) => {
    setExpenses(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, ...updates } : e));
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      markDirty();
      return next;
    });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setExpenses(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      markDirty();
      return next;
    });
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

  const addExpenseCategory = useCallback((name: string) => {
    const newC: Category = { id: genId(), name };
    setExpenseCategories(prev => {
      const next = [...prev, newC];
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteExpenseCategory = useCallback((id: string) => {
    setExpenseCategories(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(next));
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

  const getProjectTasks = useCallback(
    (projectId: string) => tasks.filter(t => t.projectId === projectId),
    [tasks]
  );

  const getProjectExpenses = useCallback(
    (projectId: string) => expenses.filter(e => e.projectId === projectId),
    [expenses]
  );

  const getTaskExpenses = useCallback(
    (taskId: string) => expenses.filter(e => e.taskId === taskId),
    [expenses]
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
    setExpenses(sample.expenses);
    setCategories(DEFAULT_CATEGORIES);
    setExpenseCategories(DEFAULT_EXPENSE_CATEGORIES);
    setAppointments([]);
    AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(sample.projects)],
      [STORAGE_KEYS.TASKS, JSON.stringify(sample.tasks)],
      [STORAGE_KEYS.EXPENSES, JSON.stringify(sample.expenses)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES)],
      [STORAGE_KEYS.EXPENSE_CATEGORIES, JSON.stringify(DEFAULT_EXPENSE_CATEGORIES)],
      [STORAGE_KEYS.APPOINTMENTS, JSON.stringify([])],
      [STORAGE_KEYS.INITIALIZED, 'true'],
    ]);
    markDirty();
  }, []);

  return (
    <AppContext.Provider
      value={{
        projects,
        tasks,
        expenses,
        categories,
        expenseCategories,
        appointments,
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
        addExpense,
        updateExpense,
        deleteExpense,
        getTaskExpenses,
        addCategory,
        deleteCategory,
        addExpenseCategory,
        deleteExpenseCategory,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        getProjectTasks,
        getProjectExpenses,
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
