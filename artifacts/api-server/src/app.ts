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
  
  // Debug: Log the path being used
  logger.info({ publicPath }, "Serving static files from");
  
  app.use(express.static(publicPath));
  
  // Handle SPA routing: serve index.html for any unknown routes
  // Express 5: using '*' or a named parameter like ':path*' is more standard
  app.get("*", (req, res) => {
    const indexPath = path.join(publicPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        // Only log error if it's not a 'file not found' for common assets
        if (!req.url.includes('.')) {
          logger.error({ err, path: indexPath }, "Failed to serve index.html");
        }
        res.status(404).send("Frontend assets not found. Please ensure the build command is correct.");
      }
    });
  });
}

export default app;
