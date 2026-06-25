import { Router } from "express";
import { db, topups, topupRequests, users, bankConfigs } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

const router = Router();

/* ════════════════════════════════════════════════════════════
   RDCW SLIP VERIFY  —  https://slip.rdcw.co.th
   Docs: https://slip.rdcw.co.th/docs
════════════════════════════════════════════════════════════ */

interface RdcwParty {
  displayName?: string;
  name?: string;
  proxy?: { type?: string; value?: string };
  account?: { type?: string; value?: string };
}

interface RdcwData {
  transRef?: string;
  date?: string;
  countryCode?: string;
  amount?: number;
  payer?: RdcwParty;
  receiver?: RdcwParty;
  receivingBank?: string;
  sendingBank?: string;
}

/* ── FIX #1: RDCW v2 API ใช้ field "valid" ไม่ใช่ "success" ── */
interface RdcwResponse {
  valid?: boolean;   // v2 API (ใหม่)
  success?: boolean; // v1 fallback (deprecated)
  data?: RdcwData;
  code?: string;
  message?: string;
}

async function verifyWithRdcw(
  imageBuffer: Buffer,
  mimeType: string,
  clientId: string,
  clientSecret: string,
): Promise<RdcwResponse> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
  const form = new globalThis.FormData();
  form.append("files", blob, "slip.jpg");

  const resp = await fetch("https://suba.rdcw.co.th/v2/inquiry", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
    },
    body: form,
  });

  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`RDCW HTTP ${resp.status}: ${text}`);
  }

  try {
    return JSON.parse(text) as RdcwResponse;
  } catch {
    throw new Error(`RDCW invalid JSON: ${text.slice(0, 200)}`);
  }
}

/* ── รองรับทั้ง v1 (success) และ v2 (valid) ── */
function isRdcwValid(r: RdcwResponse): boolean {
  return r.valid === true || r.success === true;
}

