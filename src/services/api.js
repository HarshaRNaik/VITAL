import { z } from 'zod'
import { getSignedInUser, hasSupabaseConfig, requireSignedInUser, requireSupabase } from './supabase'
import {
  aggregateFitnessAnalytics,
  calculatePaceSecondsPerKm,
  calculateSpeedKph,
} from '../domain/fitness-calculations'

export class ApiError extends Error {
  constructor(message, { code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = undefined
    this.code = code
    this.details = details
  }
}

const initialGame = { totalXP: 0, streak: 0, lastActive: null, counts: {}, badges: [] }
const camelKey = (key) => key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())
const dateSchema = z.iso.date()
const amountSchema = z.number().finite().min(0).max(1_000_000)
const performedSetSchema = z.object({
  exerciseId: z.string().trim().min(1).max(100).nullable().optional(),
  exerciseSequence: z.number().int().nonnegative().max(100).nullable().optional(),
  exerciseName: z.string().trim().min(1).max(120),
  setNumber: z.number().int().positive().max(100),
  reps: z.number().int().positive().max(1000).nullable().optional(),
  weightKg: amountSchema.nullable().optional(),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  restSeconds: z.number().int().nonnegative().max(3600).default(0),
}).strict().refine((set) => Boolean(set.reps) !== Boolean(set.durationSeconds), 'A set must record repetitions or a timed duration.')
const workoutSchema = z.object({
  type: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  duration: z.number().int().positive().max(1440),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  calories: amountSchema.optional(),
  caloriesEstimated: z.boolean().optional(),
  date: dateSchema,
  planId: z.string().trim().max(100).nullable().optional(),
  planCategory: z.string().trim().max(100).nullable().optional(),
  courseSession: z.string().trim().max(100).nullable().optional(),
  plannedDurationMinutes: z.number().int().positive().max(1440).nullable().optional(),
  exercisesCompleted: z.number().int().nonnegative().max(1000).nullable().optional(),
  setsCompleted: z.number().int().nonnegative().max(5000).nullable().optional(),
  performedSets: z.array(performedSetSchema).max(1000).optional(),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).nullable().optional(),
  customPlanId: z.string().uuid().nullable().optional(),
}).strict()
const workoutUpdateSchema = workoutSchema.omit({ sessionId: true }).partial()
const mealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(40),
  quantity: z.number().finite().positive().max(100_000).default(1),
  quantityUnit: z.string().trim().min(1).max(40).default('serving'),
  calories: z.number().finite().positive().max(1_000_000),
  protein: amountSchema.default(0),
  carbs: amountSchema.default(0),
  fat: amountSchema.default(0),
  nutritionEstimated: z.boolean().default(false),
  date: dateSchema,
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional(),
}).strict()
const metricSchema = z.object({
  weight: z.number().finite().positive().max(1000),
  date: dateSchema,
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional(),
}).strict()
const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional()
const bodyMeasurementSchema = z.object({
  measurementType: z.enum(['height', 'waist', 'hip', 'chest', 'neck', 'arm', 'thigh']),
  value: z.number().finite().positive().max(300),
  unit: z.enum(['cm', 'in']),
  measuredOn: dateSchema,
  requestId: requestIdSchema,
}).strict().refine((item) => item.unit !== 'in' || item.value <= 120, 'Measurements in inches must be 120 or less.')
const activitySessionSchema = z.object({
  activityType: z.enum(['walking', 'running', 'jogging', 'cycling', 'indoor_cardio', 'treadmill']),
  source: z.literal('manual'),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  durationSeconds: z.number().int().positive().max(604800),
  distanceKm: z.number().finite().positive().max(100000).nullable().optional(),
  calories: z.number().int().nonnegative().max(100000).nullable().optional(),
  caloriesEstimated: z.boolean().default(false),
  steps: z.number().int().nonnegative().max(1000000).nullable().optional(),
  date: dateSchema,
  requestId: requestIdSchema,
}).strict().refine((item) => Date.parse(item.endedAt) > Date.parse(item.startedAt), 'Activity must end after it starts.')
  .refine((item) => item.distanceKm === undefined || item.distanceKm === null
    || (item.distanceKm >= 0.01 && item.durationSeconds / item.distanceKm >= 1
      && item.durationSeconds / item.distanceKm <= 604800
      && item.distanceKm / (item.durationSeconds / 3600) <= 1000), 'Activity distance and duration are outside supported limits.')
