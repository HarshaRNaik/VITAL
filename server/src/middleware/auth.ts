import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { prisma } from "../db.js";
import { HttpError } from "./http-error.js";

export async function findAuthenticatedSession(token: unknown) {
  if (typeof token !== "string" || token.length < 32) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true, goal: true } } },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } });
    return null;
  }
  return session;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.vital_session;

  if (typeof token !== "string" || token.length < 32) return next(new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue."));
  const session = await findAuthenticatedSession(token);
  if (!session) return next(new HttpError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again."));

  req.user = session.user;
  next();
};
