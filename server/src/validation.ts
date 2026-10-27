import { z } from "zod";

const date = z.iso.date();
const nonNegative = z.number().finite().min(0).max(1_000_000);
const positive = z.number().finite().gt(0).max(1_000_000);

export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must be no longer than 72 UTF-8 bytes."),
  goal: z.string().trim().min(1).max(100),
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
}).strict();

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  goal: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const settingsSchema = z.object({
  theme: z.enum(["dark", "light"]).optional(),
  measurementUnit: z.enum(["metric", "imperial"]).optional(),
  timeZone: z.string().trim().min(1).max(100).optional(),
  workoutPreference: z.string().trim().max(500).optional(),
  emailNotifications: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const workoutSchema = z.object({
  type: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  duration: z.number().int().positive().max(1440),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  calories: nonNegative.default(0),
  caloriesEstimated: z.boolean().default(false),
  date,
  planId: z.string().trim().max(100).nullable().optional(),
  planCategory: z.string().trim().max(100).nullable().optional(),
  courseSession: z.string().trim().max(100).nullable().optional(),
  plannedDurationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  exercisesCompleted: z.number().int().nonnegative().max(1000).nullable().optional(),
  setsCompleted: z.number().int().nonnegative().max(5000).nullable().optional(),
  performedSets: z.array(z.object({
    exerciseId: z.string().trim().min(1).max(100).nullable().optional(),
    exerciseSequence: z.number().int().nonnegative().max(100).nullable().optional(),
    exerciseName: z.string().trim().min(1).max(120),
    setNumber: z.number().int().positive().max(100),
    reps: z.number().int().positive().max(1000).nullable().optional(),
    weightKg: nonNegative.nullable().optional(),
    durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
    restSeconds: z.number().int().nonnegative().max(3600).default(0),
  }).strict().refine((set) => Boolean(set.reps) !== Boolean(set.durationSeconds), "A performed set must record either repetitions or a timed duration." )).max(1000).default([]),
  sessionId: z.string().uuid().nullable().optional(),
  customPlanId: z.string().uuid().nullable().optional(),
}).strict();

export const workoutUpdateSchema = workoutSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const mealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40),
  quantity: positive.max(100_000).default(1),
  quantityUnit: z.string().trim().min(1).max(40).default("serving"),
  calories: positive,
  protein: nonNegative.default(0),
  carbs: nonNegative.default(0),
  fat: nonNegative.default(0),
  nutritionEstimated: z.boolean().default(false),
  date,
}).strict();

export const metricSchema = z.object({
  weight: positive.max(1000),
  date,
}).strict();

export const rewardSchema = z.object({
  type: z.literal("chat"),
}).strict();

const planExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1).max(100),
  sequence: z.number().int().nonnegative().max(100),
  sets: z.number().int().positive().max(100),
  reps: z.number().int().positive().max(1000).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  restSeconds: z.number().int().nonnegative().max(3600).default(0),
}).strict();

export const workoutPlanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  category: z.string().trim().min(1).max(100),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  exercises: z.array(planExerciseSchema).min(1).max(100),
}).strict().refine((value) => new Set(value.exercises.map((exercise) => exercise.sequence)).size === value.exercises.length, "Exercise sequence numbers must be unique.");

export const fitnessGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  metric: z.enum(["weight", "workouts", "training-minutes", "custom"]),
  targetValue: positive,
  unit: z.string().trim().min(1).max(40),
  deadline: date.nullable().optional(),
}).strict();

export const legacyImportSchema = z.object({
  workouts: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
  meals: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
  metrics: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
}).strict().refine((value) => value.workouts.length + value.meals.length + value.metrics.length > 0, "There is no local activity to import.");

export const assistantMessageSchema = z.object({
  content: z.string().trim().min(1).max(500),
}).strict();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