const hydrationLogSchema = z.object({
  amountMl: z.number().int().positive().max(10000),
  consumedAt: z.iso.datetime({ offset: true }).optional(),
  date: dateSchema,
  requestId: requestIdSchema,
}).strict()
const habitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(['workout', 'walking', 'hydration', 'stretching', 'nutrition', 'recovery', 'meditation', 'custom']),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
  active: z.boolean().default(true),
  reminder: z.record(z.string(), z.unknown()).default({}),
}).strict()
const habitCompletionSchema = z.object({
  habitId: z.uuid(),
  completedOn: dateSchema,
  requestId: requestIdSchema,
}).strict()
const fastingSessionSchema = z.object({
  scheduleHours: z.number().int().min(1).max(24),
  startedAt: z.iso.datetime({ offset: true }).optional(),
}).strict()
const fitnessChallengeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().min(1).max(80),
  durationDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  schedule: z.array(z.record(z.string(), z.unknown())).min(7).max(30),
  startedOn: dateSchema,
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).default('active'),
}).strict().refine((challenge) => challenge.schedule.length === challenge.durationDays, 'Challenge schedule must match its duration.')
const challengeCompletionSchema = z.object({
  challengeId: z.uuid(),
  challengeDay: z.number().int().min(1).max(30),
  completedOn: dateSchema,
}).strict()
const workoutSessionStateSchema = z.object({
  id: z.uuid(),
  plan: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()),
  status: z.enum(['ready', 'running', 'paused', 'completed', 'cancelled']),
}).strict()
const goalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  metric: z.enum(['weight', 'workouts', 'training-minutes', 'custom']),
  targetValue: z.number().finite().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(40),
  deadline: dateSchema.nullable().optional(),
  completedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional(),
}).strict()
const planExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1).max(100),
  sequence: z.number().int().nonnegative().max(100),
  sets: z.number().int().positive().max(100),
  reps: z.number().int().positive().max(1000).nullable().optional(),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  restSeconds: z.number().int().nonnegative().max(3600).default(0),
}).strict()
const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(100),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  exercises: z.array(planExerciseSchema).min(1).max(100),
}).strict().refine((plan) => new Set(plan.exercises.map((exercise) => exercise.sequence)).size === plan.exercises.length, 'Exercise sequence numbers must be unique.')
const gymSetSchema = z.object({
  setNumber: z.number().int().positive().max(100),
  weightKg: amountSchema.nullable(),
  reps: z.number().int().positive().max(1000).nullable(),
  rpe: z.number().finite().min(1).max(10).nullable(),
  setType: z.enum(['WARM_UP', 'WORKING', 'DROP', 'FAILURE', 'REST_PAUSE']),
  completed: z.boolean(),
  notes: z.string().max(500).default(''),
}).strict()
const gymExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1).max(100),
  exerciseName: z.string().trim().min(1).max(120),
  focus: z.string().trim().max(120),
  equipment: z.string().trim().max(80),
  sequence: z.number().int().nonnegative().max(100),
  notes: z.string().max(500).default(''),
  sets: z.array(gymSetSchema).max(100),
}).strict()
const gymWorkoutSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
  unit: z.enum(['kg', 'lb']),
  startedAt: z.iso.datetime({ offset: true }),
  durationSeconds: z.number().int().nonnegative().max(86_400),
  exercises: z.array(gymExerciseSchema).max(100),
}).strict()
const gymTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  exercises: z.array(z.object({
    exerciseId: z.string().trim().min(1).max(100),
    sets: z.number().int().positive().max(30),
    reps: z.number().int().positive().max(1000),
    restSeconds: z.number().int().nonnegative().max(3600),
  }).strict()).min(1).max(100),
}).strict()
function validateInput(schema, input, label) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ApiError(`${label}: ${parsed.error.issues[0]?.message || 'Invalid input.'}`, { code: 'INVALID_INPUT' })
  }
  return parsed.data
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [camelKey(key), camelize(item)]))
}

async function resultOf(query) {
  const { data, error } = await query
  if (error) {
    throw new ApiError(error.message || 'The Supabase request failed.', {
      code: error.code,
      details: error.details,
    })
  }
  if (data?.rateLimited === true) {
    throw new ApiError('Too many requests. Please wait a moment and try again.', { code: 'RATE_LIMITED' })
  }
  return data
}

