import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => {
  const delegate = () => ({
    findMany: vi.fn(async (_args?: unknown) => []),
    findFirst: vi.fn(async (_args?: unknown) => null),
    findUnique: vi.fn(async (_args?: unknown) => null),
    count: vi.fn(async (_args?: unknown) => 0),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "created-record",
      ...data,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    })),
    createMany: vi.fn(async (_args?: unknown) => ({ count: 0 })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "updated-record", ...data })),
    updateMany: vi.fn(async (_args?: unknown) => ({ count: 0 })),
    deleteMany: vi.fn(async (_args?: unknown) => ({ count: 0 })),
    upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: "upserted-record", ...create })),
  });

  const db: Record<string, any> = {
    authSession: delegate(),
    assistantConversation: delegate(),
    assistantMessage: delegate(),
    exercise: delegate(),
    fitnessGoal: delegate(),
    gameReward: delegate(),
    gameState: delegate(),
    legacyImport: delegate(),
    meal: delegate(),
    progressMetric: delegate(),
    securityAuditEvent: delegate(),
    user: delegate(),
    userSettings: delegate(),
    workout: delegate(),
    workoutPlan: delegate(),
  };
  db.$transaction = vi.fn(async (operation: ((tx: typeof db) => unknown) | unknown[]) => (
    typeof operation === "function" ? operation(db) : Promise.all(operation)
  ));
  return db;
});

vi.mock("../src/db.js", () => ({ prisma }));

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test-placeholder:test-placeholder@127.0.0.1:5432/vital_fitness_test";

const { app } = await import("../src/app.js");
const authenticatedUser = {
  id: "user-1",
  email: "runner@example.test",
  name: "Runner",
  goal: "Strength",
};
const sessionCookieToken = "s".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.$transaction.mockImplementation(async (operation: ((tx: typeof prisma) => unknown) | unknown[]) => (
    typeof operation === "function" ? operation(prisma) : Promise.all(operation)
  ));
  prisma.authSession.findUnique.mockResolvedValue({
    id: "session-1",
    userId: authenticatedUser.id,
    expiresAt: new Date(Date.now() + 60_000),
    user: authenticatedUser,
  });
  prisma.userSettings.findUnique.mockResolvedValue(null);
  prisma.gameReward.findUnique.mockResolvedValue(null);
  prisma.gameState.upsert.mockResolvedValue({
    id: "game-1",
    userId: authenticatedUser.id,
    totalXP: 0,
    streak: 0,
    lastActive: null,
    counts: {},
    badges: [],
  });
  prisma.gameReward.createMany.mockResolvedValue({ count: 0 });
  prisma.gameState.update.mockResolvedValue({});
});

async function getApiClient() {
  const client = request.agent(app);
  const csrfResponse = await client.get("/api/auth/csrf").expect(200);
  const csrfToken = csrfResponse.body.csrfToken as string;
  const cookie = `vital_session=${sessionCookieToken}; vital_csrf=${csrfToken}`;
  return { client, csrfToken, cookie };
}

