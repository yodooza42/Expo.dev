import { Router, type IRouter } from "express";

const router: IRouter = Router();

const DISABLED_MSG =
  "Garmin web API sync is disabled — health data is now read locally via Google Health Connect on the device. " +
  "To re-enable, restore the cron in src/index.ts and the route handlers in src/routes/garmin.ts.";

router.get("/garmin/today", (_req, res) => {
  res.status(503).json({ ok: false, message: DISABLED_MSG });
});

router.post("/garmin/sync", (_req, res) => {
  res.status(503).json({ ok: false, message: DISABLED_MSG });
});

export default router;
