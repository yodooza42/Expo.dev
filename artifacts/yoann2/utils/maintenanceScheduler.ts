import type { Priority, Project, Task } from '@/types';
import type { Trip, Vehicle } from '@/types/trips';
import { computeOdometer, getVehicleSettings, saveVehicleSettings } from '@/utils/tripStorage';

/**
 * Priority thresholds based on % of interval consumed.
 * < 70%  → no task
 * 70-85% → moyenne
 * 85-95% → haute
 * >= 95% → critique
 */
function getPriority(pct: number): Priority | null {
  if (pct >= 0.95) return 'critical';
  if (pct >= 0.85) return 'high';
  if (pct >= 0.70) return 'medium';
  return null;
}

/**
 * Estimate a due date based on remaining km and average monthly km rate.
 * Returns null if not enough data.
 */
function estimateDueDate(
  remainingKm: number,
  trips: Trip[],
  vehicleId: string,
): Date | null {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 3_600_000;
  const recentTrips = trips.filter(
    t => t.vehicle === vehicleId && t.endTime >= thirtyDaysAgo,
  );
  const monthlyKm = recentTrips.reduce((s, t) => s + t.distanceKm, 0);
  if (monthlyKm < 50) return null; // not enough data
  const daysLeft = (remainingKm / monthlyKm) * 30;
  const d = new Date(now + daysLeft * 24 * 3_600_000);
  return d;
}

/**
 * Run the maintenance scheduler.
 *
 * For each vehicle maintenance item that has crossed a priority threshold:
 * - If no linked task exists → create one in the vehicle's project.
 * - If a linked task exists but priority changed → update it.
 * - When an item is reset (linkedTaskId set + task completed) → clear the link.
 *
 * Reads/writes VehicleSettings directly so it can be called from anywhere.
 */
export async function runMaintenanceScheduler(opts: {
  trips: Trip[];
  projects: Project[];
  tasks: Task[];
  addTask: (t: Omit<Task, 'id' | 'createdAt' | 'eisenhower'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
}): Promise<void> {
  const { trips, projects, tasks, addTask, updateTask } = opts;

  const vehicles = await getVehicleSettings();
  let dirty = false;
  const now = Date.now();

  for (const vehicle of vehicles) {
    if (!vehicle.maintenanceProjectId) continue;

    const project = projects.find(p => p.id === vehicle.maintenanceProjectId);
    if (!project) continue;

    const odo = computeOdometer(trips, vehicle.id, vehicle.odometerBaseKm, vehicle.odometerAdjustments);

    for (const item of vehicle.maintenanceItems) {
      let pct = 0;

      if (item.intervalKm > 0) {
        const kmSince = odo - item.lastResetKm;
        pct = kmSince / item.intervalKm;
      } else if (item.intervalDays && item.lastResetDate) {
        const daysSince = (now - item.lastResetDate) / (24 * 3_600_000);
        pct = daysSince / item.intervalDays;
      }

      const priority = getPriority(pct);

      // If linked task is completed or deleted → clear the link so we can recreate next cycle
      if (item.linkedTaskId) {
        const linkedTask = tasks.find(t => t.id === item.linkedTaskId);
        if (!linkedTask || linkedTask.status === 'done') {
          item.linkedTaskId = undefined;
          dirty = true;
        }
      }

      if (!priority) {
        // Below threshold — nothing to do
        continue;
      }

      const vehicleIcon = vehicle.type === 'moto' ? '🏍' : '🚗';
      const taskTitle = `${item.name} — ${vehicleIcon} ${vehicle.name}`;

      if (item.linkedTaskId) {
        // Task exists — update priority if it changed
        const existing = tasks.find(t => t.id === item.linkedTaskId);
        if (existing && existing.priority !== priority) {
          updateTask(item.linkedTaskId, { priority });
        }
        // Update due date
        let dueDate = existing?.dueDate ?? '';
        if (item.intervalKm > 0) {
          const remaining = item.intervalKm - (odo - item.lastResetKm);
          const est = estimateDueDate(Math.max(0, remaining), trips, vehicle.id);
          if (est) dueDate = est.toISOString().split('T')[0]!;
        }
        if (dueDate && existing && existing.dueDate !== dueDate) {
          updateTask(item.linkedTaskId, { dueDate });
        }
      } else {
        // Create new task
        let dueDate = '';
        if (item.intervalKm > 0) {
          const remaining = item.intervalKm - (odo - item.lastResetKm);
          const est = estimateDueDate(Math.max(0, remaining), trips, vehicle.id);
          if (est) dueDate = est.toISOString().split('T')[0]!;
        } else if (item.intervalDays && item.lastResetDate) {
          const dueTs = item.lastResetDate + item.intervalDays * 24 * 3_600_000;
          dueDate = new Date(dueTs).toISOString().split('T')[0]!;
        }

        const pctRounded = Math.round(pct * 100);
        const description =
          item.intervalKm > 0
            ? `Intervalle ${item.intervalKm} km · Odomètre actuel ${odo.toFixed(0)} km (${pctRounded}%)`
            : `Intervalle ${item.intervalDays} jours · Consommé à ${pctRounded}%`;

        // addTask is synchronous in AppContext — the new task id is generated internally
        // We need the task id to store it. Since addTask doesn't return an id, we mark
        // with a sentinel and match it after the call.
        const beforeCount = tasks.length;
        addTask({
          projectId: vehicle.maintenanceProjectId!,
          title: taskTitle,
          description,
          notes: '',
          photos: [],
          dueDate,
          priority,
          importance: priority === 'critical' ? 3 : priority === 'high' ? 3 : 2,
          urgency: priority === 'critical' ? 3 : priority === 'high' ? 2 : 1,
          status: 'todo',
          recurrence: undefined,
        });
        // AppContext adds the task synchronously; tasks array state will update on re-render.
        // We store a special marker so next scheduler run finds the task by title.
        item.linkedTaskId = `pending:${taskTitle}`;
        dirty = true;
      }
    }
  }

  // Resolve pending:* linked task ids
  for (const vehicle of vehicles) {
    for (const item of vehicle.maintenanceItems) {
      if (item.linkedTaskId?.startsWith('pending:')) {
        const title = item.linkedTaskId.slice('pending:'.length);
        const matched = tasks.find(
          t => t.title === title && t.status !== 'done' && t.projectId === vehicle.maintenanceProjectId,
        );
        if (matched) {
          item.linkedTaskId = matched.id;
          dirty = true;
        }
      }
    }
  }

  if (dirty) {
    await saveVehicleSettings(vehicles);
  }
}
