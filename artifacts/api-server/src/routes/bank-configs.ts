import { Router } from "express";
import { db, bankConfigs } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/bank-configs", async (req, res) => {
  try {
    const rows = await db.select().from(bankConfigs);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch bank configs" });
  }
});

router.post("/bank-configs", async (req, res) => {
  try {
    const inserted = await db.insert(bankConfigs).values(req.body).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create bank config" });
  }
});

router.patch("/bank-configs/:id", async (req, res) => {
  try {
    const updated = await db
      .update(bankConfigs)
      .set(req.body)
      .where(eq(bankConfigs.id, req.params.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update bank config" });
  }
});

router.delete("/bank-configs/:id", async (req, res) => {
  try {
    await db.delete(bankConfigs).where(eq(bankConfigs.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete bank config" });
  }
});

export default router;
