import type { Prisma } from "../generated/prisma/client.js";

export const REWARDS = {
  register: 50,
  meal: 10,
  workout: 25,
  exercise: 10,
  weight: 15,
  chat: 5,
} as const;

const BADGES = [
  { id: "welcome", test: (counts: Record<string, number>, _streak: number) => (counts.register ?? 0) >= 1 },
  { id: "first-meal", test: (counts: Record<string, number>, _streak: number) => (counts.meal ?? 0) >= 1 },
  { id: "first-workout", test: (counts: Record<string, number>, _streak: number) => (counts.workout ?? 0) >= 1 },
  { id: "ten-meals", test: (counts: Record<string, number>, _streak: number) => (counts.meal ?? 0) >= 10 },
  { id: "ten-workouts", test: (counts: Record<string, number>, _streak: number) => (counts.workout ?? 0) >= 10 },
  { id: "chatty", test: (counts: Record<string, number>, _streak: number) => (counts.chat ?? 0) >= 1 },
  { id: "streak3", test: (_counts: Record<string, number>, streak: number) => streak >= 3 },
  { id: "streak7", test: (_counts: Record<string, number>, streak: number) => streak >= 7 },
];

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function jsonCounts(value: Prisma.JsonValue | undefined): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number") counts[key] = count;
  }
  return counts;
}

export async function readGameState(tx: Prisma.TransactionClient, userId: string) {
  const [state, settings] = await Promise.all([
    tx.gameState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    tx.userSettings.findUnique({ where: { userId }, select: { timeZone: true } }),
  ]);
  const activityDate = dateKeyInTimeZone(new Date(), settings?.timeZone || "UTC");
  const chatReward = await tx.gameReward.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: `chat:${activityDate}` } },
    select: { id: true },
  });
  return {
    totalXP: state.totalXP,
    streak: state.streak,
    lastActive: state.lastActive ? toDateKey(state.lastActive) : null,
    counts: jsonCounts(state.counts),
    badges: state.badges,
    chatToday: Boolean(chatReward),
  };
}

export async function grantReward(
  tx: Prisma.TransactionClient,
  userId: string,
  type: keyof typeof REWARDS,
  idempotencyKey: string,
) {
  const inserted = await tx.gameReward.createMany({
    data: [{ userId, type, amount: REWARDS[type], idempotencyKey }],
    skipDuplicates: true,
  });

  if (inserted.count === 0) return readGameState(tx, userId);

  const [current, settings] = await Promise.all([
    tx.gameState.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    tx.userSettings.findUnique({ where: { userId }, select: { timeZone: true } }),
  ]);
  const today = dateKeyInTimeZone(new Date(), settings?.timeZone || "UTC");
  const previousDate = new Date(`${today}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousDay = toDateKey(previousDate);
  const priorDate = current.lastActive ? toDateKey(current.lastActive) : null;
  const streak = priorDate === today
    ? current.streak
    : priorDate === previousDay
      ? current.streak + 1
      : 1;
  const counts = jsonCounts(current.counts);
  counts[type] = (counts[type] ?? 0) + 1;
  const badges = new Set(current.badges);
  for (const badge of BADGES) {
    if (badge.test(counts, streak)) badges.add(badge.id);
  }

  await tx.gameState.update({
    where: { userId },
    data: {
      totalXP: { increment: REWARDS[type] },
      streak,
      lastActive: new Date(`${today}T00:00:00.000Z`),
      counts,
      badges: [...badges],
    },
  });

  return readGameState(tx, userId);
}
