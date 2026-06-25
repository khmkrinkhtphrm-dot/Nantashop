import { Router } from "express";
import { db, orders, products, productStocks, users } from "@workspace/db";
import { eq, desc, asc, and, inArray } from "drizzle-orm";

const router = Router();

router.get("/orders", async (req, res) => {
  try {
    const userId = req.query.user_id as string | undefined;
    const rows = userId
      ? await db.select().from(orders).where(eq(orders.user_id, userId)).orderBy(desc(orders.created_at)).limit(200)
      : await db.select().from(orders).orderBy(desc(orders.created_at)).limit(200);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.post("/orders", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อนซื้อสินค้า" }); return; }

  const { product_id, qty: rawQty } = req.body as { product_id?: string; qty?: number };
  if (!product_id) { res.status(400).json({ error: "กรุณาระบุสินค้า" }); return; }
  const qty = Math.max(1, Math.floor(Number(rawQty) || 1));

  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, product_id)).limit(1);
      if (!product) throw new Error("ไม่พบสินค้า");

      const stockItems = await tx
        .select()
        .from(productStocks)
        .where(eq(productStocks.product_id, product_id))
        .orderBy(asc(productStocks.created_at))
        .limit(qty);

      if (stockItems.length < qty) {
        throw new Error(`สินค้าคงเหลือไม่เพียงพอ (มี ${stockItems.length} ชิ้น)`);
      }

      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error("ไม่พบผู้ใช้");

      const totalPrice = product.real_price * qty;
      if (user.balance < totalPrice) {
        throw new Error(`ยอดเงินไม่เพียงพอ (มี ฿${user.balance.toLocaleString()} ต้องการ ฿${totalPrice.toLocaleString()})`);
      }

      await tx
        .delete(productStocks)
        .where(inArray(productStocks.id, stockItems.map(s => s.id)));

      await tx
        .update(users)
        .set({ balance: user.balance - totalPrice })
        .where(eq(users.id, userId));

      const deliveredData = stockItems.map(s => s.content).join("\n");

      const [order] = await tx
        .insert(orders)
        .values({
          user_id: userId,
          product_id: product.id,
          product_name: product.name,
          product_image: product.image_url ?? "",
          price_paid: totalPrice,
          delivered_data: deliveredData,
        })
        .returning();

      return order;
    });

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    req.log.error(err);
    res.status(400).json({ error: msg });
  }
});

export default router;
