import { Router } from "express";
import { db, products, productStocks } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router = Router();

interface ProductInsert {
  name: string;
  category_id?: string | null;
  description?: string | null;
  image_url?: string | null;
  real_price?: number;
  fake_price?: number | null;
  show_fake_price?: boolean;
  hot_badge?: boolean;
  is_featured?: boolean;
  product_type?: string;
  sort_order?: number;
}

function sanitizeProduct(body: Record<string, unknown>): Partial<ProductInsert> {
  const out: Partial<ProductInsert> = {};
  if (body.name !== undefined) out.name = String(body.name);
  if (body.category_id !== undefined) out.category_id = body.category_id ? String(body.category_id) : null;
  if (body.description !== undefined) out.description = body.description ? String(body.description) : null;
  if (body.image_url !== undefined) out.image_url = body.image_url ? String(body.image_url) : null;
  if (body.real_price !== undefined) out.real_price = Number(body.real_price) || 0;
  if (body.fake_price !== undefined) out.fake_price = Number(body.fake_price) || null;
  if (body.show_fake_price !== undefined) out.show_fake_price = Boolean(body.show_fake_price);
  if (body.hot_badge !== undefined) out.hot_badge = Boolean(body.hot_badge);
  if (body.is_featured !== undefined) out.is_featured = Boolean(body.is_featured);
  if (body.product_type !== undefined) out.product_type = String(body.product_type);
  if (body.sort_order !== undefined) out.sort_order = Number(body.sort_order) || 0;
  return out;
}

async function getStockMap(productIds?: string[]): Promise<Record<string, number>> {
  const rows = await db
    .select({ product_id: productStocks.product_id, count: count() })
    .from(productStocks)
    .groupBy(productStocks.product_id);
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (!productIds || productIds.includes(r.product_id)) {
      map[r.product_id] = Number(r.count);
    }
  }
  return map;
}

router.get("/products", async (req, res) => {
  try {
    const rows = await db.select().from(products).orderBy(products.sort_order, products.created_at);
    const stockMap = await getStockMap(rows.map(p => p.id));
    const result = rows.map(p => ({ ...p, stock: stockMap[p.id] ?? 0 }));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const rows = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    if (!rows[0]) { res.status(404).json({ error: "ไม่พบสินค้า" }); return; }
    const stockMap = await getStockMap([req.params.id]);
    res.json({ ...rows[0], stock: stockMap[req.params.id] ?? 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.post("/products", async (req, res) => {
  try {
    const data = sanitizeProduct(req.body as Record<string, unknown>);
    if (!data.name) { res.status(400).json({ error: "ชื่อสินค้าจำเป็น" }); return; }
    const insertData: ProductInsert = { name: data.name, ...data };
    const inserted = await db.insert(products).values(insertData).returning();
    res.json(inserted[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.patch("/products/:id", async (req, res) => {
  try {
    const data = sanitizeProduct(req.body as Record<string, unknown>);
    const updated = await db.update(products).set(data).where(eq(products.id, req.params.id)).returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    await db.delete(products).where(eq(products.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
