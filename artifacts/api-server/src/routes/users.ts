import { Router } from "express";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const safeFields = {
  id: users.id,
  username: users.username,
  email: users.email,
  avatar_url: users.avatar_url,
  balance: users.balance,
  total_topup: users.total_topup,
  is_admin: users.is_admin,
  created_at: users.created_at,
};

router.get("/users", async (req, res) => {
  try {
    const rows = await db.select(safeFields).from(users);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", async (req, res) => {
  try {
    const { password, ...rest } = req.body;
    const insertData: Record<string, unknown> = { ...rest };
    if (password) insertData.password_hash = password;
    const inserted = await db
      .insert(users)
      .values(insertData as typeof users.$inferInsert)
      .returning(safeFields);
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const { password, password_hash: _ph, ...rest } = req.body;
    const updateData: Record<string, unknown> = { ...rest };
    if (password) updateData.password_hash = password;
    const updated = await db
      .update(users)
      .set(updateData as Partial<typeof users.$inferInsert>)
      .where(eq(users.id, req.params.id))
      .returning(safeFields);
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    await db.delete(users).where(eq(users.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
