import { Router } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, walletConfigs, topups, users } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();
const execFileAsync = promisify(execFile);

const TM_ERROR: Record<string, string> = {
  VOUCHER_NOT_FOUND:            "ไม่พบซองอั้งเปา กรุณาตรวจสอบลิ้งค์อีกครั้ง",
  VOUCHER_OUT_OF_STOCK:         "ซองอั้งเปานี้ถูกรับไปแล้ว",
  VOUCHER_REDEEMED:             "ซองอั้งเปานี้ถูกใช้ไปแล้ว",
  EXCEEDED_LIMIT_REDEEM_WALLET: "เกินจำนวนที่อนุญาต กรุณาลองใหม่ภายหลัง",
  CAMPAIGN_NOT_FOUND:           "ไม่พบแคมเปญนี้",
};

function extractHash(url: string): string | null {
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v) return v;
    // fallback: plain hash without URL
    if (/^[a-z0-9]+$/i.test(url.trim())) return url.trim();
    return null;
  } catch {
    if (/^[a-z0-9]+$/i.test(url.trim())) return url.trim();
    return null;
  }
}

async function callTrueMoney(phone: string, hash: string): Promise<Record<string, unknown>> {
  const payload = JSON.stringify({ mobile: phone, voucher_hash: hash });

  // Use system curl — avoids Cloudflare JA3/TLS fingerprint blocking that affects Node.js fetch
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "--max-time", "15",
    "-X", "POST",
    `https://gift.truemoney.com/campaign/vouchers/${hash}/redeem`,
    "-H", "Content-Type: application/json",
    "-H", "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: th-TH,th;q=0.9,en;q=0.8",
    "-H", "Origin: https://gift.truemoney.com",
    "-H", "Referer: https://gift.truemoney.com/",
    "--data-raw", payload,
  ]);

  return JSON.parse(stdout) as Record<string, unknown>;
}

router.post("/angpao/redeem", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อน" });

  const { url } = req.body as { url?: string };
  if (!url || !url.includes("truemoney.com")) {
    return res.status(400).json({ error: "กรุณาใส่ลิ้งค์อั้งเปา TrueMoney ที่ถูกต้อง" });
  }

  const hash = extractHash(url);
  if (!hash) {
    return res.status(400).json({ error: "ไม่พบ voucher code ในลิ้งค์นี้" });
  }

  const configs = await db.select().from(walletConfigs).where(eq(walletConfigs.is_active, true)).limit(1);
  if (!configs.length || !configs[0].phone_number) {
    return res.status(503).json({ error: "ยังไม่ได้ตั้งค่าเบอร์รับอั้งเปา กรุณาติดต่อแอดมิน" });
  }
  const phone = configs[0].phone_number;

  let tmData: Record<string, unknown>;
  try {
    tmData = await callTrueMoney(phone, hash);
  } catch (err) {
    req.log.error({ err }, "TrueMoney curl failed");
    return res.status(502).json({ error: "เชื่อมต่อ TrueMoney ไม่ได้ กรุณาลองใหม่อีกครั้ง" });
  }

  const status = tmData.status as Record<string, string> | undefined;
  const code   = status?.code ?? "";

  if (code !== "SUCCESS") {
    const msg = TM_ERROR[code] ?? status?.message ?? "รับอั้งเปาไม่สำเร็จ กรุณาลองใหม่";
    return res.status(400).json({ error: msg });
  }

  const voucher    = ((tmData.data as Record<string, unknown>)?.voucher ?? {}) as Record<string, unknown>;
  const amountBaht = Number(voucher.redeemed_amount_baht ?? voucher.amount_baht ?? 0);
  if (amountBaht <= 0) {
    return res.status(400).json({ error: "จำนวนเงินในซองเป็น 0 ไม่สามารถเติมได้" });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        balance:     sql`${users.balance} + ${amountBaht}`,
        total_topup: sql`${users.total_topup} + ${amountBaht}`,
      })
      .where(eq(users.id, userId));

    await tx.insert(topups).values({
      user_id: userId,
      amount:  amountBaht,
      method:  "angpao",
      status:  "success",
    });
  });

  const [updated] = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return res.json({ amount: amountBaht, new_balance: updated.balance });
});

export default router;
