import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { Project, Task } from '@/types';
import { protectPhoto, photoProtectionEvents } from '@/utils/photoProtection';
import { taskFolderName } from '@/utils/photoStorage';
import { getTrips, updateTrip } from '@/utils/tripStorage';
import { tripEvents } from '@/utils/tripEvents';

type Options = {
  projects: Project[]; tasks: Task[]; loading: boolean;
  replaceProject: (id: string, replacements: Map<string, string>) => void;
  replaceTask: (id: string, replacements: Map<string, string>) => void;
};

/** Protect existing and newly attached photos without changing captions or GPS anchors. */
export function usePhotoProtection(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const running = useRef<Promise<void> | null>(null);
  const signature = JSON.stringify([
    options.projects.map(item => [item.id, item.name, item.photos]),
    options.tasks.map(item => [item.id, item.projectId, item.photos]),
  ]);
  useEffect(() => {
    if (options.loading || Platform.OS === 'web') return;
    let mounted = true;
    async function sweep() {
      if (running.current) { await running.current; }
      if (!mounted) return;
      const operation = (async () => {
        let missing = 0;
        const snapshot = latest.current;
        const projectChanges: Array<[string, Map<string, string>]> = [];
        const taskChanges: Array<[string, Map<string, string>]> = [];
        const secure = async (uris: string[], project: string, folder?: string) => {
          const changes = new Map<string, string>();
          for (const uri of new Set(uris)) {
            try {
              const permanent = await protectPhoto(uri, { project, folder });
              if (permanent !== uri) changes.set(uri, permanent);
            } catch { missing++; }
          }
          return changes;
        };
        for (const project of snapshot.projects) {
          projectChanges.push([project.id, await secure(project.photos, project.name)]);
        }
        for (const task of snapshot.tasks) {
          const project = snapshot.projects.find(item => item.id === task.projectId)?.name ?? 'Sans projet';
          taskChanges.push([task.id, await secure(task.photos, project, taskFolderName(task.title, task.id))]);
        }
        let tripChanged = false;
        for (const trip of await getTrips()) {
          const changes = await secure((trip.photos ?? []).map(photo => photo.uri), 'Trajets', trip.id);
          if (!changes.size || !mounted) continue;
          // Re-read before saving: preserve edits made while copying a large file.
          const current = (await getTrips()).find(item => item.id === trip.id);
          if (!current) continue;
          await updateTrip(trip.id, {
            photos: current.photos?.map(photo => ({ ...photo, uri: changes.get(photo.uri) ?? photo.uri })),
          }, true);
          tripChanged = true;
        }
        if (!mounted) return;
        for (const [id, changes] of projectChanges) if (changes.size) latest.current.replaceProject(id, changes);
        for (const [id, changes] of taskChanges) if (changes.size) latest.current.replaceTask(id, changes);
        await AsyncStorage.setItem('@yoann2_photo_protection_missing', String(missing));
        if (tripChanged) tripEvents.emitTripUpdated();
      })();
      running.current = operation;
      try { await operation; } finally { if (running.current === operation) running.current = null; }
    }
    const unsubscribe = photoProtectionEvents.subscribe(sweep);
    const untrip = tripEvents.onTripUpdated(() => { void sweep().catch(console.warn); });
    const timer = setTimeout(() => { void sweep().catch(console.warn); }, 800);
    return () => { mounted = false; clearTimeout(timer); unsubscribe(); untrip(); };
  }, [signature, options.loading]);
}