async function privateList(table, select = '*', orderBy = 'date') {
  if (!hasSupabaseConfig || !(await getSignedInUser())) return []
  const client = requireSupabase()
  const user = await requireSignedInUser()
  const items = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    let query = client.from(table).select(select).eq('user_id', user.id)
    if (orderBy) query = query.order(orderBy, { ascending: false })
    const page = await resultOf(query.range(offset, offset + pageSize - 1))
    items.push(...page)
    if (page.length < pageSize) return items
  }
}

async function createReward(type, key) {
  const client = requireSupabase()
  return resultOf(client.rpc('grant_game_reward', {
    p_type: type,
    p_idempotency_key: `${type}:${key}`,
  }))
}

function mapMeal(row) {
  return camelize(row)
}

function mapMetric(row) {
  const item = camelize(row)
  return { ...item, weight: item.weightKg }
}

function mapWorkout(row) {
  const { workoutSets, ...item } = camelize(row)
  return { ...item, sets: workoutSets || [] }
}

function mapPerformedSet(set) {
  return {
    exercise_id: set.exerciseId || null,
    exercise_sequence: set.exerciseSequence ?? null,
    exercise_name: set.exerciseName,
    set_number: set.setNumber,
    reps: set.reps ?? null,
    weight_kg: set.weightKg ?? null,
    duration_seconds: set.durationSeconds ?? null,
    rest_seconds: set.restSeconds,
  }
}

function mapGame(row) {
  if (!row) return initialGame
  return {
    totalXP: row.total_xp,
    streak: row.streak,
    lastActive: row.last_active,
    counts: row.counts || {},
    badges: row.badges || [],
  }
}

export const authApi = {
  session: async () => {
    const user = await getSignedInUser()
    if (!user) return null
    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || '',
      goal: user.user_metadata?.goal || '',
    }
  },
  register: async (data) => {
    const client = requireSupabase()
    return resultOf(client.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name, goal: data.goal } },
    }))
  },
  login: async (email, password) => {
    const client = requireSupabase()
    return resultOf(client.auth.signInWithPassword({ email, password }))
  },
  logout: async () => {
    const client = requireSupabase()
    return resultOf(client.auth.signOut())
  },
}

function activityCollection(table, mapper, columns, rewardType = null, recordRpc = null, schema = null, orderBy = 'date') {
  return {
    list: async () => (await privateList(table, '*', orderBy)).map(mapper),
    add: async (item) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const validated = schema ? validateInput(schema, item, 'Invalid activity') : item
      const requestId = validated.requestId || crypto.randomUUID()
      const row = {
        ...columns(validated),
        client_request_id: requestId,
      }
      if (recordRpc) {
        const saved = await resultOf(client.rpc(recordRpc, { p_item: row }))
        return {
          item: mapper(camelize(saved.item)),
          game: saved.game,
          duplicate: saved.duplicate,
        }
      }
      row.user_id = user.id
      let saved
      let duplicate = false
      try {
        saved = camelize(await resultOf(client.from(table).insert(row).select('*').single()))
      } catch (error) {
        if (error.code !== '23505') throw error
        saved = camelize(await resultOf(client.from(table).select('*')
          .eq('user_id', user.id).eq('client_request_id', requestId).single()))
        duplicate = true
      }
      const game = rewardType ? await createReward(rewardType, saved.id) : undefined
      return {
        item: mapper(camelize(await resultOf(client.from(table).select('*').eq('id', saved.id).single()))),
        game,
        duplicate,
      }
    },
    update: async (id, patch) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const validated = schema ? validateInput(schema.partial(), patch, 'Invalid activity update') : patch
      const saved = await resultOf(client.from(table).update(columns(validated)).eq('id', id).eq('user_id', user.id).select('*').single())
      return { item: mapper(camelize(saved)) }
    },
    remove: async (id) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      await resultOf(client.from(table).delete().eq('id', id).eq('user_id', user.id))
    },
  }
}

function loggedCollection(table, schema, columns, orderBy, mapper = camelize) {
  return {
    list: async () => (await privateList(table, '*', orderBy)).map(mapper),
    add: async (item) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const validated = validateInput(schema, item, `Invalid ${table.replaceAll('_', ' ')}`)
      const requestId = validated.requestId || crypto.randomUUID()
      const row = { ...columns(validated), user_id: user.id, client_request_id: requestId }
      let saved
      let duplicate = false
      try {
        saved = await resultOf(client.from(table).insert(row).select('*').single())
      } catch (error) {
        if (error.code !== '23505') throw error
        saved = await resultOf(client.from(table).select('*')
          .eq('user_id', user.id).eq('client_request_id', requestId).single())
        duplicate = true
      }
      return { item: mapper(camelize(saved)), duplicate }
    },
    remove: async (id) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      await resultOf(client.from(table).delete().eq('id', id).eq('user_id', user.id))
    },
  }
}

