import { Router } from "express";
import { db, sliders } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/sliders", async (req, res) => {
  try {
    const rows = await db.select().from(sliders).orderBy(asc(sliders.sort_order));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch sliders" });
  }
});

router.post("/sliders", async (req, res) => {
  try {
    const inserted = await db.insert(sliders).values(req.body).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create slider" });
  }
});

router.patch("/sliders/:id", async (req, res) => {
  try {
    const updated = await db
      .update(sliders)
      .set(req.body)
      .where(eq(sliders.id, req.params.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update slider" });
  }
});

router.delete("/sliders/:id", async (req, res) => {
  try {
    await db.delete(sliders).where(eq(sliders.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete slider" });
  }
});

export default router;
