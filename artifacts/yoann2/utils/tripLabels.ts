import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TripLabel } from '@/types/trips';
import { genId } from '@/utils/ids';
import { getTrips, updateTrip } from '@/utils/tripStorage';

const KEY = '@yoann2_trip_labels';

export async function getLabels(): Promise<TripLabel[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TripLabel[]) : [];
  } catch {
    return [];
  }
}

export async function saveLabels(labels: TripLabel[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(labels));
  } catch {}
}

export async function createLabel(name: string): Promise<TripLabel> {
  const label: TripLabel = { id: genId(), name: name.trim() || 'Groupe', createdAt: Date.now() };
  const labels = await getLabels();
  await saveLabels([...labels, label]);
  return label;
}

export async function renameLabel(id: string, name: string): Promise<void> {
  const labels = await getLabels();
  const idx = labels.findIndex(l => l.id === id);
  if (idx !== -1) {
    labels[idx] = { ...labels[idx]!, name: name.trim() || labels[idx]!.name };
    await saveLabels(labels);
  }
}

export async function deleteLabel(id: string): Promise<void> {
  const labels = await getLabels();
  await saveLabels(labels.filter(l => l.id !== id));
}

export async function deleteLabelAndUnlink(labelId: string): Promise<void> {
  await deleteLabel(labelId);
  const allTrips = await getTrips();
  await Promise.all(
    allTrips
      .filter(t => t.labelId === labelId)
      .map(t => updateTrip(t.id, { labelId: undefined })),
  );
}
