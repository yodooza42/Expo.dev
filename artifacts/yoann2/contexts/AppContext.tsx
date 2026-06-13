import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import type { AppStats, Category, Expense, Priority, Project, ProjectStatus, Task, TaskStatus } from '@/types';

const STORAGE_KEYS = {
  PROJECTS: '@yoann2_projects',
  TASKS: '@yoann2_tasks',
  EXPENSES: '@yoann2_expenses',
  CATEGORIES: '@yoann2_categories',
  INITIALIZED: '@yoann2_initialized',
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

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function computeEisenhower(urgency: number, importance: number): Task['eisenhower'] {
  const isUrgent = urgency >= 3;
  const isImportant = importance >= 3;
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
    importance: priority === 'critical' ? 5 : priority === 'high' ? 4 : priority === 'medium' ? 3 : 2,
    urgency: daysOffset < 0 ? 5 : daysOffset < 7 ? 4 : 3,
    status,
    eisenhower: computeEisenhower(
      daysOffset < 0 ? 5 : daysOffset < 7 ? 4 : 3,
      priority === 'critical' ? 5 : priority === 'high' ? 4 : priority === 'medium' ? 3 : 2
    ),
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
    description: 'Pose d\'une terrasse en bois naturel autour de la maison.',
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
  loading: boolean;
  addProject: (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'eisenhower'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addExpense: (e: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addCategory: (name: string) => void;
  deleteCategory: (id: string) => void;
  getProjectTasks: (projectId: string) => Task[];
  getProjectExpenses: (projectId: string) => Expense[];
  getStats: () => AppStats;
  exportData: () => string;
  importData: (json: string) => boolean;
  resetData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const initialized = await AsyncStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!initialized) {
        const sample = createSampleData();
        setProjects(sample.projects);
        setTasks(sample.tasks);
        setExpenses(sample.expenses);
        setCategories(DEFAULT_CATEGORIES);
        await AsyncStorage.multiSet([
          [STORAGE_KEYS.PROJECTS, JSON.stringify(sample.projects)],
          [STORAGE_KEYS.TASKS, JSON.stringify(sample.tasks)],
          [STORAGE_KEYS.EXPENSES, JSON.stringify(sample.expenses)],
          [STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES)],
          [STORAGE_KEYS.INITIALIZED, 'true'],
        ]);
      } else {
        const [pRaw, tRaw, eRaw, cRaw] = await AsyncStorage.multiGet([
          STORAGE_KEYS.PROJECTS,
          STORAGE_KEYS.TASKS,
          STORAGE_KEYS.EXPENSES,
          STORAGE_KEYS.CATEGORIES,
        ]);
        if (pRaw[1]) setProjects(JSON.parse(pRaw[1]));
        if (tRaw[1]) setTasks(JSON.parse(tRaw[1]));
        if (eRaw[1]) setExpenses(JSON.parse(eRaw[1]));
        if (cRaw[1]) setCategories(JSON.parse(cRaw[1]));
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
    c: Category[] = categories
  ) {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(p)],
      [STORAGE_KEYS.TASKS, JSON.stringify(t)],
      [STORAGE_KEYS.EXPENSES, JSON.stringify(e)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(c)],
    ]);
  }

  const addProject = useCallback((p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newP: Project = { ...p, id: genId(), createdAt: now, updatedAt: now };
    setProjects(prev => {
      const next = [...prev, newP];
      persist(next);
      return next;
    });
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      );
      persist(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      persist(next);
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
      return next;
    });
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        updated.eisenhower = computeEisenhower(updated.urgency, updated.importance);
        return updated;
      });
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(next));
      return next;
    });
  }, []);

  const addExpense = useCallback((e: Omit<Expense, 'id'>) => {
    const newE: Expense = { ...e, id: genId() };
    setExpenses(prev => {
      const next = [...prev, newE];
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      return next;
    });
    updateProject(e.projectId, {
      spent: projects.find(p => p.id === e.projectId)?.spent ?? 0 + e.amount,
    });
  }, [projects, updateProject]);

  const updateExpense = useCallback((id: string, updates: Partial<Expense>) => {
    setExpenses(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, ...updates } : e));
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setExpenses(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(next));
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

  const getProjectTasks = useCallback(
    (projectId: string) => tasks.filter(t => t.projectId === projectId),
    [tasks]
  );

  const getProjectExpenses = useCallback(
    (projectId: string) => expenses.filter(e => e.projectId === projectId),
    [expenses]
  );

  const getStats = useCallback((): AppStats => {
    const now = new Date();
    const overdue = tasks.filter(
      t => t.status !== 'done' && new Date(t.dueDate) < now
    ).length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const progress =
      tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);
    return {
      totalProjects: projects.length,
      totalTasks: tasks.length,
      overdueTasks: overdue,
      completedTasks: completed,
      globalProgress: progress,
    };
  }, [projects, tasks]);

  const exportData = useCallback((): string => {
    return JSON.stringify({ projects, tasks, expenses, categories }, null, 2);
  }, [projects, tasks, expenses, categories]);

  const importData = useCallback((json: string): boolean => {
    try {
      const data = JSON.parse(json);
      if (!data.projects || !data.tasks) return false;
      const p = data.projects as Project[];
      const t = data.tasks as Task[];
      const e = data.expenses as Expense[] ?? [];
      const c = data.categories as Category[] ?? DEFAULT_CATEGORIES;
      setProjects(p);
      setTasks(t);
      setExpenses(e);
      setCategories(c);
      persist(p, t, e, c);
      AsyncStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      return true;
    } catch {
      return false;
    }
  }, []);

  const resetData = useCallback(() => {
    const sample = createSampleData();
    setProjects(sample.projects);
    setTasks(sample.tasks);
    setExpenses(sample.expenses);
    setCategories(DEFAULT_CATEGORIES);
    AsyncStorage.multiSet([
      [STORAGE_KEYS.PROJECTS, JSON.stringify(sample.projects)],
      [STORAGE_KEYS.TASKS, JSON.stringify(sample.tasks)],
      [STORAGE_KEYS.EXPENSES, JSON.stringify(sample.expenses)],
      [STORAGE_KEYS.CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES)],
      [STORAGE_KEYS.INITIALIZED, 'true'],
    ]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        projects,
        tasks,
        expenses,
        categories,
        loading,
        addProject,
        updateProject,
        deleteProject,
        addTask,
        updateTask,
        deleteTask,
        addExpense,
        updateExpense,
        deleteExpense,
        addCategory,
        deleteCategory,
        getProjectTasks,
        getProjectExpenses,
        getStats,
        exportData,
        importData,
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
