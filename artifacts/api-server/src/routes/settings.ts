import { Router } from "express";
import { db, websiteSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getOrCreate() {
  const rows = await db.select().from(websiteSettings).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(websiteSettings).values({ site_name: "NantaShop" }).returning();
  return inserted[0];
}

router.get("/settings", async (req, res) => {
  try {
    const row = await getOrCreate();
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

const ALLOWED_SETTINGS_FIELDS = new Set([
  "site_name", "site_description", "announcement", "primary_color",
  "secondary_color", "logo_url", "background_url", "particle_type",
  "particle_position", "enable_popup", "popup_title", "popup_content",
  "popup_image_url", "hero_title", "hero_description", "hero_background",
  "font", "font_color", "border_color", "enable_loading_screen",
  "loading_gif_url", "navbar_enable_home", "navbar_enable_products",
  "navbar_enable_topup", "social_links", "embed_description",
  "fake_users_offset", "fake_topup_offset",
]);

router.patch("/settings", async (req, res) => {
  try {
    const row = await getOrCreate();
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(req.body)) {
      if (ALLOWED_SETTINGS_FIELDS.has(key)) filtered[key] = req.body[key];
    }
    if (Object.keys(filtered).length === 0) {
      res.status(400).json({ error: "No valid fields to update" }); return;
    }
    const updated = await db
      .update(websiteSettings)
      .set(filtered)
      .where(eq(websiteSettings.id, row.id))
      .returning();
    res.json(updated[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
