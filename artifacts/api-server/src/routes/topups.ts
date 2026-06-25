import { Router } from "express";
import { db, topups } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/topups", async (req, res) => {
  try {
    const rows = await db.select().from(topups).orderBy(desc(topups.created_at)).limit(200);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch topups" });
  }
});

export default router;
