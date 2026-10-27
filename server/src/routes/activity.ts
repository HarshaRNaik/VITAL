import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/http-error.js";
import { dateKeyInTimeZone, grantReward, readGameState } from "../services/game.js";
import { dateOnly, fitnessGoalSchema, legacyImportSchema, mealSchema, metricSchema, paginationSchema, rewardSchema, workoutSchema, workoutUpdateSchema } from "../validation.js";

function dateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function serializeWorkout<T extends { date: Date }>(item: T) {
  return { ...item, date: dateString(item.date) };
}

function serializeMeal<T extends { date: Date }>(item: T) {
  return { ...item, date: dateString(item.date) };
}

function serializeMetric<T extends { date: Date; weightKg: number }>(item: T) {
  const { weightKg, ...rest } = item;
  return { ...rest, weight: weightKg, date: dateString(item.date) };
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

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get("/workouts", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [records, total] = await Promise.all([
    prisma.workout.findMany({ where, include: { sets: { orderBy: [{ exerciseSequence: "asc" }, { setNumber: "asc" }] } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit, skip: offset }),
    prisma.workout.count({ where }),
  ]);
  res.json({ items: records.map(serializeWorkout), total, limit, offset });
});

activityRouter.post("/workouts", async (req, res) => {
  const input = workoutSchema.parse(req.body);
  const key = idempotencyKey(req);
  if (input.customPlanId) {
    const plan = await prisma.workoutPlan.findFirst({
      where: { id: input.customPlanId, userId: req.user!.id },
      select: { id: true },
    });
    if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Workout plan not found.");
  }
  const exerciseIds = [...new Set(input.performedSets.flatMap((set) => set.exerciseId ? [set.exerciseId] : []))];
  if (exerciseIds.length && await prisma.exercise.count({ where: { id: { in: exerciseIds } } }) !== exerciseIds.length) {
    throw new HttpError(400, "UNKNOWN_EXERCISE", "One or more performed exercises are not in the catalogue.");
  }
  const existing = await prisma.workout.findFirst({
    where: {
      userId: req.user!.id,
      OR: [
        { clientRequestId: key },
        ...(input.sessionId ? [{ sessionId: input.sessionId }] : []),
      ],
    },
    include: { sets: { orderBy: [{ exerciseName: "asc" }, { setNumber: "asc" }] } },
  });
  if (existing) {
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    return res.json({ item: serializeWorkout(existing), game, duplicate: true });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.workout.create({
        data: {
          userId: req.user!.id,
          customPlanId: input.customPlanId,
          type: input.type,
          name: input.name,
          duration: input.duration,
          durationSeconds: input.durationSeconds,
          calories: input.calories,
          caloriesEstimated: input.caloriesEstimated,
          date: dateOnly(input.date),
          planId: input.planId,
          planCategory: input.planCategory,
          courseSession: input.courseSession,
          plannedDurationMinutes: input.plannedDurationMinutes,
          exercisesCompleted: input.exercisesCompleted,
          setsCompleted: input.setsCompleted,
          sessionId: input.sessionId,
          clientRequestId: key,
          sets: {
            create: input.performedSets.map((set) => ({
              exerciseName: set.exerciseName,
              exerciseSequence: set.exerciseSequence ?? null,
              setNumber: set.setNumber,
              reps: set.reps ?? null,
              weightKg: set.weightKg ?? null,
              durationSeconds: set.durationSeconds ?? null,
              restSeconds: set.restSeconds,
              ...(set.exerciseId ? { exercise: { connect: { id: set.exerciseId } } } : {}),
            })),
          },
        },
        include: { sets: { orderBy: [{ exerciseSequence: "asc" }, { setNumber: "asc" }] } },
      });
      const game = await grantReward(tx, req.user!.id, "workout", `workout:${key}`);
      return { item, game };
    });
    res.status(201).json({ item: serializeWorkout(result.item), game: result.game, duplicate: false });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await prisma.workout.findFirst({
      where: {
        userId: req.user!.id,
        OR: [
          { clientRequestId: key },
          ...(input.sessionId ? [{ sessionId: input.sessionId }] : []),
        ],
      },
      include: { sets: { orderBy: [{ exerciseSequence: "asc" }, { setNumber: "asc" }] } },
    });
    if (!duplicate) throw error;
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    res.json({ item: serializeWorkout(duplicate), game, duplicate: true });
  }
});

