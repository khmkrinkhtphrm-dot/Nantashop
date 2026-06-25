import { pgTable, text, uuid, boolean, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";

export const websiteSettings = pgTable("website_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_name: text("site_name").notNull().default("NantaShop"),
  site_description: text("site_description"),
  announcement: text("announcement"),
  primary_color: text("primary_color"),
  secondary_color: text("secondary_color"),
  logo_url: text("logo_url"),
  background_url: text("background_url"),
  particle_type: text("particle_type").default("none"),
  enable_popup: boolean("enable_popup").default(false),
  popup_title: text("popup_title"),
  popup_content: text("popup_content"),
  popup_image_url: text("popup_image_url"),
  hero_title: text("hero_title"),
  hero_description: text("hero_description"),
  hero_background: text("hero_background"),
  font: text("font"),
  font_color: text("font_color"),
  border_color: text("border_color"),
  enable_loading_screen: boolean("enable_loading_screen").default(false),
  loading_gif_url: text("loading_gif_url"),
  navbar_enable_home: boolean("navbar_enable_home").default(true),
  navbar_enable_products: boolean("navbar_enable_products").default(true),
  navbar_enable_topup: boolean("navbar_enable_topup").default(true),
  social_links: jsonb("social_links"),
  embed_description: text("embed_description"),
  particle_position: text("particle_position").default("background"),
  fake_users_offset: integer("fake_users_offset").notNull().default(0),
  fake_topup_offset: integer("fake_topup_offset").notNull().default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const sliders = pgTable("sliders", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  image_url: text("image_url").notNull(),
  link_url: text("link_url"),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const bankConfigs = pgTable("bank_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  bank_name: text("bank_name").notNull(),
  account_number: text("account_number").notNull(),
  account_name: text("account_name").notNull(),
  bank_code: text("bank_code"),
  qr_code_url: text("qr_code_url"),
  rdcw_client_id: text("rdcw_client_id"),
  rdcw_client_secret: text("rdcw_client_secret"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const walletConfigs = pgTable("wallet_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone_number: text("phone_number").notNull(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  image_url: text("image_url"),
  is_featured: boolean("is_featured").default(false),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  category_id: uuid("category_id"),
  name: text("name").notNull(),
  description: text("description"),
  image_url: text("image_url"),
  real_price: real("real_price").notNull().default(0),
  fake_price: real("fake_price"),
  show_fake_price: boolean("show_fake_price").default(false),
  hot_badge: boolean("hot_badge").default(false),
  is_featured: boolean("is_featured").default(false),
  product_type: text("product_type").default("ได้ของทันที"),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const productStocks = pgTable("product_stocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id").notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id"),
  product_id: uuid("product_id"),
  product_name: text("product_name").notNull(),
  product_image: text("product_image"),
  price_paid: real("price_paid").notNull(),
  delivered_data: text("delivered_data").notNull().default(""),
  created_at: timestamp("created_at").defaultNow(),
});

export const topupRequests = pgTable("topup_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  username: text("username"),
  amount: real("amount").notNull().default(0),
  method: text("method").notNull().default("slip"),
  slip_url: text("slip_url"),
  angpao_url: text("angpao_url"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow(),
});

export const topups = pgTable("topups", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("success"),
  trans_ref: text("trans_ref"),
  created_at: timestamp("created_at").defaultNow(),
});

export const redeemCodes = pgTable("redeem_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  credit_amount: real("credit_amount").notNull(),
  usage_limit: integer("usage_limit").notNull().default(10),
  uses_count: integer("uses_count").notNull().default(0),
  expire_date: timestamp("expire_date"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

export const quickLinks = pgTable("quick_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  image_url: text("image_url"),
  target_page: text("target_page").notNull(),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const news = pgTable("news", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password_hash: text("password_hash"),
  avatar_url: text("avatar_url"),
  balance: real("balance").notNull().default(0),
  total_topup: real("total_topup").notNull().default(0),
  is_admin: boolean("is_admin").default(false),
  created_at: timestamp("created_at").defaultNow(),
});
