import { Router } from "express";
import { db, redeemCodes, users } from "@workspace/db";
import { eq, and, gt, or, isNull } from "drizzle-orm";

const router = Router();

router.get("/redeem-codes", async (req, res) => {
  try {
    const rows = await db.select().from(redeemCodes);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch redeem codes" });
  }
});

router.post("/redeem-codes", async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.expire_date === "" || body.expire_date === undefined) {
      delete body.expire_date;
    }
    const inserted = await db.insert(redeemCodes).values(body).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create redeem code" });
  }
});

router.patch("/redeem-codes/:id", async (req, res) => {
  try {
    const updated = await db
      .update(redeemCodes)
      .set(req.body)
      .where(eq(redeemCodes.id, req.params.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update redeem code" });
  }
});

router.delete("/redeem-codes/:id", async (req, res) => {
  try {
    await db.delete(redeemCodes).where(eq(redeemCodes.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete redeem code" });
  }
});

router.post("/redeem-codes/use", async (req, res) => {
  const { user_id, code } = req.body;
  if (!user_id || !code) { res.status(400).json({ error: "user_id and code required" }); return; }
  try {
    const now = new Date();
    const rows = await db.select().from(redeemCodes).where(
      and(
        eq(redeemCodes.code, code.toUpperCase()),
        eq(redeemCodes.is_active, true),
        or(isNull(redeemCodes.expire_date), gt(redeemCodes.expire_date, now))
      )
    );
    if (!rows.length) { res.status(400).json({ error: "โค้ดไม่ถูกต้องหรือหมดอายุแล้ว" }); return; }
    const rc = rows[0];
    if (rc.usage_limit && rc.uses_count >= rc.usage_limit) {
      res.status(400).json({ error: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว" }); return;
    }
    const userRows = await db.select().from(users).where(eq(users.id, user_id));
    if (!userRows.length) { res.status(404).json({ error: "ไม่พบผู้ใช้" }); return; }
    const newBalance = (userRows[0].balance ?? 0) + rc.credit_amount;
    await db.update(users).set({ balance: newBalance }).where(eq(users.id, user_id));
    await db.update(redeemCodes).set({ uses_count: rc.uses_count + 1 }).where(eq(redeemCodes.id, rc.id));
    res.json({ status: "success", amount: rc.credit_amount, new_balance: newBalance });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to use redeem code" });
  }
});

export default router;
