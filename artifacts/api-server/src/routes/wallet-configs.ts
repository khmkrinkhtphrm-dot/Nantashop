import { Router } from "express";
import { db, walletConfigs } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/wallet-configs", async (req, res) => {
  try {
    const rows = await db.select().from(walletConfigs);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch wallet configs" });
  }
});

router.put("/wallet-configs", async (req, res) => {
  try {
    await db.delete(walletConfigs);
    if (req.body.phone_number) {
      const inserted = await db
        .insert(walletConfigs)
        .values({ phone_number: req.body.phone_number, is_active: true })
        .returning();
      res.json(inserted[0]);
    } else {
      res.json({ ok: true });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update wallet config" });
  }
});

router.patch("/wallet-configs/:id", async (req, res) => {
  try {
    const updated = await db
      .update(walletConfigs)
      .set(req.body)
      .where(eq(walletConfigs.id, req.params.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update wallet config" });
  }
});

export default router;
