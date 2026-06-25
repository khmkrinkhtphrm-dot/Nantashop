import { Router } from "express";
import { db, categories } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

interface CategoryInsert {
  name: string;
  description?: string | null;
  image_url?: string | null;
  is_featured?: boolean;
  sort_order?: number;
}

function sanitizeCategory(body: Record<string, unknown>): Partial<CategoryInsert> & { name?: string } {
  const out: Partial<CategoryInsert> = {};
  if (body.name !== undefined) out.name = String(body.name);
  if (body.description !== undefined) out.description = body.description ? String(body.description) : null;
  if (body.image_url !== undefined) out.image_url = body.image_url ? String(body.image_url) : null;
  if (body.is_featured !== undefined) out.is_featured = Boolean(body.is_featured);
  if (body.sort_order !== undefined) out.sort_order = Number(body.sort_order) || 0;
  return out;
}

router.get("/categories", async (req, res) => {
  try {
    const rows = await db.select().from(categories).orderBy(categories.sort_order, categories.created_at);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const data = sanitizeCategory(req.body as Record<string, unknown>);
    if (!data.name) { res.status(400).json({ error: "ชื่อหมวดหมู่จำเป็น" }); return; }
    const insertData: CategoryInsert = { name: data.name, ...data };
    const inserted = await db.insert(categories).values(insertData).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/categories/:id", async (req, res) => {
  try {
    const data = sanitizeCategory(req.body as Record<string, unknown>);
    const updated = await db.update(categories).set(data).where(eq(categories.id, req.params.id)).returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    await db.delete(categories).where(eq(categories.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;
