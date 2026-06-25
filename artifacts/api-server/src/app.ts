import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { tokenAuthMiddleware } from "./middlewares/tokenAuth";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

pool.query(`
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
  ) WITH (OIDS=FALSE);
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`).catch((err: unknown) => logger.error(err, "Failed to create session table"));

const PgSession = connectPgSimple(session);

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET ?? "changeme-dev-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: "sid",
    cookie: {
      maxAge: TWENTY_FOUR_HOURS,
      httpOnly: true,
      sameSite: "none",
      secure: true,
    },
  }),
);

app.use(tokenAuthMiddleware);

app.use("/api", router);

// Serve static frontend files in production
if (process.env.NODE_ENV === "production") {
  const publicPath = path.resolve(__dirname, "../../game-shop/dist/public");
  app.use(express.static(publicPath));
  
  // Handle SPA routing: serve index.html for any unknown routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

export default app;
