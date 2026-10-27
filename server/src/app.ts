import { randomUUID } from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler } from "./middleware/error-handler.js";
import { HttpError } from "./middleware/http-error.js";
import { activityRouter } from "./routes/activity.js";
import { assistantRouter } from "./routes/assistant.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

export const app = express();

if (config.TRUST_PROXY) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
}));
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || config.appOrigins.has(origin));
  },
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));
app.use(express.json({ limit: "256kb", strict: true }));
app.use(cookieParser());
app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } },
}));
app.use("/api", csrfProtection);

app.get("/api/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/ready", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ready" });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "AUTH_RATE_LIMITED", message: "Too many account requests. Try again later." } },
});

app.use("/api/auth/register", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRouter);
app.use("/api", usersRouter);
app.use("/api", activityRouter);
app.use("/api", assistantRouter);
app.use("/api", (_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "The requested API resource was not found.")));
app.use(errorHandler);
