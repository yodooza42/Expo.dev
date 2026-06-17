import app from "./app";
import { logger } from "./lib/logger";
import {
  syncGarminData,
  isRateLimitError,
  isAuthError,
  invalidateGarminSession,
  readBackoffState,
  writeBackoffState,
  clearBackoffState,
} from "./services/garmin";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  scheduleGarminSync();
});

// Backoff delays applied after a 429: 5 min → 15 min → 1 h (then stays at 1 h)
const BACKOFF_DELAYS_MS = [
  5  * 60 * 1000,  //  5 min
  15 * 60 * 1000,  // 15 min
  60 * 60 * 1000,  //  1 h
];
const ONE_HOUR_MS = 60 * 60 * 1000;

async function scheduleGarminSync(): Promise<void> {
  const email    = process.env["GARMIN_EMAIL"];
  const password = process.env["GARMIN_PASSWORD"];

  if (!email || !password) {
    logger.warn("Garmin auto-sync disabled: GARMIN_EMAIL / GARMIN_PASSWORD not set");
    return;
  }

  // Resume any in-progress backoff from a previous process instance
  let retryCount = 0;
  let initialDelayMs = 0;

  const savedBackoff = await readBackoffState();
  if (savedBackoff) {
    const remaining = new Date(savedBackoff.nextAllowedAt).getTime() - Date.now();
    if (remaining > 0) {
      retryCount = savedBackoff.retryCount;
      initialDelayMs = remaining;
      logger.warn(
        { retryCount, remainingMin: Math.round(remaining / 60000), nextAllowedAt: savedBackoff.nextAllowedAt },
        `Garmin: resuming rate-limit backoff from previous run — first sync in ${Math.round(remaining / 60000)} min`,
      );
    } else {
      // Cooldown already elapsed, clear the stale file
      await clearBackoffState();
    }
  }

  logger.info("Garmin auto-sync enabled — running initial sync then every hour");

  const scheduleNext = (delayMs: number): void => {
    const runAt = new Date(Date.now() + delayMs);
    logger.info(
      { delayMs, runAt: runAt.toISOString() },
      `Garmin: next sync scheduled at ${runAt.toLocaleTimeString()} (in ${Math.round(delayMs / 60000)} min)`,
    );
    setTimeout(run, delayMs);
  };

  const run = (): void => {
    syncGarminData()
      .then(async () => {
        retryCount = 0;
        await clearBackoffState();
        scheduleNext(ONE_HOUR_MS);
      })
      .catch(async (err: unknown) => {
        if (isRateLimitError(err)) {
          // 429: keep the existing session — the tokens are still valid.
          // Apply exponential backoff and persist the state so restarts honour it.
          const delayMs  = BACKOFF_DELAYS_MS[Math.min(retryCount, BACKOFF_DELAYS_MS.length - 1)] ?? BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]!;
          const nextAllowedAt = new Date(Date.now() + delayMs);
          await writeBackoffState({ nextAllowedAt: nextAllowedAt.toISOString(), retryCount: retryCount + 1 });
          logger.warn(
            {
              retryAttempt: retryCount + 1,
              delayMin: Math.round(delayMs / 60000),
              nextAllowedAt: nextAllowedAt.toISOString(),
            },
            `Garmin: rate limited (429) — retry #${retryCount + 1} scheduled in ${Math.round(delayMs / 60000)} min at ${nextAllowedAt.toLocaleTimeString()}`,
          );
          retryCount++;
          scheduleNext(delayMs);
        } else if (isAuthError(err)) {
          // 401/403: session is invalid — wipe tokens and retry after a short pause
          logger.error({ err }, "Garmin: authentication error — clearing session tokens");
          await invalidateGarminSession();
          await clearBackoffState();
          retryCount = 0;
          scheduleNext(5 * 60 * 1000); // retry in 5 min after re-auth wipe
        } else {
          retryCount = 0;
          logger.error({ err }, "Garmin scheduled sync failed");
          scheduleNext(ONE_HOUR_MS);
        }
      });
  };

  // Honour any persisted cooldown before running for the first time
  if (initialDelayMs > 0) {
    scheduleNext(initialDelayMs);
  } else {
    run();
  }
}
