import { Router, type IRouter } from "express";
import { syncGarminData, getGarminToday } from "../services/garmin";

const router: IRouter = Router();

router.get("/garmin/today", async (req, res) => {
  try {
    const data = await getGarminToday();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get garmin today");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/garmin/sync", async (req, res) => {
  const email    = process.env["GARMIN_EMAIL"];
  const password = process.env["GARMIN_PASSWORD"];
  if (!email || !password) {
    res.status(503).json({ ok: false, message: "GARMIN_EMAIL and GARMIN_PASSWORD are not configured" });
    return;
  }
  try {
    await syncGarminData();
    res.json({ ok: true, message: "Sync completed" });
  } catch (err) {
    req.log.error({ err }, "Garmin sync failed");
    res.status(503).json({ ok: false, message: "Sync failed — check Garmin credentials or connectivity" });
  }
});

export default router;
