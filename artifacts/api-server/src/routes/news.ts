import { Router } from "express";
import { db, news } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/news", async (req, res) => {
  try {
    const rows = await db.select().from(news).orderBy(desc(news.created_at));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

router.post("/news", async (req, res) => {
  try {
    const inserted = await db.insert(news).values(req.body).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create news" });
  }
});

router.patch("/news/:id", async (req, res) => {
  try {
    const updated = await db
      .update(news)
      .set(req.body)
      .where(eq(news.id, req.params.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update news" });
  }
});

router.delete("/news/:id", async (req, res) => {
  try {
    await db.delete(news).where(eq(news.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete news" });
  }
});

export default router;
