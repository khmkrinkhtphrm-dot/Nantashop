import { Router } from "express";
import { db, users, orders, topups, products, websiteSettings } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/admin/stats", async (req, res) => {
  try {
    const [userRow] = await db.select({ count: sql<string>`COUNT(*)` }).from(users);
    const [orderRow] = await db.select({ count: sql<string>`COUNT(*)`, revenue: sql<string>`COALESCE(SUM(price_paid),0)` }).from(orders);
    const [topupRow] = await db.select({ count: sql<string>`COUNT(*)`, total: sql<string>`COALESCE(SUM(amount),0)` }).from(topups);
    const [productRow] = await db.select({ count: sql<string>`COUNT(*)` }).from(products);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    const [todayOrderRow] = await db.select({ count: sql<string>`COUNT(*)`, revenue: sql<string>`COALESCE(SUM(price_paid),0)` }).from(orders).where(sql`created_at >= ${todayStr}`);
    const [todayTopupRow] = await db.select({ total: sql<string>`COALESCE(SUM(amount),0)` }).from(topups).where(sql`created_at >= ${todayStr} AND status = 'success'`);

    const dayNames = ["อา","จ","อ","พ","พฤ","ศ","ส"];
    const dailyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nd = new Date(d);
      nd.setDate(nd.getDate() + 1);
      const [dr] = await db.select({ sales: sql<string>`COALESCE(SUM(price_paid),0)` }).from(orders).where(sql`created_at >= ${d.toISOString()} AND created_at < ${nd.toISOString()}`);
      const [tr] = await db.select({ topups: sql<string>`COALESCE(SUM(amount),0)` }).from(topups).where(sql`created_at >= ${d.toISOString()} AND created_at < ${nd.toISOString()} AND status='success'`);
      dailyChart.push({ day: dayNames[d.getDay()], sales: Number(dr.sales), topups: Number(tr.topups) });
    }

    /* ── read display offsets from settings ── */
    const settingsRows = await db.select({
      fake_users_offset: websiteSettings.fake_users_offset,
      fake_topup_offset: websiteSettings.fake_topup_offset,
    }).from(websiteSettings).limit(1);
    const fakeUsers  = settingsRows[0]?.fake_users_offset  ?? 0;
    const fakeTopup  = settingsRows[0]?.fake_topup_offset  ?? 0;

    res.json({
      total_users:        Number(userRow.count)    + fakeUsers,
      total_orders:       Number(orderRow.count),
      total_revenue:      Number(orderRow.revenue),
      total_topups:       Number(topupRow.count),
      total_topup_amount: Number(topupRow.total)   + fakeTopup,
      total_products:     Number(productRow.count),
      today_orders:       Number(todayOrderRow.count),
      today_revenue:      Number(todayOrderRow.revenue),
      today_topup:        Number(todayTopupRow.total),
      daily_chart:        dailyChart,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
