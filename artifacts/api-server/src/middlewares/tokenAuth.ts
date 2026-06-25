import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

export async function tokenAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.session?.userId) {
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return next();
  }

  const token = auth.slice(7).trim();
  if (!token) return next();

  try {
    const result = await pool.query<{ sess: { userId?: string } }>(
      `SELECT sess FROM session WHERE sid = $1 AND expire > NOW()`,
      [token]
    );
    if (result.rows.length > 0) {
      const userId = result.rows[0].sess?.userId;
      if (userId) {
        req.session.userId = userId;
      }
    }
  } catch {
    // Fail silently — auth check will reject below if needed
  }

  next();
}