export const meals = activityCollection('nutrition_logs', mapMeal, (item) => ({
  name: item.name,
  type: item.type,
  quantity: Number(item.quantity) || 1,
  quantity_unit: item.quantityUnit || 'serving',
  calories: Number(item.calories),
  protein: Number(item.protein) || 0,
  carbs: Number(item.carbs) || 0,
  fat: Number(item.fat) || 0,
  nutrition_estimated: Boolean(item.nutritionEstimated),
  date: item.date,
}), 'meal', 'record_nutrition_log', mealSchema)

export const metrics = activityCollection('progress_metrics', mapMetric, (item) => ({
  weight_kg: Number(item.weight ?? item.weightKg),
  date: item.date,
}), 'weight', 'record_progress_metric', metricSchema)

export const workouts = {
  list: async () => (await privateList('workouts', '*,workout_sets(*)')).map(mapWorkout),
  add: async (item) => {
    await requireSignedInUser()
    const client = requireSupabase()
    const validated = validateInput(workoutSchema, item, 'Invalid workout')
    const sessionId = validated.sessionId || crypto.randomUUID()
    const { performedSets = [], ...fields } = validated
    const saved = await resultOf(client.rpc('record_completed_workout', { p_item: {
      custom_plan_id: fields.customPlanId || null,
      type: fields.type,
      name: fields.name,
      duration: Number(fields.duration),
      duration_seconds: fields.durationSeconds ?? null,
      calories: Number(fields.calories) || 0,
      calories_estimated: Boolean(fields.caloriesEstimated),
      date: fields.date,
      plan_id: fields.planId || null,
      plan_category: fields.planCategory || null,
      course_session: fields.courseSession || null,
      planned_duration_minutes: fields.plannedDurationMinutes ?? null,
      exercises_completed: fields.exercisesCompleted ?? null,
      sets_completed: fields.setsCompleted ?? null,
      session_id: sessionId,
      client_request_id: sessionId,
      performed_sets: performedSets.map(mapPerformedSet),
    } }))
    return {
      item: mapWorkout(camelize(saved.item)),
      game: saved.game,
      duplicate: saved.duplicate,
    }
  },
  update: async (id, patch) => {
    await requireSignedInUser()
    const client = requireSupabase()
    const validated = validateInput(workoutUpdateSchema, patch, 'Invalid workout update')
    const columns = Object.fromEntries(Object.entries(validated).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value,
    ]))
    if (validated.performedSets) columns.performed_sets = validated.performedSets.map(mapPerformedSet)
    const saved = await resultOf(client.rpc('update_completed_workout', {
      p_workout_id: id,
      p_item: columns,
    }))
    return { item: mapWorkout(camelize(saved)) }
  },
  remove: async (id) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    await resultOf(client.from('workouts').delete().eq('id', id).eq('user_id', user.id))
  },
}

export const gymWorkouts = {
  list: async () => (await privateList('gym_workouts', '*', 'updated_at'))
    .map((item) => camelize(item)),
  save: async (id, workout) => {
    await requireSignedInUser()
    const client = requireSupabase()
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError('Invalid gym workout ID.', { code: 'INVALID_INPUT' })
    }
    // The caller keeps the database-generated/requested ID on its workout object,
    // while the RPC receives that ID separately. Reject mismatches, then validate
    // only the mutable workout fields against the strict payload schema.
    if (workout?.id !== undefined && workout.id !== id) {
      throw new ApiError('Gym workout ID does not match the workout being saved.', { code: 'INVALID_INPUT' })
    }
    const workoutFields = workout == null
      ? workout
      : Object.fromEntries(Object.entries(workout).filter(([key]) => key !== 'id'))
    const validated = validateInput(gymWorkoutSchema, workoutFields, 'Invalid gym workout')
    const saved = await resultOf(client.rpc('save_gym_workout', {
      p_workout_id: id,
      p_item: {
        name: validated.name,
        status: validated.status,
        unit: validated.unit,
        started_at: validated.startedAt,
        duration_seconds: validated.durationSeconds,
        exercises: validated.exercises.map((exercise) => ({
          exercise_id: exercise.exerciseId,
          exercise_name: exercise.exerciseName,
          focus: exercise.focus,
          equipment: exercise.equipment,
          sequence: exercise.sequence,
          notes: exercise.notes,
          sets: exercise.sets.map((set) => ({
            set_number: set.setNumber,
            weight_kg: set.weightKg,
            reps: set.reps,
            rpe: set.rpe,
            set_type: set.setType,
            completed: set.completed,
            notes: set.notes,
          })),
        })),
      },
    }))
    return {
      item: camelize(saved.item),
      game: saved.game,
      duplicate: saved.duplicate,
    }
  },
  cancel: async (id) => {
    await requireSignedInUser()
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError('Invalid gym workout ID.', { code: 'INVALID_INPUT' })
    }
    const client = requireSupabase()
    const cancelled = await resultOf(client.rpc('cancel_gym_workout', { p_workout_id: id }))
    if (!cancelled) throw new ApiError('This gym workout is no longer active.', { code: 'WORKOUT_NOT_ACTIVE' })
  },
}

