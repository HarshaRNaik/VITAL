import { randomBytes, createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { Router, type Response } from "express";
import { prisma } from "../db.js";
import { findAuthenticatedSession, requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/http-error.js";
import { issueCsrfToken } from "../middleware/csrf.js";
import { grantReward } from "../services/game.js";
import { loginSchema, registerSchema } from "../validation.js";
import { config } from "../config.js";

const sessionCookie = "vital_session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

function publicUser(user: { id: string; email: string; name: string; goal: string }) {
  return { id: user.id, email: user.email, name: user.name, goal: user.goal };
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/api",
    maxAge: sessionDurationMs,
  });
}

async function createSession(userId: string, res: Response) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await prisma.authSession.create({ data: { userId, tokenHash, expiresAt } });
  setSessionCookie(res, token);
  return issueCsrfToken(res);
}

function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/api",
  });
}

export const authRouter = Router();

authRouter.get("/csrf", (_req, res) => {
  res.json({ csrfToken: issueCsrfToken(res) });
});

authRouter.get("/session", async (req, res) => {
  const session = await findAuthenticatedSession(req.cookies?.[sessionCookie]);
  if (!session) {
    clearSessionCookie(res);
    return res.json({ user: null });
  }
  res.json({ user: publicUser(session.user) });
});

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new HttpError(409, "EMAIL_IN_USE", "An account with this email already exists.");

  const passwordHash = await hash(input.password, 12);
  let user: { id: string; email: string; name: string; goal: string };
  let game: Awaited<ReturnType<typeof grantReward>>;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          goal: input.goal,
          settings: { create: {} },
          gameState: { create: {} },
        },
        select: { id: true, email: true, name: true, goal: true },
      });
      const initialGame = await grantReward(tx, newUser.id, "register", "register");
      await tx.securityAuditEvent.create({
        data: { userId: newUser.id, action: "account.register", targetType: "user", targetId: newUser.id },
      });
      return { user: newUser, game: initialGame };
    });
    user = created.user;
    game = created.game;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_IN_USE", "An account with this email already exists.");
    }
    throw error;
  }

  const csrfToken = await createSession(user.id, res);
  res.status(201).json({ user: publicUser(user), game, csrfToken });
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const csrfToken = await createSession(user.id, res);
  await prisma.securityAuditEvent.create({
    data: { userId: user.id, action: "account.login", targetType: "session" },
  });
  res.json({ user: publicUser(user), csrfToken });
});

authRouter.post("/logout", requireAuth, async (req, res) => {
  const token = req.cookies?.[sessionCookie];
  if (typeof token === "string") {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { tokenHash, userId: req.user!.id } }),
      prisma.securityAuditEvent.create({
        data: { userId: req.user!.id, action: "account.logout", targetType: "session" },
      }),
    ]);
  }
  clearSessionCookie(res);
  const csrfToken = issueCsrfToken(res);
  res.json({ ok: true, csrfToken });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