describe("persistent API", () => {
  it("requires an authenticated session for user-owned records", async () => {
    await request(app).get("/api/workouts").expect(401);
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it("rejects invalid meal payloads before writing", async () => {
    const { client, csrfToken, cookie } = await getApiClient();

    const response = await client
      .post("/api/nutrition")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", "meal-request-001")
      .send({ name: "", calories: -1 })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it("lists workouts scoped to the authenticated account", async () => {
    const date = new Date("2026-01-02T00:00:00.000Z");
    prisma.workout.findMany.mockResolvedValueOnce([{
      id: "workout-1",
      userId: authenticatedUser.id,
      date,
      sets: [],
    }]);
    prisma.workout.count.mockResolvedValueOnce(1);
    const { client, cookie } = await getApiClient();

    const response = await client
      .get("/api/workouts")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.items[0].date).toBe("2026-01-02");
    expect(prisma.workout.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: authenticatedUser.id },
    }));
    expect(prisma.workout.count).toHaveBeenCalledWith({ where: { userId: authenticatedUser.id } });
  });

  it("persists nutrition records and awards one idempotent reward", async () => {
    const persistedMeal = {
      id: "meal-1",
      userId: authenticatedUser.id,
      name: "Oats",
      type: "Breakfast",
      quantity: 1,
      quantityUnit: "serving",
      calories: 300,
      protein: 12,
      carbs: 45,
      fat: 6,
      nutritionEstimated: false,
      date: new Date("2026-01-02T00:00:00.000Z"),
    };
    prisma.meal.findFirst.mockResolvedValueOnce(null);
    prisma.meal.create.mockResolvedValueOnce(persistedMeal);
    prisma.gameReward.createMany.mockResolvedValueOnce({ count: 1 });
    prisma.gameState.upsert
      .mockResolvedValueOnce({ totalXP: 0, streak: 0, lastActive: null, counts: {}, badges: [] })
      .mockResolvedValueOnce({ totalXP: 10, streak: 1, lastActive: new Date("2026-01-02T00:00:00.000Z"), counts: { meal: 1 }, badges: ["first-meal"] });
    const { client, csrfToken, cookie } = await getApiClient();

    const response = await client
      .post("/api/nutrition")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", "meal-request-002")
      .send({
        name: "Oats",
        type: "Breakfast",
        calories: 300,
        date: "2026-01-02",
      })
      .expect(201);

    expect(response.body.item.id).toBe("meal-1");
    expect(response.body.duplicate).toBe(false);
    expect(prisma.meal.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: authenticatedUser.id,
        clientRequestId: "meal-request-002",
        name: "Oats",
      }),
    }));
    expect(prisma.gameReward.createMany).toHaveBeenCalledTimes(1);
  });

  it("returns an existing meal for a repeated idempotency key without writing again", async () => {
    const existing = {
      id: "meal-existing",
      userId: authenticatedUser.id,
      name: "Yogurt",
      type: "Snack",
      date: new Date("2026-01-03T00:00:00.000Z"),
    };
    prisma.meal.findFirst.mockResolvedValueOnce(existing);
    const { client, csrfToken, cookie } = await getApiClient();

    const response = await client
      .post("/api/nutrition")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", "meal-request-003")
      .send({ name: "Yogurt", type: "Snack", calories: 140, date: "2026-01-03" })
      .expect(200);

    expect(response.body.item.id).toBe("meal-existing");
    expect(response.body.duplicate).toBe(true);
    expect(prisma.meal.create).not.toHaveBeenCalled();
    expect(prisma.gameReward.createMany).not.toHaveBeenCalled();
  });

  it("replaces performed sets through an ownership-checked workout update", async () => {
    prisma.exercise.count.mockResolvedValueOnce(1);
    prisma.workout.findFirst.mockResolvedValueOnce({ id: "workout-owned" });
    prisma.workout.update.mockResolvedValueOnce({
      id: "workout-owned",
      userId: authenticatedUser.id,
      date: new Date("2026-01-04T00:00:00.000Z"),
      sets: [],
    });
    const { client, csrfToken, cookie } = await getApiClient();

    await client
      .patch("/api/workouts/workout-owned")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({
        performedSets: [{
          exerciseId: "squat",
          exerciseSequence: 0,
          exerciseName: "Squat",
          setNumber: 1,
          reps: 8,
          weightKg: 25,
          restSeconds: 60,
        }],
      })
      .expect(200);

    expect(prisma.workout.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "workout-owned", userId: authenticatedUser.id },
    }));
    expect(prisma.workout.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sets: expect.objectContaining({
          deleteMany: {},
          create: [expect.objectContaining({ exerciseName: "Squat", setNumber: 1 })],
        }),
      }),
    }));
  });

  it("rejects attaching another account's workout plan", async () => {
    prisma.workoutPlan.findFirst.mockResolvedValueOnce(null);
    const { client, csrfToken, cookie } = await getApiClient();

    const response = await client
      .post("/api/workouts")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Idempotency-Key", "workout-request-001")
      .send({
        type: "Strength",
        name: "Lower body",
        duration: 30,
        date: "2026-01-05",
        customPlanId: "c89e2d70-2982-4bcb-9e4f-245343cc69c3",
      })
      .expect(404);

    expect(response.body.error.code).toBe("PLAN_NOT_FOUND");
    expect(prisma.workoutPlan.findFirst).toHaveBeenCalledWith({
      where: {
        id: "c89e2d70-2982-4bcb-9e4f-245343cc69c3",
        userId: authenticatedUser.id,
      },
      select: { id: true },
    });
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });

  it("allows a user to clear a goal deadline", async () => {
    prisma.fitnessGoal.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.fitnessGoal.findFirst.mockResolvedValueOnce({
      id: "goal-1",
      userId: authenticatedUser.id,
      deadline: null,
    });
    const { client, csrfToken, cookie } = await getApiClient();

    await client
      .patch("/api/progress/goals/goal-1")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({ deadline: null })
      .expect(200);

    expect(prisma.fitnessGoal.updateMany).toHaveBeenCalledWith({
      where: { id: "goal-1", userId: authenticatedUser.id },
      data: { deadline: null },
    });
  });

  it("does not delete another account's workout", async () => {
    prisma.workout.deleteMany.mockResolvedValueOnce({ count: 0 });
    const { client, csrfToken, cookie } = await getApiClient();

    const response = await client
      .delete("/api/workouts/foreign-workout")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .expect(404);

    expect(response.body.error.code).toBe("WORKOUT_NOT_FOUND");
    expect(prisma.workout.deleteMany).toHaveBeenCalledWith({
      where: { id: "foreign-workout", userId: authenticatedUser.id },
    });
  });
});
