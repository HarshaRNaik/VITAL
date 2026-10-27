import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/http-error.js";
import { paginationSchema, profileSchema, settingsSchema, workoutPlanSchema } from "../validation.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/users/me", (req, res) => {
  res.json({ user: req.user });
});

usersRouter.patch("/users/me", async (req, res) => {
  const input = profileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: input,
    select: { id: true, email: true, name: true, goal: true },
  });
  await prisma.securityAuditEvent.create({
    data: { userId: user.id, action: "profile.update", targetType: "user", targetId: user.id },
  });
  res.json({ user });
});

usersRouter.get("/settings", async (req, res) => {
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id },
    update: {},
  });
  res.json({ settings });
});

usersRouter.patch("/settings", async (req, res) => {
  const input = settingsSchema.parse(req.body);
  if (input.timeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
    } catch {
      throw new HttpError(400, "INVALID_TIME_ZONE", "Enter a valid IANA time zone.");
    }
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...input },
    update: input,
  });
  res.json({ settings });
});

usersRouter.get("/exercises", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const equipment = typeof req.query.equipment === "string" ? req.query.equipment.trim().slice(0, 80) : "";
  const focus = typeof req.query.focus === "string" ? req.query.focus.trim().slice(0, 120) : "";
  const where = {
    ...(equipment ? { equipment } : {}),
    ...(focus ? { focus: { contains: focus, mode: "insensitive" as const } } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { focus: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.exercise.findMany({ where, orderBy: { name: "asc" }, take: limit, skip: offset }),
    prisma.exercise.count({ where }),
  ]);
  res.json({ items, total, limit, offset });
});

const planInclude = {
  exercises: {
    orderBy: { sequence: "asc" as const },
    include: { exercise: true },
  },
};

usersRouter.get("/workout-plans", async (req, res) => {
  const { limit, offset } = paginationSchema.parse(req.query);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.workoutPlan.findMany({ where, include: planInclude, orderBy: { updatedAt: "desc" }, take: limit, skip: offset }),
    prisma.workoutPlan.count({ where }),
  ]);
  res.json({ items, total, limit, offset });
});

usersRouter.post("/workout-plans", async (req, res) => {
  const input = workoutPlanSchema.parse(req.body);
  const exerciseIds = [...new Set(input.exercises.map((exercise) => exercise.exerciseId))];
  const existing = await prisma.exercise.count({ where: { id: { in: exerciseIds } } });
  if (existing !== exerciseIds.length) throw new HttpError(400, "UNKNOWN_EXERCISE", "One or more selected exercises are not available.");

  const plan = await prisma.workoutPlan.create({
    data: {
      userId: req.user!.id,
      name: input.name,
      description: input.description,
      category: input.category,
      difficulty: input.difficulty,
      exercises: {
        create: input.exercises.map(({ exerciseId, ...exercise }) => ({
          ...exercise,
          exercise: { connect: { id: exerciseId } },
        })),
      },
    },
    include: planInclude,
  });
  res.status(201).json({ item: plan });
});

usersRouter.patch("/workout-plans/:id", async (req, res) => {
  const id = req.params.id;
  const input = workoutPlanSchema.parse(req.body);
  const exerciseIds = [...new Set(input.exercises.map((exercise) => exercise.exerciseId))];
  const [owned, existing] = await Promise.all([
    prisma.workoutPlan.findFirst({ where: { id, userId: req.user!.id }, select: { id: true } }),
    prisma.exercise.count({ where: { id: { in: exerciseIds } } }),
  ]);
  if (!owned) throw new HttpError(404, "PLAN_NOT_FOUND", "Workout plan not found.");
  if (existing !== exerciseIds.length) throw new HttpError(400, "UNKNOWN_EXERCISE", "One or more selected exercises are not available.");

  const item = await prisma.workoutPlan.update({
    where: { id: owned.id },
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      difficulty: input.difficulty,
      exercises: {
        deleteMany: {},
        create: input.exercises.map(({ exerciseId, ...exercise }) => ({
          ...exercise,
          exercise: { connect: { id: exerciseId } },
        })),
      },
    },
    include: planInclude,
  });
  await prisma.securityAuditEvent.create({
    data: { userId: req.user!.id, action: "workout-plan.update", targetType: "workout-plan", targetId: item.id },
  });
  res.json({ item });
});

usersRouter.delete("/workout-plans/:id", async (req, res) => {
  const id = req.params.id;
  const deleted = await prisma.workoutPlan.deleteMany({ where: { id, userId: req.user!.id } });
  if (deleted.count === 0) throw new HttpError(404, "PLAN_NOT_FOUND", "Workout plan not found.");
  await prisma.securityAuditEvent.create({
    data: { userId: req.user!.id, action: "workout-plan.delete", targetType: "workout-plan", targetId: id },
  });
  res.status(204).end();
});