/* ════════════════════════════════════════════════════════════
   POST /topup-requests/slip-verify   (main endpoint)
   Mode A: RDCW verified → credit immediately
   Mode B: No RDCW creds → save as pending for admin approval
════════════════════════════════════════════════════════════ */
router.post("/topup-requests/slip-verify", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อน" }); return; }

  const { slip_base64 } = req.body as { slip_base64?: string };
  if (!slip_base64) { res.status(400).json({ error: "กรุณาแนบสลิปการโอนเงิน" }); return; }

  /* decode base64 */
  let imageBuffer: Buffer;
  let mimeType = "image/jpeg";
  try {
    const match = slip_base64.match(/^data:(image\/\w+);base64,/);
    if (match) mimeType = match[1];
    imageBuffer = Buffer.from(slip_base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  } catch {
    res.status(400).json({ error: "รูปภาพไม่ถูกต้อง กรุณาลองใหม่" }); return;
  }

  /* load active bank configs */
  const activeBanks = await db.select().from(bankConfigs).where(eq(bankConfigs.is_active, true));

  if (activeBanks.length === 0) {
    res.status(503).json({ error: "ยังไม่ได้ตั้งค่าบัญชีธนาคาร กรุณาติดต่อแอดมิน" }); return;
  }

  /* find the first bank that has RDCW credentials */
  const rdcwBank = activeBanks.find(b => b.rdcw_client_id && b.rdcw_client_secret);

  /* ── MODE A: RDCW auto-verify ── */
  if (rdcwBank) {
    let rdcwResult: RdcwResponse;
    try {
      rdcwResult = await verifyWithRdcw(
        imageBuffer,
        mimeType,
        rdcwBank.rdcw_client_id!,
        rdcwBank.rdcw_client_secret!,
      );
    } catch (err) {
      req.log.error({ err }, "RDCW request failed");
      res.status(502).json({ error: "เชื่อมต่อระบบตรวจสลิปไม่ได้ กรุณาลองใหม่" }); return;
    }

    req.log.info({ rdcwResult }, "RDCW_RESPONSE");

    /* ── FIX #1 applied: ใช้ isRdcwValid() รองรับทั้ง v1/v2 ── */
    if (!isRdcwValid(rdcwResult) || !rdcwResult.data) {
      const msg = rdcwErrorMessage(rdcwResult.code, rdcwResult.message);
      res.status(400).json({ error: msg }); return;
    }

    const data = rdcwResult.data;
    const amount = data.amount ?? 0;
    const transRef = data.transRef ?? "";

    if (amount <= 0) {
      res.status(400).json({ error: "ยอดเงินในสลิปเป็น 0 ไม่สามารถเติมได้" }); return;
    }
    if (!transRef) {
      res.status(400).json({ error: "ไม่พบรหัสอ้างอิงในสลิป กรุณาลองใหม่" }); return;
    }

    /* Anti-reuse */
    const dup = await db.select({ id: topups.id }).from(topups).where(eq(topups.trans_ref, transRef)).limit(1);
    if (dup.length > 0) {
      res.status(400).json({ error: "สลิปนี้ถูกใช้งานไปแล้ว" }); return;
    }

    /* ── FIX #2: Receiver account match
          รองรับ: เลขที่ถูก mask (XXXXXXXXXXX0514), PromptPay 10/13 หลัก ── */
    const receiverAccount =
      data.receiver?.account?.value ??
      data.receiver?.proxy?.value ?? "";

    if (receiverAccount) {
      /* ลบ X (mask), ขีด, ช่องว่าง แล้วนับเฉพาะตัวเลข */
      const norm = (s: string) => s.replace(/[-\s]/g, "").replace(/X/gi, "").toLowerCase();
      const normReceiver = norm(receiverAccount);

      /* PromptPay: เบอร์โทร 10 หลัก หรือเลขบัตร 13 หลัก */
      const isPromptPay =
        /^0[689]\d{8}$/.test(normReceiver) ||
        /^\d{13}$/.test(normReceiver) ||
        /^\d{10}$/.test(normReceiver);

      /* เลขที่ถูก mask: RDCW ส่งมาเป็น XXXXXXXXXXX0514 — ดึงตัวเลขที่เห็นออกมา */
      const isMasked = /^X+\d+$/i.test(receiverAccount.replace(/[-\s]/g, ""));
      const visibleDigits = receiverAccount.replace(/[X\s-]/gi, "");

      const matched = activeBanks.some(b => {
        const na = b.account_number.replace(/[-\s]/g, "");
        const nq = receiverAccount.replace(/[X\s-]/gi, "");
        return (
          na === nq ||
          na.slice(-8) === nq.slice(-8) ||
          (isMasked && visibleDigits.length >= 3 && na.endsWith(visibleDigits))
        );
      });

      if (!matched && !isPromptPay) {
        req.log.warn({ receiverAccount }, "RDCW receiver mismatch");
        res.status(400).json({ error: "บัญชีผู้รับในสลิปไม่ตรงกับบัญชีของร้าน กรุณาโอนมายังบัญชีที่ระบุ" });
        return;
      }
    }

    /* Credit */
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) { res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" }); return; }

      /* ── FIX #3: Drizzle คืน numeric เป็น string — แปลงด้วย + ก่อนบวก ── */
      const currentBalance = +(user.balance ?? 0);
      const newBalance = +((currentBalance + amount).toFixed(2));

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            balance: newBalance,
            total_topup: sql`${users.total_topup} + ${amount}`,
          })
          .where(eq(users.id, userId));
        await tx.insert(topups).values({
          user_id: userId,
          amount: amount,
          method: "Slip (RDCW)",
          status: "success",
          trans_ref: transRef,
        });
        await tx.insert(topupRequests).values({
          user_id: userId,
          username: user.username,
          amount: amount,
          method: "slip",
          slip_url: slip_base64.slice(0, 2000),
          status: "approved",
          note: `ref:${transRef}|rdcw:auto|bank:${rdcwBank.bank_name}`,
        });
      });

      req.log.info({ userId, amount, transRef, newBalance }, "RDCW Slip credited");
      res.json({ ok: true, mode: "rdcw", amount, new_balance: newBalance, ref: transRef });
    } catch (err) {
      req.log.error(err, "DB error");
      res.status(500).json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    }
    return;
  }

  /* ── MODE B: No RDCW — save as pending for admin to review ── */
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" }); return; }

    await db.insert(topupRequests).values({
      user_id: userId,
      username: user.username,
      amount: 0,
      method: "slip",
      slip_url: slip_base64.slice(0, 2000),
      status: "pending",
      note: "รอแอดมินตรวจสอบ (ยังไม่ได้ตั้ง RDCW)",
    });

    req.log.info({ userId }, "Slip saved as pending (no RDCW)");
    res.json({
      ok: true,
      mode: "pending",
      message: "ส่งสลิปเรียบร้อยแล้ว รอแอดมินตรวจสอบและเติมเครดิต",
    });
  } catch (err) {
    req.log.error(err, "DB error");
    res.status(500).json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่" });
  }
});

