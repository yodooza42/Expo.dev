import { mkdirSync, existsSync } from "fs";
import { readFile, writeFile, rm } from "fs/promises";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { garminHealthTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ─── Paths ────────────────────────────────────────────────────────────────────

const TOKEN_DIR    = "/tmp/garmin-tokens";
const BACKOFF_FILE = "/tmp/garmin-backoff.json";

// ─── Error classification ─────────────────────────────────────────────────────

export function isRateLimitError(err: unknown): boolean {
  const e = err as any;
  if (e?.response?.status === 429 || e?.status === 429 || e?.statusCode === 429) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit")) return true;
  }
  return false;
}

export function isAuthError(err: unknown): boolean {
  const e = err as any;
  const status = e?.response?.status ?? e?.status ?? e?.statusCode;
  if (status === 401 || status === 403) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) return true;
  }
  return false;
}

// ─── Backoff state (persisted so restarts honour existing cooldowns) ──────────

interface BackoffState {
  nextAllowedAt: string;
  retryCount: number;
}

export async function readBackoffState(): Promise<BackoffState | null> {
  try {
    const raw = await readFile(BACKOFF_FILE, "utf-8");
    return JSON.parse(raw) as BackoffState;
  } catch {
    return null;
  }
}

export async function writeBackoffState(state: BackoffState): Promise<void> {
  try {
    await writeFile(BACKOFF_FILE, JSON.stringify(state), "utf-8");
  } catch (err) {
    logger.warn({ err }, "Garmin: could not persist backoff state");
  }
}

export async function clearBackoffState(): Promise<void> {
  try {
    await rm(BACKOFF_FILE, { force: true });
  } catch {
    // ignore
  }
}

// ─── Session cache (in-memory) ────────────────────────────────────────────────

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

interface SessionCache {
  client: any;
  expiresAt: number;
}

let sessionCache: SessionCache | null = null;

/**
 * Clears both in-memory and on-disk session so the next call forces a fresh
 * login. Call this ONLY on authentication failures (401/403) — NOT on 429,
 * because the existing session tokens remain valid when rate-limited.
 */
export async function invalidateGarminSession(): Promise<void> {
  sessionCache = null;
  try {
    await rm(TOKEN_DIR, { recursive: true, force: true });
    logger.info("Garmin: session tokens deleted — next sync will re-authenticate");
  } catch (err) {
    logger.warn({ err }, "Garmin: could not delete token directory");
  }
}

async function freshLogin(GarminConnect: any, email: string, password: string) {
  const client = new GarminConnect({ username: email, password });
  logger.info("Garmin: performing fresh login");
  await client.login(email, password);

  try {
    mkdirSync(TOKEN_DIR, { recursive: true });
    client.exportTokenToFile(TOKEN_DIR);
    logger.info({ tokenDir: TOKEN_DIR }, "Garmin: OAuth tokens saved to disk");
  } catch (err) {
    logger.warn({ err }, "Garmin: could not save OAuth tokens to disk");
  }

  return client;
}

