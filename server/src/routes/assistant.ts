import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/http-error.js";
import { dateKeyInTimeZone, grantReward, readGameState } from "../services/game.js";
import { assistantMessageSchema, paginationSchema } from "../validation.js";

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function currentDateInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function offsetDay(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function idempotencyKey(req: { get: (name: string) => string | undefined }) {
  const key = req.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 100) {
    throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
  }
  return key;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function requireConversationId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }
  return value;
}

async function assistantReply(userId: string, question: string) {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const today = currentDateInZone(settings?.timeZone || "UTC");
  const from = offsetDay(today, -6);
  const [meals, workouts, metrics] = await Promise.all([
    prisma.meal.findMany({ where: { userId, date: { gte: from } }, select: { date: true, calories: true, protein: true } }),
    prisma.workout.findMany({ where: { userId, date: { gte: from } }, select: { calories: true } }),
    prisma.progressMetric.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, weightKg: true } }),
  ]);
  const text = question.toLowerCase();

  if (text.includes("suggest") || text.includes("recommend")) {
    if (text.includes("workout") || text.includes("exercise")) {
      return workouts.length < 3
        ? `You've completed ${workouts.length} workout(s) this week. Consider a comfortable walk or a bodyweight routine from your workout library.`
        : `Great consistency with ${workouts.length} workouts this week. Consider a gentle mobility or recovery session.`;
    }
    const loggedDays = Math.max(1, new Set(meals.map((meal) => dateOnly(meal.date))).size);
    const averageProtein = meals.reduce((total, meal) => total + meal.protein, 0) / loggedDays;
    return averageProtein < 60
      ? `Your protein averages about ${Math.round(averageProtein)}g on days with meal logs. Consider adding a protein source that fits your preferences.`
      : `Your logged protein is averaging about ${Math.round(averageProtein)}g per logged day. A balanced meal can help you maintain that pattern.`;
  }

  if (text.includes("calorie")) {
    if (!meals.length) return "You haven't logged any meals in the last 7 days.";
    const total = meals.reduce((sum, meal) => sum + meal.calories, 0);
    return `You logged ${Math.round(total)} kcal over the last 7 days (about ${Math.round(total / 7)} per day).`;
  }

  if (text.includes("workout") || text.includes("exercise")) {
    if (!workouts.length) return "No workouts are logged in the last 7 days. Choose a session from your workout library when you're ready.";
    return `You logged ${workouts.length} workout(s) in the last 7 days. Calories are shown only when you entered or estimated them.`;
  }

  if (text.includes("weight") || text.includes("progress")) {
    if (metrics.length < 2) return "Log your weight at least twice and I can summarize the recorded change.";
    const first = metrics[0]!;
    const last = metrics.at(-1)!;
    const difference = (last.weightKg - first.weightKg).toFixed(1);
    return `Your recorded weight changed by ${difference} kg from ${dateOnly(first.date)} to ${dateOnly(last.date)} (latest: ${last.weightKg} kg).`;
  }

  return "Try asking about your logged calories, workouts, weight progress, or ask for a workout or meal suggestion.";
}

export const assistantRouter = Router();
assistantRouter.use(requireAuth);
const userRateLimit = (limit: number) => rateLimit({
  windowMs: 60_000,
  limit,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many assistant requests. Please try again shortly." } },
});

assistantRouter.get("/assistant/conversations", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.assistantConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.assistantConversation.count({ where }),
  ]);
  res.json({
    items: items.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessage: messages[0] ?? null,
    })),
    total,
    limit,
    offset,
  });
});

assistantRouter.post("/assistant/conversations", userRateLimit(10), async (req, res) => {
  const conversation = await prisma.assistantConversation.create({
    data: { userId: req.user!.id, title: "New conversation" },
  });
  res.status(201).json({ item: conversation });
});

assistantRouter.get("/assistant/conversations/:id", async (req, res) => {
  const conversationId = requireConversationId(req.params.id);
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId: req.user!.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  res.json({ item: conversation });
});

assistantRouter.post("/assistant/conversations/:id/messages", userRateLimit(12), async (req, res) => {
  const { content } = assistantMessageSchema.parse(req.body);
  const key = idempotencyKey(req);
  const conversationId = requireConversationId(req.params.id);
  const owned = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId: req.user!.id },
    select: { id: true, title: true },
  });
  if (!owned) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  const existing = await prisma.assistantMessage.findFirst({
    where: { conversationId: owned.id, clientRequestId: key, role: "user" },
  });
  if (existing) {
    const assistantMessage = await prisma.assistantMessage.findFirst({
      where: { conversationId: owned.id, clientRequestId: key, role: "assistant" },
    });
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    return res.json({ userMessage: existing, assistantMessage, game, duplicate: true });
  }
  const response = await assistantReply(req.user!.id, content);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const userMessage = await tx.assistantMessage.create({
        data: { conversationId: owned.id, clientRequestId: key, role: "user", content },
      });
      const assistantMessage = await tx.assistantMessage.create({
        data: { conversationId: owned.id, clientRequestId: key, role: "assistant", content: response },
      });
      await tx.assistantConversation.update({
        where: { id: owned.id },
        data: {
          updatedAt: new Date(),
          ...(owned.title === "New conversation" ? { title: content.slice(0, 120) } : {}),
        },
      });
      const settings = await tx.userSettings.findUnique({ where: { userId: req.user!.id }, select: { timeZone: true } });
      const activityDate = dateKeyInTimeZone(new Date(), settings?.timeZone || "UTC");
      const game = await grantReward(tx, req.user!.id, "chat", `chat:${activityDate}`);
      return { userMessage, assistantMessage, game };
    });
    res.status(201).json({ ...result, duplicate: false });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId: owned.id, clientRequestId: key },
      orderBy: { role: "asc" },
    });
    const userMessage = messages.find((message) => message.role === "user");
    const assistantMessage = messages.find((message) => message.role === "assistant");
    if (!userMessage || !assistantMessage) throw error;
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    res.json({ userMessage, assistantMessage, game, duplicate: true });
  }
});

assistantRouter.delete("/assistant/conversations/:id", async (req, res) => {
  const conversationId = requireConversationId(req.params.id);
  const deleted = await prisma.assistantConversation.deleteMany({
    where: { id: conversationId, userId: req.user!.id },
  });
  if (deleted.count === 0) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  await prisma.securityAuditEvent.create({
    data: { userId: req.user!.id, action: "assistant-conversation.delete", targetType: "assistant-conversation", targetId: conversationId },
  });
  res.status(204).end();
});
