import { Router } from "express";
import { db, quickLinks } from "@workspace/db";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/quick-links", async (req, res) => {
  try {
    const rows = await db.select().from(quickLinks).orderBy(asc(quickLinks.sort_order));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch quick links" });
  }
});

router.put("/quick-links", async (req, res) => {
  try {
    const links: Array<{ title: string; image_url?: string; target_page: string; sort_order?: number }> = req.body;
    await db.delete(quickLinks);
    if (links.length > 0) {
      await db.insert(quickLinks).values(links);
    }
    const rows = await db.select().from(quickLinks).orderBy(asc(quickLinks.sort_order));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update quick links" });
  }
});

export default router;
