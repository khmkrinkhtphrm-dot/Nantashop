import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

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

async function seedDefaultAdmin() {
  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, "admin")).limit(1);
    if (existing.length === 0) {
      const hash = await bcrypt.hash("admin123", 10);
      await db.insert(users).values({
        username: "admin",
        password_hash: hash,
        is_admin: true,
        balance: 0,
        total_topup: 0,
      });
    }
  } catch (err) {
    console.error("[seedDefaultAdmin] failed:", err);
  }
}

seedDefaultAdmin();

router.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "กรุณาใส่ Username และ Password" });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: "Username ต้องมีอย่างน้อย 3 ตัวอักษร" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password ต้องมีอย่างน้อย 6 ตัวอักษร" });
    }
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username นี้ถูกใช้แล้ว" });
    }
    const hash = await bcrypt.hash(password, 10);
    const inserted = await db.insert(users).values({
      username,
      password_hash: hash,
      is_admin: false,
      balance: 0,
      total_topup: 0,
    }).returning(safeFields);
    const user = inserted[0];
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.json({ ...user, token: req.session.id });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "สมัครสมาชิกไม่สำเร็จ" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: "กรุณาใส่ Username และ Password" });
    }
    const found = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (found.length === 0) {
      return res.status(401).json({ error: "Username หรือ Password ไม่ถูกต้อง" });
    }
    const user = found[0];
    const valid = await bcrypt.compare(password, user.password_hash ?? "");
    if (!valid) {
      return res.status(401).json({ error: "Username หรือ Password ไม่ถูกต้อง" });
    }
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      balance: user.balance,
      total_topup: user.total_topup,
      is_admin: user.is_admin,
      created_at: user.created_at,
      token: req.session.id,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "เข้าสู่ระบบไม่สำเร็จ" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    return res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "ยังไม่ได้เข้าสู่ระบบ" });
    }
    const found = await db.select(safeFields).from(users).where(eq(users.id, userId)).limit(1);
    if (found.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "ไม่พบผู้ใช้" });
    }
    return res.json(found[0]);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "ดึงข้อมูลผู้ใช้ไม่สำเร็จ" });
  }
});

export default router;