activityRouter.patch("/workouts/:id", async (req, res) => {
  const id = req.params.id;
  const input = workoutUpdateSchema.parse(req.body);
  const { performedSets, date, ...fields } = input;
  const exerciseIds = [...new Set((performedSets ?? []).flatMap((set) => set.exerciseId ? [set.exerciseId] : []))];

  const item = await prisma.$transaction(async (tx) => {
    const owned = await tx.workout.findFirst({
      where: { id, userId: req.user!.id },
      select: { id: true },
    });
    if (!owned) throw new HttpError(404, "WORKOUT_NOT_FOUND", "Workout not found.");
    if (fields.customPlanId) {
      const plan = await tx.workoutPlan.findFirst({
        where: { id: fields.customPlanId, userId: req.user!.id },
        select: { id: true },
      });
      if (!plan) throw new HttpError(404, "PLAN_NOT_FOUND", "Workout plan not found.");
    }
    if (exerciseIds.length && await tx.exercise.count({ where: { id: { in: exerciseIds } } }) !== exerciseIds.length) {
      throw new HttpError(400, "UNKNOWN_EXERCISE", "One or more performed exercises are not in the catalogue.");
    }

    return tx.workout.update({
      where: { id: owned.id },
      data: {
        ...fields,
        ...(date ? { date: dateOnly(date) } : {}),
        ...(performedSets ? {
          sets: {
            deleteMany: {},
            create: performedSets.map((set) => ({
              exerciseName: set.exerciseName,
              exerciseSequence: set.exerciseSequence ?? null,
              setNumber: set.setNumber,
              reps: set.reps ?? null,
              weightKg: set.weightKg ?? null,
              durationSeconds: set.durationSeconds ?? null,
              restSeconds: set.restSeconds,
              ...(set.exerciseId ? { exercise: { connect: { id: set.exerciseId } } } : {}),
            })),
          },
        } : {}),
      },
      include: { sets: { orderBy: [{ exerciseSequence: "asc" }, { setNumber: "asc" }] } },
    });
  });
  res.json({ item: serializeWorkout(item) });
});

activityRouter.delete("/workouts/:id", async (req, res) => {
  const deleted = await prisma.workout.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (deleted.count === 0) throw new HttpError(404, "WORKOUT_NOT_FOUND", "Workout not found.");
  res.status(204).end();
});

activityRouter.get("/nutrition", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.meal.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit, skip: offset }),
    prisma.meal.count({ where }),
  ]);
  res.json({ items: items.map(serializeMeal), total, limit, offset });
});

activityRouter.post("/nutrition", async (req, res) => {
  const input = mealSchema.parse(req.body);
  const key = idempotencyKey(req);
  const existing = await prisma.meal.findFirst({ where: { userId: req.user!.id, clientRequestId: key } });
  if (existing) {
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    return res.json({ item: serializeMeal(existing), game, duplicate: true });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.meal.create({
        data: { ...input, userId: req.user!.id, date: dateOnly(input.date), clientRequestId: key },
      });
      const game = await grantReward(tx, req.user!.id, "meal", `meal:${key}`);
      return { item, game };
    });
    res.status(201).json({ item: serializeMeal(result.item), game: result.game, duplicate: false });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await prisma.meal.findFirst({ where: { userId: req.user!.id, clientRequestId: key } });
    if (!duplicate) throw error;
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    res.json({ item: serializeMeal(duplicate), game, duplicate: true });
  }
});