export const gymWorkoutTemplates = {
  list: async () => (await privateList('gym_workout_templates', '*', 'updated_at'))
    .map((item) => camelize(item)),
  save: async (id, template) => {
    await requireSignedInUser()
    const client = requireSupabase()
    if (id && !z.uuid().safeParse(id).success) {
      throw new ApiError('Invalid gym template ID.', { code: 'INVALID_INPUT' })
    }
    const validated = validateInput(gymTemplateSchema, template, 'Invalid gym workout template')
    const saved = await resultOf(client.rpc('save_gym_workout_template', {
      p_template_id: id || null,
      p_item: {
        name: validated.name,
        exercises: validated.exercises.map((exercise) => ({
          exercise_id: exercise.exerciseId,
          sets: exercise.sets,
          reps: exercise.reps,
          rest_seconds: exercise.restSeconds,
        })),
      },
    }))
    return camelize(saved)
  },
  remove: async (id) => {
    await requireSignedInUser()
    if (!z.uuid().safeParse(id).success) {
      throw new ApiError('Invalid gym template ID.', { code: 'INVALID_INPUT' })
    }
    const client = requireSupabase()
    const deleted = await resultOf(client.rpc('delete_gym_workout_template', { p_template_id: id }))
    if (!deleted) throw new ApiError('This gym workout template could not be found.', { code: 'TEMPLATE_NOT_FOUND' })
  },
}

export const exerciseApi = {
  list: async () => (await import('../data/workouts')).MOVEMENTS,
  searchDataset: async (options) => (await import('../data/exercise-catalog')).searchExerciseDataset(options),
}

export const profileApi = {
  get: async () => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    let profile = await resultOf(client.from('profiles').select('*').eq('id', user.id).maybeSingle())
    if (!profile) {
      const metadata = user.user_metadata || {}
      const created = await client.from('profiles').insert({
        id: user.id,
        email: user.email || '',
        name: String(metadata.name || metadata.full_name || '').slice(0, 100),
        goal: String(metadata.goal || '').slice(0, 100),
      }).select('*').maybeSingle()
      if (created.error && created.error.code !== '23505') throw new ApiError(created.error.message || 'The profile could not be loaded.', { code: created.error.code })
      profile = created.data || await resultOf(client.from('profiles').select('*').eq('id', user.id).single())
    }
    return { user: camelize(profile) }
  },
  update: async (profile) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    const parsed = validateInput(z.object({
      name: z.string().trim().min(1).max(100).optional(),
      goal: z.string().trim().min(1).max(100).optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, 'At least one profile field is required.'), profile, 'Invalid profile')
    const updated = await resultOf(client.from('profiles').update({
      ...parsed,
    }).eq('id', user.id).select('*').single())
    return { user: camelize(updated) }
  },
}

