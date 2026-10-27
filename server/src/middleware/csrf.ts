import { randomBytes, timingSafeEqual } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { config } from "../config.js";
import { HttpError } from "./http-error.js";

const csrfCookie = "vital_csrf";

export function issueCsrfToken(res: Response) {
  const token = randomBytes(32).toString("base64url");
  res.cookie(csrfCookie, token, {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/api",
    maxAge: 24 * 60 * 60 * 1000,
  });
  return token;
}

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !config.appOrigins.has(origin)) {
    return next(new HttpError(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed."));
  }

  const cookieToken = req.cookies?.[csrfCookie];
  const headerToken = req.get("x-csrf-token");
  if (
    typeof cookieToken !== "string"
    || typeof headerToken !== "string"
    || cookieToken.length !== headerToken.length
    || !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return next(new HttpError(403, "CSRF_INVALID", "Your security token is missing or expired. Refresh and try again."));
  }

  next();
};
