import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { coachConfig } from "../coach-config.js";
import { HttpError } from "../middleware/http-error.js";

type CoachRequest = { id: string; accessToken: string };
const replySchema = z.object({ content: z.string().trim().min(1).max(500) }).strict();
const api = Router();

async function authenticateSupabase(token: string): Promise<string> {
  if (!coachConfig.SUPABASE_URL || !coachConfig.SUPABASE_ANON_KEY) {
    throw new HttpError(503, "COACH_NOT_CONFIGURED", "The Coach service is not configured yet.");
  }
  let response: Response;
  try {
    response = await fetch(`${coachConfig.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: coachConfig.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE", "Sign-in could not be verified. Please try again.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to use the Coach.");
  }
  if (!response.ok) throw new HttpError(503, "AUTH_SERVICE_UNAVAILABLE", "Sign-in could not be verified. Please try again.");
  const user: unknown = await response.json();
  if (typeof user !== "object" || user === null || !("id" in user) || typeof user.id !== "string") {
    throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to use the Coach.");
  }
  return user.id;
}

async function coachAuth(req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(authorization);
  if (!match) return next(new HttpError(401, "UNAUTHENTICATED", "Please sign in to use the Coach."));
  try {
    const id = await authenticateSupabase(match[1]!);
    (req as typeof req & { coachUser?: CoachRequest }).coachUser = { id, accessToken: match[1]! };
    next();
  } catch (error) {
    next(error);
  }
}

async function readUserContext(token: string) {
  const base = coachConfig.SUPABASE_URL!;
  const headers = { apikey: coachConfig.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` };
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${base}/rest/v1/${path}`, { headers, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    return response.json() as Promise<T>;
  };

  const [profileRows, settings, goals, conversations] = await Promise.all([
    get<Array<{ goal: string }>>("profiles?select=goal&limit=1"),
    get<Array<{ time_zone: string; workout_preference: string }>>("user_settings?select=time_zone,workout_preference&limit=1"),
    get<Array<{ name: string; metric: string; target_value: number; unit: string; deadline: string | null }>>("fitness_goals?select=name,metric,target_value,unit,deadline&completed_at=is.null&order=updated_at.desc&limit=5"),
    get<Array<{ id: string }>>("assistant_conversations?select=id&order=updated_at.desc&limit=1"),
  ]);
  const timeZone = settings[0]?.time_zone || "UTC";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 6);
  const fromDate = from.toISOString().slice(0, 10);
  const query = (select: string) => new URLSearchParams({ select, date: `gte.${fromDate}`, order: "date.desc", limit: "10" }).toString();
  const [workouts, meals, metrics] = await Promise.all([
    get<Array<{ name: string; type: string; date: string; duration: number; calories: number }>>(`workouts?${query("name,type,date,duration,calories")}`),
    get<Array<{ name: string; type: string; date: string; calories: number; protein: number }>>(`nutrition_logs?${query("name,type,date,calories,protein")}`),
    get<Array<{ date: string; weight_kg: number }>>("progress_metrics?select=date,weight_kg&order=date.desc&limit=10"),
  ]);
  const conversationId = conversations[0]?.id;
  const messages = conversationId
    ? await get<Array<{ role: "user" | "assistant"; content: string }>>(`assistant_messages?${new URLSearchParams({ select: "role,content", conversation_id: `eq.${conversationId}`, order: "created_at.desc", limit: "6" })}`)
    : [];

  return {
    fitnessGoal: profileRows[0]?.goal || "",
    goals: goals.map(({ name, metric, target_value, unit, deadline }) => ({ name, metric, target: target_value, unit, deadline })),
    workoutPreference: settings[0]?.workout_preference || "",
    timeZone,
    workouts,
    meals,
    metrics,
    recentCoachMessages: messages.reverse().map(({ role, content }) => ({ role, content: content.slice(0, 500) })),
  };
}

const userLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  keyGenerator: (req) => (req as typeof req & { coachUser?: CoachRequest }).coachUser!.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "COACH_RATE_LIMITED", message: "Coach is busy. Please wait a moment and try again." } },
});

api.post("/reply", coachAuth, userLimiter, async (req, res, next) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return next(new HttpError(400, "VALIDATION_ERROR", "Enter a message of 1 to 500 characters."));
  if (!coachConfig.GEMINI_API_KEY || !coachConfig.GEMINI_MODEL) {
    return next(new HttpError(503, "COACH_NOT_CONFIGURED", "The Coach service is not configured yet."));
  }

  const request = (req as typeof req & { coachUser: CoachRequest }).coachUser;
  try {
    const context = await readUserContext(request.accessToken);
    const ai = new GoogleGenAI({ apiKey: coachConfig.GEMINI_API_KEY, httpOptions: { timeout: 25_000 } });
    const result = await ai.models.generateContent({
      model: coachConfig.GEMINI_MODEL,
      contents: `Authenticated user request: ${parsed.data.content}\n\nRelevant fitness context belonging only to this user (timezone ${context.timeZone}):\n${JSON.stringify(context)}`,
      config: {
        systemInstruction: "You are VITAL Coach, a practical fitness and nutrition assistant. Use only the user's supplied recent records for personal statistics. Never invent activity or measurements. Give general, cautious fitness guidance; do not diagnose or prescribe treatment. If records do not answer a personal question, say so. Keep replies concise and friendly.",
        temperature: 0.5,
        maxOutputTokens: 500,
      },
    });
    const text = result.text?.trim();
    if (!text) throw new Error("Empty Gemini response");
    res.json({ text });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    console.error(`[request ${req.requestId}] Coach provider failure (${String(status || code || "service-error")})`);
    if (status === 429 || code === "RESOURCE_EXHAUSTED") {
      return next(new HttpError(429, "GEMINI_QUOTA_EXHAUSTED", "The Coach has reached its current AI limit. Please try again later."));
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return next(new HttpError(504, "GEMINI_TIMEOUT", "The Coach took too long to respond. Please try again."));
    }
    if (error instanceof Error && error.message.startsWith("Supabase returned")) {
      return next(new HttpError(503, "COACH_DATA_UNAVAILABLE", "Your recent activity could not be loaded. Please try again later."));
    }
    next(new HttpError(502, "GEMINI_UNAVAILABLE", "The Coach is temporarily unavailable. Please try again."));
  }
});

export const coachRouter = api;