export const settingsApi = {
  get: async () => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    return { settings: camelize(await resultOf(client.from('user_settings').select('*').eq('user_id', user.id).single())) }
  },
  update: async (settings) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    const schema = z.object({
      theme: z.enum(['dark', 'light']).optional(),
      measurementUnit: z.enum(['metric', 'imperial']).optional(),
      timeZone: z.string().trim().min(1).max(100).optional(),
      workoutPreference: z.string().trim().max(500).optional(),
      emailNotifications: z.boolean().optional(),
      hydrationTargetMl: z.number().int().min(250).max(10000).nullable().optional(),
      hydrationUnit: z.enum(['ml', 'oz']).optional(),
      fastingSchedule: z.record(z.string(), z.unknown()).nullable().optional(),
      reminderPreferences: z.record(z.string(), z.unknown()).optional(),
      dailyCalorieTarget: z.number().int().min(1200).max(8000).nullable().optional(),
      proteinTargetGrams: z.number().int().min(0).max(1000).nullable().optional(),
      carbsTargetGrams: z.number().int().min(0).max(2000).nullable().optional(),
      fatTargetGrams: z.number().int().min(0).max(1000).nullable().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0, 'At least one settings field is required.')
      .refine((value) => {
        const macroFields = ['proteinTargetGrams', 'carbsTargetGrams', 'fatTargetGrams']
        const supplied = macroFields.filter((field) => Object.hasOwn(value, field))
        return supplied.length === 0 || supplied.length === macroFields.length
      }, 'Protein, carbohydrate, and fat targets must be updated together.')
    const parsed = validateInput(schema, settings, 'Invalid settings')
    if (parsed.timeZone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: parsed.timeZone })
      } catch {
        throw new ApiError('Invalid settings: timeZone must be a valid IANA time zone.', { code: 'INVALID_INPUT' })
      }
    }
    const columns = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]))
    const updated = await resultOf(client.from('user_settings').update(columns).eq('user_id', user.id).select('*').single())
    return { settings: camelize(updated) }
  },
}

export const workoutPlans = {
  list: async () => Promise.all((await privateList('workout_plans', '*,workout_plan_exercises(*)', 'updated_at')).map(mapWorkoutPlan)),
  create: async (plan) => {
    await requireSignedInUser()
    const client = requireSupabase()
    const validated = validateInput(planSchema, plan, 'Invalid workout plan')
    const saved = await resultOf(client.rpc('save_workout_plan', {
      p_plan_id: null,
      p_item: {
        name: validated.name,
        description: validated.description,
        category: validated.category,
        difficulty: validated.difficulty,
        exercises: validated.exercises.map((exercise) => ({
          exercise_id: exercise.exerciseId,
          sequence: exercise.sequence,
          sets: exercise.sets,
          reps: exercise.reps ?? null,
          duration_seconds: exercise.durationSeconds ?? null,
          rest_seconds: exercise.restSeconds,
        })),
      },
    }))
    return { item: await mapWorkoutPlan(camelize(saved)) }
  },
  update: async (id, plan) => {
    await requireSignedInUser()
    const client = requireSupabase()
    const validated = validateInput(planSchema, plan, 'Invalid workout plan')
    const saved = await resultOf(client.rpc('save_workout_plan', {
      p_plan_id: id,
      p_item: {
        name: validated.name,
        description: validated.description,
        category: validated.category,
        difficulty: validated.difficulty,
        exercises: validated.exercises.map((exercise) => ({
          exercise_id: exercise.exerciseId,
          sequence: exercise.sequence,
          sets: exercise.sets,
          reps: exercise.reps ?? null,
          duration_seconds: exercise.durationSeconds ?? null,
          rest_seconds: exercise.restSeconds,
        })),
      },
    }))
    return { item: await mapWorkoutPlan(camelize(saved)) }
  },
  remove: async (id) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    await resultOf(client.from('workout_plans').delete().eq('id', id).eq('user_id', user.id))
  },
}

async function mapWorkoutPlan(row) {
  const { workoutPlanExercises = [], ...plan } = camelize(row)
  const { MOVEMENTS } = await import('../data/workouts')
  return {
    ...plan,
    exercises: workoutPlanExercises.map((item) => ({
      ...item,
      exercise: MOVEMENTS.find((movement) => movement.id === item.exerciseId) || null,
    })),
  }
}

export const fitnessGoals = activityCollection('fitness_goals', camelize, (item) => ({
  name: item.name,
  metric: item.metric,
  target_value: item.targetValue,
  unit: item.unit,
  deadline: item.deadline || null,
  completed_at: item.completedAt || null,
}), null, null, goalSchema, 'updated_at')

const bodyMeasurements = loggedCollection('body_measurements', bodyMeasurementSchema, (item) => ({
  measurement_type: item.measurementType,
  value: item.value,
  unit: item.unit,
  measured_on: item.measuredOn,
}), 'measured_on', (item) => ({ ...camelize(item), date: item.measuredOn }))