activityRouter.patch("/nutrition/:id", async (req, res) => {
  const id = req.params.id;
  const input = mealSchema.partial().strict().parse(req.body);
  const updated = await prisma.meal.updateMany({
    where: { id, userId: req.user!.id },
    data: { ...input, ...(input.date ? { date: dateOnly(input.date) } : {}) },
  });
  if (updated.count === 0) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
  const item = await prisma.meal.findFirst({ where: { id, userId: req.user!.id } });
  res.json({ item: serializeMeal(item!) });
});

activityRouter.delete("/nutrition/:id", async (req, res) => {
  const deleted = await prisma.meal.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (deleted.count === 0) throw new HttpError(404, "MEAL_NOT_FOUND", "Meal not found.");
  res.status(204).end();
});

activityRouter.get("/progress", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [records, total] = await Promise.all([
    prisma.progressMetric.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: limit, skip: offset }),
    prisma.progressMetric.count({ where }),
  ]);
  res.json({ items: records.map(serializeMetric), total, limit, offset });
});

activityRouter.post("/progress", async (req, res) => {
  const input = metricSchema.parse(req.body);
  const key = idempotencyKey(req);
  const existing = await prisma.progressMetric.findFirst({ where: { userId: req.user!.id, clientRequestId: key } });
  if (existing) {
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    return res.json({ item: serializeMetric(existing), game, duplicate: true });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.progressMetric.create({
        data: { userId: req.user!.id, weightKg: input.weight, date: dateOnly(input.date), clientRequestId: key },
      });
      const game = await grantReward(tx, req.user!.id, "weight", `weight:${key}`);
      return { item, game };
    });
    res.status(201).json({ item: serializeMetric(result.item), game: result.game, duplicate: false });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await prisma.progressMetric.findFirst({ where: { userId: req.user!.id, clientRequestId: key } });
    if (!duplicate) throw error;
    const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
    res.json({ item: serializeMetric(duplicate), game, duplicate: true });
  }
});

activityRouter.patch("/progress/:id", async (req, res) => {
  const id = req.params.id;
  const input = metricSchema.partial().strict().parse(req.body);
  const updated = await prisma.progressMetric.updateMany({
    where: { id, userId: req.user!.id },
    data: {
      ...(input.weight !== undefined ? { weightKg: input.weight } : {}),
      ...(input.date ? { date: dateOnly(input.date) } : {}),
    },
  });
  if (updated.count === 0) throw new HttpError(404, "METRIC_NOT_FOUND", "Progress record not found.");
  const item = await prisma.progressMetric.findFirst({ where: { id, userId: req.user!.id } });
  res.json({ item: serializeMetric(item!) });
});

activityRouter.delete("/progress/:id", async (req, res) => {
  const deleted = await prisma.progressMetric.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (deleted.count === 0) throw new HttpError(404, "METRIC_NOT_FOUND", "Progress record not found.");
  res.status(204).end();
});

activityRouter.get("/progress/goals", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.fitnessGoal.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    prisma.fitnessGoal.count({ where }),
  ]);
  res.json({ items: items.map((item) => ({ ...item, deadline: item.deadline ? dateString(item.deadline) : null })), total, limit, offset });
});

activityRouter.post("/progress/goals", async (req, res) => {
  const input = fitnessGoalSchema.parse(req.body);
  const item = await prisma.fitnessGoal.create({
    data: { ...input, userId: req.user!.id, deadline: input.deadline ? dateOnly(input.deadline) : null },
  });
  res.status(201).json({ item: { ...item, deadline: item.deadline ? dateString(item.deadline) : null } });
});

activityRouter.patch("/progress/goals/:id", async (req, res) => {
  const id = req.params.id;
  const input = fitnessGoalSchema.partial().strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.").parse(req.body);
  const updated = await prisma.fitnessGoal.updateMany({
    where: { id, userId: req.user!.id },
    data: {
      ...input,
      ...(input.deadline !== undefined && input.deadline !== null ? { deadline: dateOnly(input.deadline) } : {}),
    },
  });
  if (updated.count === 0) throw new HttpError(404, "GOAL_NOT_FOUND", "Fitness goal not found.");
  const item = await prisma.fitnessGoal.findFirst({ where: { id, userId: req.user!.id } });
  res.json({ item: { ...item!, deadline: item!.deadline ? dateString(item!.deadline) : null } });
});