/* ════════════════════════════════════════════════════════════
   Friendly error messages from RDCW error codes
════════════════════════════════════════════════════════════ */
function rdcwErrorMessage(code?: string, fallback?: string): string {
  const map: Record<string, string> = {
    SLIP_NOT_FOUND:        "ไม่พบข้อมูลสลิปนี้ในระบบธนาคาร กรุณาลองใหม่",
    SLIP_USED:             "สลิปนี้ถูกใช้งานไปแล้ว",
    SLIP_EXPIRED:          "สลิปหมดอายุ กรุณาโอนเงินใหม่",
    INVALID_SLIP:          "ไม่สามารถอ่านสลิปได้ กรุณาถ่ายภาพให้ชัดและครบทั้งสลิป",
    UNAUTHORIZED:          "Client ID หรือ Secret ไม่ถูกต้อง กรุณาแจ้งแอดมิน",
    QUOTA_EXCEEDED:        "เกิน Quota การตรวจสลิปประจำเดือน กรุณาติดต่อแอดมิน",
    BANK_NOT_SUPPORTED:    "ธนาคารนี้ยังไม่รองรับ กรุณาติดต่อแอดมิน",
  };
  return map[code ?? ""] ?? fallback ?? "ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

/* ── admin: list all topup requests ── */
router.get("/topup-requests", async (req, res) => {
  try {
    res.json(await db.select().from(topupRequests).orderBy(desc(topupRequests.created_at)));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

/* ── admin: approve ── */
router.post("/topup-requests/:id/approve", async (req, res) => {
  try {
    const { amount } = req.body as { amount?: number };
    if (!amount || amount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
    const [r] = await db.select().from(topupRequests).where(eq(topupRequests.id, req.params.id));
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    await db.transaction(async (tx) => {
      await tx.update(topupRequests).set({ status: "approved", amount: Number(amount) }).where(eq(topupRequests.id, req.params.id));
      await tx.update(users).set({
        balance: sql`${users.balance} + ${amount}`,
        total_topup: sql`${users.total_topup} + ${amount}`,
      }).where(eq(users.id, r.user_id));
      await tx.insert(topups).values({
        user_id: r.user_id,
        amount: Number(amount),
        method: r.method === "slip" ? "Slip (แอดมินอนุมัติ)" : "TrueMoney/Angpao",
        status: "success",
      });
    });
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

/* ── admin: reject ── */
router.post("/topup-requests/:id/reject", async (req, res) => {
  try {
    await db.update(topupRequests).set({ status: "rejected" }).where(eq(topupRequests.id, req.params.id));
    res.json({ ok: true });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