const activitySessions = loggedCollection('activity_sessions', activitySessionSchema, (item) => {
  const pace = item.distanceKm ? calculatePaceSecondsPerKm(item.distanceKm, item.durationSeconds) : null
  const speed = item.distanceKm ? calculateSpeedKph(item.distanceKm, item.durationSeconds) : null
  return {
    activity_type: item.activityType,
    source: item.source,
    started_at: item.startedAt,
    ended_at: item.endedAt,
    duration_seconds: item.durationSeconds,
    distance_km: item.distanceKm ?? null,
    pace_seconds_per_km: pace,
    speed_kph: speed,
    calories: item.calories ?? null,
    calories_estimated: item.caloriesEstimated,
    steps: item.steps ?? null,
    recorded_on: item.date,
  }
}, 'recorded_on', (item) => ({ ...camelize(item), date: item.recordedOn }))

const hydrationLogs = loggedCollection('hydration_logs', hydrationLogSchema, (item) => ({
  amount_ml: item.amountMl,
  consumed_at: item.consumedAt || new Date().toISOString(),
  recorded_on: item.date,
}), 'recorded_on', (item) => ({ ...camelize(item), date: item.recordedOn }))

export const fitnessTrackingApi = {
  bodyMeasurements,
  activitySessions,
  hydrationLogs,
  analytics: async () => {
    const [workoutHistory, activities, mealHistory, measurements, hydration] = await Promise.all([
      workouts.list(),
      activitySessions.list(),
      meals.list(),
      bodyMeasurements.list(),
      hydrationLogs.list(),
    ])
    return aggregateFitnessAnalytics({
      workouts: workoutHistory,
      activities,
      meals: mealHistory,
      measurements,
      hydration,
    })
  },
  habits: {
    list: async () => (await privateList('fitness_habits', '*', 'updated_at')).map(camelize),
    create: async (habit) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(habitSchema, habit, 'Invalid habit')
      return camelize(await resultOf(client.from('fitness_habits').insert({
        user_id: user.id,
        name: item.name,
        category: item.category,
        schedule_days: item.scheduleDays,
        active: item.active,
        reminder: item.reminder,
      }).select('*').single()))
    },
    update: async (id, patch) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(habitSchema.partial(), patch, 'Invalid habit update')
      if (!Object.keys(item).length) throw new ApiError('Provide at least one habit field.', { code: 'INVALID_INPUT' })
      const columns = Object.fromEntries(Object.entries(item).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value]))
      return camelize(await resultOf(client.from('fitness_habits').update(columns)
        .eq('id', id).eq('user_id', user.id).select('*').single()))
    },
    remove: async (id) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      await resultOf(client.from('fitness_habits').delete().eq('id', id).eq('user_id', user.id))
    },
  },
  completeHabit: async (completion) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    const item = validateInput(habitCompletionSchema, completion, 'Invalid habit completion')
    const requestId = item.requestId || crypto.randomUUID()
    let saved
    let duplicate = false
    try {
      saved = await resultOf(client.from('habit_completions').insert({
        user_id: user.id,
        habit_id: item.habitId,
        completed_on: item.completedOn,
        client_request_id: requestId,
      }).select('*').single())
    } catch (error) {
      if (error.code !== '23505') throw error
      saved = await resultOf(client.from('habit_completions').select('*')
        .eq('user_id', user.id).eq('habit_id', item.habitId).eq('completed_on', item.completedOn).single())
      duplicate = true
    }
    return { item: camelize(saved), duplicate }
  },
  listHabitCompletions: async (habitId) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    return (await resultOf(client.from('habit_completions').select('*')
      .eq('user_id', user.id).eq('habit_id', habitId).order('completed_on', { ascending: false }))).map(camelize)
  },
  fasting: {
    list: async () => (await privateList('fasting_sessions', '*', 'started_at')).map(camelize),
    start: async (session) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(fastingSessionSchema, session, 'Invalid fasting session')
      const startedAt = item.startedAt || new Date().toISOString()
      const targetEndedAt = new Date(Date.parse(startedAt) + item.scheduleHours * 3600000).toISOString()
      try {
        return camelize(await resultOf(client.from('fasting_sessions').insert({
          user_id: user.id,
          schedule_hours: item.scheduleHours,
          started_at: startedAt,
          target_ended_at: targetEndedAt,
          status: 'active',
        }).select('*').single()))
      } catch (error) {
        if (error.code === '23505') throw new ApiError('An active fasting session already exists.', { code: 'FASTING_ALREADY_ACTIVE' })
        throw error
      }
    },
    finish: async (id, status = 'completed', endedAt = new Date().toISOString()) => {
      if (!['completed', 'cancelled'].includes(status)) throw new ApiError('Invalid fasting session status.', { code: 'INVALID_INPUT' })
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const saved = await resultOf(client.from('fasting_sessions').update({ status, ended_at: endedAt })
        .eq('id', id).eq('user_id', user.id).eq('status', 'active').select('*').maybeSingle())
      if (!saved) throw new ApiError('This fasting session is not active or could not be found.', { code: 'FASTING_SESSION_NOT_ACTIVE' })
      return camelize(saved)
    },
  },
  challenges: {
    list: async () => (await privateList('fitness_challenges', '*', 'started_on')).map(camelize),
    create: async (challenge) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(fitnessChallengeSchema, challenge, 'Invalid fitness challenge')
      return camelize(await resultOf(client.from('fitness_challenges').insert({
        user_id: user.id,
        name: item.name,
        goal: item.goal,
        duration_days: item.durationDays,
        schedule: item.schedule,
        started_on: item.startedOn,
        status: item.status,
      }).select('*').single()))
    },
    setStatus: async (id, status) => {
      if (!['active', 'paused', 'completed', 'cancelled'].includes(status)) throw new ApiError('Invalid challenge status.', { code: 'INVALID_INPUT' })
      await requireSignedInUser()
      const client = requireSupabase()
      return camelize(await resultOf(client.rpc('set_fitness_challenge_status', {
        p_challenge_id: id,
        p_status: status,
      })))
    },
    completeDay: async (completion) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(challengeCompletionSchema, completion, 'Invalid challenge completion')
      const challenge = await resultOf(client.from('fitness_challenges').select('duration_days,status')
        .eq('id', item.challengeId).eq('user_id', user.id).single())
      if (challenge.status !== 'active') throw new ApiError('Only active challenges can record a completion.', { code: 'CHALLENGE_NOT_ACTIVE' })
      if (item.challengeDay > challenge.duration_days) throw new ApiError('Challenge day exceeds its scheduled duration.', { code: 'INVALID_INPUT' })
      try {
        const saved = await resultOf(client.from('challenge_completions').insert({
          user_id: user.id,
          challenge_id: item.challengeId,
          challenge_day: item.challengeDay,
          completed_on: item.completedOn,
        }).select('*').single())
        return { item: camelize(saved), duplicate: false }
      } catch (error) {
        if (error.code !== '23505') throw error
        const saved = await resultOf(client.from('challenge_completions').select('*')
          .eq('user_id', user.id).eq('challenge_id', item.challengeId).eq('challenge_day', item.challengeDay).single())
        return { item: camelize(saved), duplicate: true }
      }
    },
    listCompletions: async (challengeId) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      return (await resultOf(client.from('challenge_completions').select('*')
        .eq('user_id', user.id).eq('challenge_id', challengeId).order('challenge_day', { ascending: true }))).map(camelize)
    },
  },
  workoutSessions: {
    list: async () => (await privateList('workout_session_states', '*', 'updated_at')).map(camelize),
    get: async (id) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      return camelize(await resultOf(client.from('workout_session_states').select('*')
        .eq('id', id).eq('user_id', user.id).maybeSingle()))
    },
    save: async (session) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      const item = validateInput(workoutSessionStateSchema, session, 'Invalid workout session state')
      if (new TextEncoder().encode(JSON.stringify({ plan: item.plan, state: item.state })).length > 262_144) {
        throw new ApiError('Workout session state exceeds the allowed size.', { code: 'INVALID_INPUT' })
      }
      return camelize(await resultOf(client.from('workout_session_states').upsert({
        id: item.id,
        user_id: user.id,
        plan: item.plan,
        state: item.state,
        status: item.status,
      }, { onConflict: 'id' }).select('*').single()))
    },
    remove: async (id) => {
      const user = await requireSignedInUser()
      const client = requireSupabase()
      await resultOf(client.from('workout_session_states').delete().eq('id', id).eq('user_id', user.id))
    },
  },
}

export const gameApi = {
  get: async () => {
    if (!hasSupabaseConfig) return { game: initialGame }
    const user = await getSignedInUser()
    if (!user) return { game: initialGame }
    const client = requireSupabase()
    const state = await resultOf(client.from('game_state').select('*').eq('user_id', user.id).maybeSingle())
    if (!state) return { game: initialGame }
    return { game: mapGame(state) }
  },
}
