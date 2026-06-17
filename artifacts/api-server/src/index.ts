import app from "./app";
import { logger } from "./lib/logger";
import { syncGarminData } from "./services/garmin";

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

function scheduleGarminSync(): void {
  const email    = process.env["GARMIN_EMAIL"];
  const password = process.env["GARMIN_PASSWORD"];

  if (!email || !password) {
    logger.warn("Garmin auto-sync disabled: GARMIN_EMAIL / GARMIN_PASSWORD not set");
    return;
  }

  logger.info("Garmin auto-sync enabled — running initial sync then every hour");

  const runSync = () => {
    syncGarminData().catch((err: unknown) => {
      logger.error({ err }, "Garmin scheduled sync failed");
    });
  };

  runSync();

  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(runSync, ONE_HOUR_MS);
}
