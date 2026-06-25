import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  console.error("Critical: DATABASE_URL, DB_URL, or POSTGRES_URL is not set.");
}

export const pool = new Pool({ 
  connectionString: databaseUrl,
  // Add some resilience for connection issues
  connectionTimeoutMillis: 5000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
