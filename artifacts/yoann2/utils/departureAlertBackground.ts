/**
 * departureAlertBackground.ts
 *
 * Tâche BackgroundFetch qui recalcule silencieusement l'itinéraire RDV
 * même quand l'app est complètement fermée (Samsung One UI, MIUI, etc.).
 *
 * Sur Android, BackgroundFetch utilise JobScheduler pour réveiller le process
 * JS périodiquement — la notification locale n'a pas besoin d'être reçue.
 *
 * IMPORTANT : defineTask() doit être appelé au chargement du module,
 * AVANT tout démarrage de l'app. Importer ce fichier depuis _layout.tsx.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { rescheduleAllTodayAlerts } from '@/utils/departureAlert';

export const DEPARTURE_BG_FETCH_TASK = 'departure-alert-bg-fetch';

// ── Définition de la tâche ────────────────────────────────────────────────────
// defineTask doit être appelé au niveau module (avant toute exécution JS d'app).

TaskManager.defineTask(DEPARTURE_BG_FETCH_TASK, async () => {
  try {
    const count = await rescheduleAllTodayAlerts();
    return count > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ── Enregistrement de la tâche ────────────────────────────────────────────────

/**
 * Enregistre la tâche BackgroundFetch.
 * Idempotent : appelle unregister puis register pour éviter les doublons.
 * À appeler au démarrage de l'app (depuis _layout.tsx).
 *
 * Intervalle minimum : 15 min (limite Android JobScheduler).
 * On choisit 30 min pour limiter l'impact batterie.
 */
export async function registerDepartureBackgroundFetch(): Promise<void> {
  try {
    // Désinscrire d'abord pour garantir des options fraîches
    await BackgroundFetch.unregisterTaskAsync(DEPARTURE_BG_FETCH_TASK).catch(() => {});

    await BackgroundFetch.registerTaskAsync(DEPARTURE_BG_FETCH_TASK, {
      minimumInterval: 30 * 60,     // secondes — 30 minutes
      stopOnTerminate: false,        // continuer même si l'app est tuée
      startOnBoot: true,             // reprendre après redémarrage du téléphone
    });
  } catch {
    // Non-fatal : la tâche n'est pas critique (fallback = notification manuelle)
  }
}
