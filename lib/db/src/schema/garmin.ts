import { pgTable, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const garminHealthTable = pgTable("garmin_health", {
  date:                 date("date").primaryKey(),
  sleepScore:          integer("sleep_score"),
  sleepDurationMin:    integer("sleep_duration_min"),
  sleepDeepMin:        integer("sleep_deep_min"),
  sleepLightMin:       integer("sleep_light_min"),
  sleepRemMin:         integer("sleep_rem_min"),
  bodyBatteryMin:      integer("body_battery_min"),
  bodyBatteryMax:      integer("body_battery_max"),
  bodyBatteryCurrent:  integer("body_battery_current"),
  hrvStatus:           text("hrv_status"),
  stressAvg:           integer("stress_avg"),
  steps:               integer("steps"),
  syncedAt:            timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGarminHealthSchema = createInsertSchema(garminHealthTable).omit({ syncedAt: true });
export type InsertGarminHealth = z.infer<typeof insertGarminHealthSchema>;
export type GarminHealth = typeof garminHealthTable.$inferSelect;
