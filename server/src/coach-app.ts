import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { coachConfig } from "./coach-config.js";
import { coachRouter } from "./routes/coach.js";
import { errorHandler } from "./middleware/error-handler.js";
import { HttpError } from "./middleware/http-error.js";

export const coachApp = express();
coachApp.set("trust proxy", 1);
coachApp.disable("x-powered-by");
coachApp.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
coachApp.use(helmet());
coachApp.use(cors({
  origin(origin, callback) {
    callback(null, !origin || coachConfig.appOrigins.has(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600,
}));
coachApp.use(express.json({ limit: "12kb", strict: true }));
coachApp.use(rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } },
}));
coachApp.get("/health", (_req, res) => res.json({ status: "ok" }));
coachApp.use("/api/coach", coachRouter);
coachApp.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "The requested API resource was not found.")));
coachApp.use(errorHandler);
