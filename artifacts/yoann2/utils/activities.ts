import type { ActivityKind, Trip, Vehicle, WalkParticipant } from '@/types/trips';

export const ACTIVITIES = [
  { key: 'walk', label: 'Marche', icon: 'walk', color: '#4CAF50', emoji: '🚶' },
  { key: 'run', label: 'Course', icon: 'run', color: '#FF9800', emoji: '🏃' },
  { key: 'bike', label: 'Vélo', icon: 'bike', color: '#2196F3', emoji: '🚲' },
  { key: 'kayak', label: 'Kayak', icon: 'kayaking', color: '#009688', emoji: '🛶' },
] as const;

export function activityForTrip(trip: Trip, vehicles: Vehicle[]): ActivityKind | null {
  if (trip.vehicle === 'ignored') return null;
  const vehicle = vehicles.find(item => item.id === trip.vehicle);
  if (vehicle && vehicle.type !== 'walk') return null;
  if (ACTIVITIES.some(activity => activity.key === trip.activityType)) return trip.activityType!;
  return vehicle?.type === 'walk' ? 'walk' : null;
}

export function activityInfo(kind: ActivityKind) {
  return ACTIVITIES.find(activity => activity.key === kind)!;
}

export function activityParticipants(vehicles: Vehicle[]): WalkParticipant[] {
  const participants = new Map<string, WalkParticipant>();
  vehicles.filter(vehicle => vehicle.type === 'walk').forEach(vehicle =>
    vehicle.walkParticipants?.forEach(participant => participants.set(participant.id, participant)));
  return [...participants.values()];
}

/** Existing participant lists can include the recorder themself. */
export function isSoloActivity(trip: Trip, vehicles: Vehicle[]): boolean {
  const participants = activityParticipants(vehicles);
  return (trip.walkParticipants ?? []).filter(id => participants.find(p => p.id === id)?.type !== 'dog').length <= 1;
}

export function filterActivities(
  trips: Trip[], vehicles: Vehicle[], kind: ActivityKind | 'all', participant: string,
): Trip[] {
  return trips.filter(trip => {
    const activity = activityForTrip(trip, vehicles);
    if (!activity || (kind !== 'all' && activity !== kind)) return false;
    if (participant === 'solo') return isSoloActivity(trip, vehicles);
    return participant === 'all' || (trip.walkParticipants ?? []).includes(participant);
  });
}

export interface ActivityMilestone { id: string; label: string }

/** Read-only achievements, attributed to the month in which they were reached. */
export function activityMilestones(trips: Trip[], vehicles: Vehicle[], year: number, month: number): ActivityMilestone[] {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  const all = filterActivities(trips, vehicles, 'all', 'all')
    .filter(trip => Number.isFinite(trip.startTime) && Number.isFinite(trip.distanceKm) && trip.distanceKm >= 0)
    .sort((a, b) => a.startTime - b.startTime);
  const current = all.filter(trip => trip.startTime >= start && trip.startTime < end);
  const milestones: ActivityMilestone[] = [];
  for (const activity of ACTIVITIES) {
    const matching = all.filter(trip => activityForTrip(trip, vehicles) === activity.key);
    const first = matching[0];
    if (first && first.startTime >= start && first.startTime < end) {
      milestones.push({ id: `first-${activity.key}`, label: `Première activité : ${activity.label.toLowerCase()}` });
    }
    const monthTrips = matching.filter(trip => trip.startTime >= start && trip.startTime < end);
    const longest = monthTrips.reduce((max, trip) => Math.max(max, trip.distanceKm), 0);
    const previous = matching.filter(trip => trip.startTime < start).reduce((max, trip) => Math.max(max, trip.distanceKm), 0);
    if (longest > previous && previous > 0) {
      milestones.push({ id: `record-${activity.key}`, label: `${activity.label} : nouvelle plus longue sortie, ${longest.toFixed(1)} km` });
    }
    for (const participant of activityParticipants(vehicles).filter(person => person.type === 'human')) {
      const withPerson = matching.filter(trip => (trip.walkParticipants ?? []).includes(participant.id));
      const before = withPerson.filter(trip => trip.startTime < start).reduce((sum, trip) => sum + trip.distanceKm, 0);
      const until = withPerson.filter(trip => trip.startTime < end).reduce((sum, trip) => sum + trip.distanceKm, 0);
      for (const threshold of [10, 50, 100, 250, 500, 1000, 2000, 5000]) {
        if (before < threshold && until >= threshold) {
          milestones.push({ id: `km-${activity.key}-${participant.id}-${threshold}`, label: `${threshold} km de ${activity.label.toLowerCase()} avec ${participant.name}` });
        }
      }
    }
  }
  if (current.length >= 10) milestones.push({ id: 'ten-outings', label: `${current.length} activités ce mois-ci` });
  return milestones;
}
