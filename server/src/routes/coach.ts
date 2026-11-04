import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { coachConfig } from "../coach-config.js";
import { HttpError } from "../middleware/http-error.js";

type CoachRequest = { id: string; accessToken: string };
const replySchema = z.object({ content: z.string().trim().min(1).max(500) }).strict();
const api = Router();
const noExerciseSourceText = "I couldn't retrieve a matching exercise entry from the VITAL FITNESS dataset, so I can't verify the exercise ID, instructions, or equipment right now. Please try again later or ask about another exercise.";
const datasetDetailRequest = /\b(dataset|exercise\s+id|exercise\s+instructions|instructions?\s+for|equipment\s+(?:required|for)|which\s+exercises?|what\s+exercise|exercises?\s+(?:for|target)|how\s+to\s+perform|how\s+do\s+i\s+do)\b/i;
const coachSystemInstruction = [
  "You are VITAL Coach, an evidence-conscious fitness coach.",
  "Use the File Search exercise dataset for exercise names, IDs, instructions, equipment, body parts, categories, targets, and muscle groups. Prefer retrieved dataset information for these details.",
  "Never invent exercise IDs, instructions, equipment, or dataset entries. If a matching entry is not retrieved, say you could not verify it from the dataset; ask for the exercise name or missing details when needed.",
  "Clearly distinguish information retrieved from the exercise dataset from general fitness knowledge. Do not present general knowledge as a dataset fact.",
  "Use the authenticated user's supplied Supabase context only for that user's personal workout history, progress, goals, and profile. Never infer private information from another user or from the shared exercise dataset.",
  "Do not diagnose, prescribe treatment, or give unsupported medical or nutritional advice. State uncertainty and ask a concise clarifying question when needed.",
  "Never invent personal activity or measurements. If personal records do not answer a question, say so. Keep replies concise and friendly.",
].join(" ");

function hasExerciseDatasetRetrieval(result: { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ retrievedContext?: { fileSearchStore?: string } }> } }> }, storeName: string): boolean {
  return (result.candidates ?? []).some((candidate) =>
    (candidate.groundingMetadata?.groundingChunks ?? []).some((chunk) => {
      const context = chunk.retrievedContext;
      return Boolean(context && (!context.fileSearchStore || context.fileSearchStore === storeName));
    }),
  );
}

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
  if (!coachConfig.GEMINI_API_KEY || !coachConfig.GEMINI_MODEL || !coachConfig.GEMINI_FILE_SEARCH_STORE) {
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
        systemInstruction: coachSystemInstruction,
        tools: [{ fileSearch: { fileSearchStoreNames: [coachConfig.GEMINI_FILE_SEARCH_STORE], topK: 5 } }],
        maxOutputTokens: 500,
      },
    });
    const retrievedExerciseContext = hasExerciseDatasetRetrieval(result, coachConfig.GEMINI_FILE_SEARCH_STORE);
    let text = datasetDetailRequest.test(parsed.data.content) && !retrievedExerciseContext
      ? noExerciseSourceText
      : result.text?.trim();
    if (!text) throw new Error("Empty Gemini response");
    const citations = [...new Map((result.candidates ?? [])
      .flatMap((candidate) => candidate.groundingMetadata?.groundingChunks ?? [])
      .filter((chunk) => chunk.retrievedContext
        && (!chunk.retrievedContext.fileSearchStore || chunk.retrievedContext.fileSearchStore === coachConfig.GEMINI_FILE_SEARCH_STORE))
      .map((chunk) => chunk.retrievedContext!)
      .map((context) => [context.uri || context.title || context.text || "", context] as const)
      .filter(([key]) => key))]
      .map(([, context]) => context)
      .slice(0, 5);
    if (citations.length && text !== noExerciseSourceText) {
      text += `\n\nSources:\n${citations.map((source, index) => {
        const uri = source.uri && /^https:\/\//i.test(source.uri) ? ` (${source.uri})` : "";
        return `${index + 1}. ${source.title?.trim() || "Exercise dataset"}${uri}`;
      }).join("\n")}`;
    }
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