activityRouter.delete("/progress/goals/:id", async (req, res) => {
  const deleted = await prisma.fitnessGoal.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (deleted.count === 0) throw new HttpError(404, "GOAL_NOT_FOUND", "Fitness goal not found.");
  res.status(204).end();
});

activityRouter.post("/account/import-local", async (req, res) => {
  const input = legacyImportSchema.parse(req.body);
  const pick = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
  const importedWorkouts = input.workouts.map((item) => workoutSchema.parse(pick(item, [
    "type", "name", "duration", "durationSeconds", "calories", "date",
  ])));
  const importedMeals = input.meals.map((item) => mealSchema.parse(pick(item, [
    "name", "type", "quantity", "quantityUnit", "calories", "protein", "carbs", "fat", "date",
  ])));
  const importedMetrics = input.metrics.map((item) => metricSchema.parse(pick(item, ["weight", "date"])));

  const prior = await prisma.legacyImport.findUnique({ where: { userId: req.user!.id } });
  if (prior) return res.json({ imported: false, duplicate: true, counts: { workouts: prior.workoutCount, meals: prior.mealCount, metrics: prior.metricCount } });

  try {
    const counts = await prisma.$transaction(async (tx) => {
      await tx.workout.createMany({
        data: importedWorkouts.map((workout) => ({
          userId: req.user!.id,
          type: workout.type,
          name: workout.name,
          duration: workout.duration,
          durationSeconds: workout.durationSeconds ?? null,
          calories: workout.calories,
          date: dateOnly(workout.date),
        })),
      });
      await tx.meal.createMany({
        data: importedMeals.map((meal) => ({
          userId: req.user!.id,
          name: meal.name,
          type: meal.type,
          quantity: meal.quantity,
          quantityUnit: meal.quantityUnit,
          calories: meal.calories,
          protein: meal.protein,
          carbs: meal.carbs,
          fat: meal.fat,
          date: dateOnly(meal.date),
        })),
      });
      await tx.progressMetric.createMany({
        data: importedMetrics.map((metric) => ({
          userId: req.user!.id,
          weightKg: metric.weight,
          date: dateOnly(metric.date),
        })),
      });
      const record = {
        workouts: importedWorkouts.length,
        meals: importedMeals.length,
        metrics: importedMetrics.length,
      };
      await tx.legacyImport.create({
        data: { userId: req.user!.id, workoutCount: record.workouts, mealCount: record.meals, metricCount: record.metrics },
      });
      await tx.securityAuditEvent.create({
        data: { userId: req.user!.id, action: "legacy-data.import", targetType: "account", targetId: req.user!.id },
      });
      return record;
    });
    res.status(201).json({ imported: true, duplicate: false, counts });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const priorImport = await prisma.legacyImport.findUnique({ where: { userId: req.user!.id } });
    if (!priorImport) throw error;
    res.json({
      imported: false,
      duplicate: true,
      counts: { workouts: priorImport.workoutCount, meals: priorImport.mealCount, metrics: priorImport.metricCount },
    });
  }
});

activityRouter.get("/game", async (req, res) => {
  const game = await prisma.$transaction((tx) => readGameState(tx, req.user!.id));
  res.json({ game });
});

activityRouter.post("/game/rewards", async (req, res) => {
  rewardSchema.parse(req.body);
  const settings = await prisma.userSettings.findUnique({ where: { userId: req.user!.id }, select: { timeZone: true } });
  const activityDate = dateKeyInTimeZone(new Date(), settings?.timeZone || "UTC");
  const game = await prisma.$transaction((tx) => grantReward(tx, req.user!.id, "chat", `chat:${activityDate}`));
  res.json({ game });
});