async function getGarminClient() {
  const now = Date.now();

  // Fast path: reuse in-memory cached client
  if (sessionCache && sessionCache.expiresAt > now) {
    logger.debug("Garmin: reusing in-memory session");
    return sessionCache.client;
  }

  const email    = process.env["GARMIN_EMAIL"];
  const password = process.env["GARMIN_PASSWORD"];
  if (!email || !password) {
    throw new Error("GARMIN_EMAIL and GARMIN_PASSWORD environment variables are required");
  }

  const { GarminConnect } = await import("garmin-connect");

  // Try restoring persisted OAuth tokens (survives restarts — avoids re-login)
  if (existsSync(TOKEN_DIR)) {
    let restoredClient: any;
    try {
      restoredClient = new GarminConnect({ username: email, password });
      restoredClient.loadTokenByFile(TOKEN_DIR);
    } catch (loadErr) {
      logger.warn({ err: loadErr }, "Garmin: token file unreadable — falling back to fresh login");
      restoredClient = null;
    }

    if (restoredClient) {
      // Validate tokens with a lightweight call before trusting this session.
      // This detects expired tokens immediately so fetchDayData never silently
      // writes empty data due to auth failures on every endpoint.
      try {
        await restoredClient.getUserSettings();
        sessionCache = { client: restoredClient, expiresAt: now + SESSION_TTL_MS };
        logger.info("Garmin: session restored from persisted OAuth tokens — no login needed");
        return restoredClient;
      } catch (validateErr) {
        if (isRateLimitError(validateErr)) {
          // Propagate 429 so the scheduler can apply backoff — don't attempt login now
          logger.warn({ err: validateErr }, "Garmin: rate limited while validating restored session — propagating 429");
          throw validateErr;
        }
        if (isAuthError(validateErr)) {
          logger.warn("Garmin: persisted tokens expired/rejected (401/403) — clearing and re-logging in");
        } else {
          logger.warn({ err: validateErr }, "Garmin: token validation call failed — falling back to fresh login");
        }
        await invalidateGarminSession();
      }
    }
  }

  // Fresh login (either no token file, or token was invalid)
  const client = await freshLogin(GarminConnect, email, password);
  sessionCache = { client, expiresAt: now + SESSION_TTL_MS };
  return client;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface GarminDayData {
  date: string;
  sleepScore?: number | null;
  sleepDurationMin?: number | null;
  sleepDeepMin?: number | null;
  sleepLightMin?: number | null;
  sleepRemMin?: number | null;
  bodyBatteryMin?: number | null;
  bodyBatteryMax?: number | null;
  bodyBatteryCurrent?: number | null;
  hrvStatus?: string | null;
  stressAvg?: number | null;
  steps?: number | null;
}

/**
 * Returns null when all fetches fail due to an auth error (so the caller can
 * skip the DB write rather than upsert a row of all-null values).
 */
async function fetchDayData(
  client: Awaited<ReturnType<typeof getGarminClient>>,
  date: Date,
): Promise<GarminDayData | null> {
  const dateStr = formatDate(date);
  const data: GarminDayData = { date: dateStr };
  let successCount = 0;

  // Helper: run one Garmin fetch, accumulate result, re-throw auth/rate-limit errors
  async function attempt<T>(
    label: string,
    fn: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<void> {
    try {
      const result = await fn();
      apply(result);
      successCount++;
    } catch (err) {
      // Auth and rate-limit errors must bubble up — don't swallow them
      if (isAuthError(err) || isRateLimitError(err)) throw err;
      logger.warn({ err, date: dateStr }, `Garmin: failed to fetch ${label}`);
    }
  }

  await attempt("sleep data", () => (client as any).getSleepData(date), (sleep: any) => {
    if (sleep?.dailySleepDTO) {
      const s = sleep.dailySleepDTO;
      data.sleepScore       = s.sleepScores?.overall?.value ?? s.sleepScore ?? null;
      data.sleepDurationMin = s.sleepTimeSeconds != null ? Math.round(s.sleepTimeSeconds / 60) : null;
      data.sleepDeepMin     = s.deepSleepSeconds  != null ? Math.round(s.deepSleepSeconds  / 60) : null;
      data.sleepLightMin    = s.lightSleepSeconds != null ? Math.round(s.lightSleepSeconds / 60) : null;
      data.sleepRemMin      = s.remSleepSeconds   != null ? Math.round(s.remSleepSeconds   / 60) : null;
    }
  });

  await attempt("body battery", () => (client as any).getBodyBattery(date), (bb: any) => {
    let values: number[] = [];
    if (Array.isArray(bb) && bb.length > 0) {
      values = bb.map((e: any) => e.value ?? e.bodyBatteryLevel).filter((v: any) => v != null) as number[];
    } else if (bb?.bodyBatteryStatList) {
      values = (bb.bodyBatteryStatList as any[]).map((e: any) => e.bodyBatteryLevel).filter((v: any) => v != null) as number[];
    }
    if (values.length > 0) {
      data.bodyBatteryMin     = Math.min(...values);
      data.bodyBatteryMax     = Math.max(...values);
      data.bodyBatteryCurrent = values[values.length - 1];
    }
  });

  await attempt("HRV", () => (client as any).getHrvData(date), (hrv: any) => {
    if (hrv?.hrvSummary?.status) {
      data.hrvStatus = hrv.hrvSummary.status;
    } else if (hrv?.weeklyAvg) {
      data.hrvStatus = "balanced";
    }
  });

  await attempt("stress", () => (client as any).getDailyStress(date), (stress: any) => {
    if (stress?.avgStressLevel != null) {
      data.stressAvg = stress.avgStressLevel;
    }
  });

  await attempt("steps", () => (client as any).getDailySteps(date), (steps: any) => {
    if (Array.isArray(steps) && steps.length > 0) {
      const total = steps.reduce((sum: number, e: any) => sum + (e.steps ?? e.totalSteps ?? 0), 0);
      data.steps = total > 0 ? total : null;
    } else if (steps?.totalSteps != null) {
      data.steps = steps.totalSteps;
    }
  });

  // If every endpoint failed (not due to auth — those re-throw), skip the upsert
  if (successCount === 0) {
    logger.warn({ date: dateStr }, "Garmin: all data fetches failed for this day — skipping DB write");
    return null;
  }

  return data;
}

// ─── Public sync ──────────────────────────────────────────────────────────────

export async function syncGarminData(): Promise<void> {
  logger.info("Garmin sync: starting");
  let client: Awaited<ReturnType<typeof getGarminClient>>;
  try {
    client = await getGarminClient();
  } catch (err) {
    logger.error({ err }, "Garmin sync: failed to authenticate");
    throw err;
  }

  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const date of [today, yesterday]) {
    try {
      const dayData = await fetchDayData(client, date);
      if (!dayData) continue; // all fetches failed non-fatally — already logged

      await db
        .insert(garminHealthTable)
        .values({
          date:               dayData.date,
          sleepScore:         dayData.sleepScore        ?? null,
          sleepDurationMin:   dayData.sleepDurationMin  ?? null,
          sleepDeepMin:       dayData.sleepDeepMin       ?? null,
          sleepLightMin:      dayData.sleepLightMin      ?? null,
          sleepRemMin:        dayData.sleepRemMin        ?? null,
          bodyBatteryMin:     dayData.bodyBatteryMin     ?? null,
          bodyBatteryMax:     dayData.bodyBatteryMax     ?? null,
          bodyBatteryCurrent: dayData.bodyBatteryCurrent ?? null,
          hrvStatus:          dayData.hrvStatus          ?? null,
          stressAvg:          dayData.stressAvg          ?? null,
          steps:              dayData.steps              ?? null,
        })
        .onConflictDoUpdate({
          target: garminHealthTable.date,
          set: {
            sleepScore:         dayData.sleepScore        ?? null,
            sleepDurationMin:   dayData.sleepDurationMin  ?? null,
            sleepDeepMin:       dayData.sleepDeepMin       ?? null,
            sleepLightMin:      dayData.sleepLightMin      ?? null,
            sleepRemMin:        dayData.sleepRemMin        ?? null,
            bodyBatteryMin:     dayData.bodyBatteryMin     ?? null,
            bodyBatteryMax:     dayData.bodyBatteryMax     ?? null,
            bodyBatteryCurrent: dayData.bodyBatteryCurrent ?? null,
            hrvStatus:          dayData.hrvStatus          ?? null,
            stressAvg:          dayData.stressAvg          ?? null,
            steps:              dayData.steps              ?? null,
            syncedAt:           new Date(),
          },
        });
      logger.info({ date: dayData.date }, "Garmin sync: upserted day");
    } catch (err) {
      // Auth/rate-limit errors propagate so the scheduler can react correctly
      if (isAuthError(err) || isRateLimitError(err)) throw err;
      logger.error({ err, date: formatDate(date) }, "Garmin sync: failed for day");
    }
  }

  logger.info("Garmin sync: done");
}

export async function getGarminToday() {
  const today     = todayISO();
  const yesterday = yesterdayISO();

  const [todayRow, yesterdayRow] = await Promise.all([
    db.select().from(garminHealthTable).where(eq(garminHealthTable.date, today)).limit(1),
    db.select().from(garminHealthTable).where(eq(garminHealthTable.date, yesterday)).limit(1),
  ]);

  return {
    today:     todayRow[0]     ?? null,
    yesterday: yesterdayRow[0] ?? null,
  };
}
