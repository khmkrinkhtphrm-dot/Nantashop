import { Router } from "express";
import { db, productStocks } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/stocks/:productId", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(productStocks)
      .where(eq(productStocks.product_id, req.params.productId));
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch stocks" });
  }
});

router.post("/stocks/:productId", async (req, res) => {
  try {
    const lines: string[] = (req.body.lines || []);
    if (!lines.length) { res.status(400).json({ error: "No lines provided" }); return; }
    const rows = lines.map((content: string) => ({
      product_id: req.params.productId,
      content,
    }));
    const inserted = await db.insert(productStocks).values(rows).returning();
    res.json(inserted);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to add stocks" });
  }
});

router.delete("/stocks/item/:id", async (req, res) => {
  try {
    await db.delete(productStocks).where(eq(productStocks.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete stock" });
  }
});

export default router;
