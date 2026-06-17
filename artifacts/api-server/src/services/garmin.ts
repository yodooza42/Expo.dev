import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { garminHealthTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

async function getGarminClient() {
  const email    = process.env["GARMIN_EMAIL"];
  const password = process.env["GARMIN_PASSWORD"];
  if (!email || !password) {
    throw new Error("GARMIN_EMAIL and GARMIN_PASSWORD environment variables are required");
  }
  const { GarminConnect } = await import("garmin-connect");
  const client = new GarminConnect({ username: email, password });
  await client.login(email, password);
  return client;
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

async function fetchDayData(client: Awaited<ReturnType<typeof getGarminClient>>, date: Date): Promise<GarminDayData> {
  const dateStr = formatDate(date);
  const data: GarminDayData = { date: dateStr };

  try {
    const sleep = await (client as any).getSleepData(date);
    if (sleep?.dailySleepDTO) {
      const s = sleep.dailySleepDTO;
      data.sleepScore      = s.sleepScores?.overall?.value ?? s.sleepScore ?? null;
      data.sleepDurationMin = s.sleepTimeSeconds != null ? Math.round(s.sleepTimeSeconds / 60) : null;
      data.sleepDeepMin    = s.deepSleepSeconds  != null ? Math.round(s.deepSleepSeconds  / 60) : null;
      data.sleepLightMin   = s.lightSleepSeconds != null ? Math.round(s.lightSleepSeconds / 60) : null;
      data.sleepRemMin     = s.remSleepSeconds   != null ? Math.round(s.remSleepSeconds   / 60) : null;
    }
  } catch (err) {
    logger.warn({ err, date: dateStr }, "Garmin: failed to fetch sleep data");
  }

  try {
    const bb = await (client as any).getBodyBattery(date);
    if (Array.isArray(bb) && bb.length > 0) {
      const values = bb.map((e: any) => e.value ?? e.bodyBatteryLevel).filter((v: any) => v != null) as number[];
      if (values.length > 0) {
        data.bodyBatteryMin     = Math.min(...values);
        data.bodyBatteryMax     = Math.max(...values);
        data.bodyBatteryCurrent = values[values.length - 1];
      }
    } else if (bb?.bodyBatteryStatList) {
      const values = (bb.bodyBatteryStatList as any[]).map((e: any) => e.bodyBatteryLevel).filter((v: any) => v != null) as number[];
      if (values.length > 0) {
        data.bodyBatteryMin     = Math.min(...values);
        data.bodyBatteryMax     = Math.max(...values);
        data.bodyBatteryCurrent = values[values.length - 1];
      }
    }
  } catch (err) {
    logger.warn({ err, date: dateStr }, "Garmin: failed to fetch body battery");
  }

  try {
    const hrv = await (client as any).getHrvData(date);
    if (hrv?.hrvSummary?.status) {
      data.hrvStatus = hrv.hrvSummary.status;
    } else if (hrv?.weeklyAvg) {
      data.hrvStatus = "balanced";
    }
  } catch (err) {
    logger.warn({ err, date: dateStr }, "Garmin: failed to fetch HRV");
  }

  try {
    const stress = await (client as any).getDailyStress(date);
    if (stress?.avgStressLevel != null) {
      data.stressAvg = stress.avgStressLevel;
    }
  } catch (err) {
    logger.warn({ err, date: dateStr }, "Garmin: failed to fetch stress");
  }

  try {
    const steps = await (client as any).getDailySteps(date);
    if (Array.isArray(steps) && steps.length > 0) {
      const totalSteps = steps.reduce((sum: number, e: any) => sum + (e.steps ?? e.totalSteps ?? 0), 0);
      data.steps = totalSteps > 0 ? totalSteps : null;
    } else if (steps?.totalSteps != null) {
      data.steps = steps.totalSteps;
    }
  } catch (err) {
    logger.warn({ err, date: dateStr }, "Garmin: failed to fetch steps");
  }

  return data;
}

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
      await db
        .insert(garminHealthTable)
        .values({
          date:               dayData.date,
          sleepScore:         dayData.sleepScore   ?? null,
          sleepDurationMin:   dayData.sleepDurationMin  ?? null,
          sleepDeepMin:       dayData.sleepDeepMin  ?? null,
          sleepLightMin:      dayData.sleepLightMin ?? null,
          sleepRemMin:        dayData.sleepRemMin   ?? null,
          bodyBatteryMin:     dayData.bodyBatteryMin    ?? null,
          bodyBatteryMax:     dayData.bodyBatteryMax    ?? null,
          bodyBatteryCurrent: dayData.bodyBatteryCurrent ?? null,
          hrvStatus:          dayData.hrvStatus     ?? null,
          stressAvg:          dayData.stressAvg     ?? null,
          steps:              dayData.steps         ?? null,
        })
        .onConflictDoUpdate({
          target: garminHealthTable.date,
          set: {
            sleepScore:         dayData.sleepScore   ?? null,
            sleepDurationMin:   dayData.sleepDurationMin  ?? null,
            sleepDeepMin:       dayData.sleepDeepMin  ?? null,
            sleepLightMin:      dayData.sleepLightMin ?? null,
            sleepRemMin:        dayData.sleepRemMin   ?? null,
            bodyBatteryMin:     dayData.bodyBatteryMin    ?? null,
            bodyBatteryMax:     dayData.bodyBatteryMax    ?? null,
            bodyBatteryCurrent: dayData.bodyBatteryCurrent ?? null,
            hrvStatus:          dayData.hrvStatus     ?? null,
            stressAvg:          dayData.stressAvg     ?? null,
            steps:              dayData.steps         ?? null,
            syncedAt:           new Date(),
          },
        });
      logger.info({ date: dayData.date }, "Garmin sync: upserted day");
    } catch (err) {
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
