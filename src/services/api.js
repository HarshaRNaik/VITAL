import { MOVEMENTS } from '../data/workouts'
import { z } from 'zod'
import { getSignedInUser, hasSupabaseConfig, requireSignedInUser, requireSupabase } from './supabase'

export class ApiError extends Error {
  constructor(message, { code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = undefined
    this.code = code
    this.details = details
  }
}

const initialGame = { totalXP: 0, streak: 0, lastActive: null, counts: {}, badges: [], chatToday: false }
const coachApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '')
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

function mapGame(row, chatToday = false) {
  if (!row) return initialGame
  return {
    totalXP: row.total_xp,
    streak: row.streak,
    lastActive: row.last_active,
    counts: row.counts || {},
    badges: row.badges || [],
    chatToday,
  }
}

function dateKeyInTimeZone(date, timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function assistantReply(userId, question) {
  if (!userId) {
    return "Sign in to ask about your personal activity. You can still explore workouts, nutrition, and progress screens."
  }

  const client = requireSupabase()
  const settings = await resultOf(client.from('user_settings').select('time_zone').eq('user_id', userId).maybeSingle())
  const today = dateKeyInTimeZone(new Date(), settings?.time_zone || 'UTC')
  const firstDay = new Date(`${today}T00:00:00.000Z`)
  firstDay.setUTCDate(firstDay.getUTCDate() - 6)
  const from = firstDay.toISOString().slice(0, 10)
  const [meals, workouts, metrics] = await Promise.all([
    resultOf(client.from('nutrition_logs').select('date,calories,protein')
      .eq('user_id', userId).gte('date', from).order('date', { ascending: true })),
    resultOf(client.from('workouts').select('calories')
      .eq('user_id', userId).gte('date', from)),
    resultOf(client.from('progress_metrics').select('date,weight_kg')
      .eq('user_id', userId).order('date', { ascending: true })),
  ])
  const recentMeals = meals.filter((meal) => meal.date >= from)
  const text = question.toLowerCase()

  if (text.includes('suggest') || text.includes('recommend')) {
    if (text.includes('workout') || text.includes('exercise')) {
      return workouts.length < 3
        ? `You've completed ${workouts.length} workout(s) this week. Consider a comfortable walk or a bodyweight routine from your workout library.`
        : `Great consistency with ${workouts.length} workouts this week. Consider a gentle mobility or recovery session.`
    }
    const loggedDays = Math.max(1, new Set(recentMeals.map((meal) => meal.date)).size)
    const averageProtein = recentMeals.reduce((total, meal) => total + meal.protein, 0) / loggedDays
    return averageProtein < 60
      ? `Your protein averages about ${Math.round(averageProtein)}g on days with meal logs. Consider adding a protein source that fits your preferences.`
      : `Your logged protein is averaging about ${Math.round(averageProtein)}g per logged day. A balanced meal can help you maintain that pattern.`
  }

  if (text.includes('calorie')) {
    if (!recentMeals.length) return "You haven't logged any meals in the last 7 days."
    const total = recentMeals.reduce((sum, meal) => sum + meal.calories, 0)
    return `You logged ${Math.round(total)} kcal over the last 7 days (about ${Math.round(total / 7)} per day).`
  }
  if (text.includes('workout') || text.includes('exercise')) {
    if (!workouts.length) return "No workouts are logged in the last 7 days. Choose a session from your workout library when you're ready."
    return `You logged ${workouts.length} workout(s) in the last 7 days. Calories are shown only when you entered or estimated them.`
  }
  if (text.includes('weight') || text.includes('progress')) {
    if (metrics.length < 2) return 'Log your weight at least twice and I can summarize the recorded change.'
    const first = metrics[0]
    const last = metrics.at(-1)
    return `Your recorded weight changed by ${(last.weight_kg - first.weight_kg).toFixed(1)} kg from ${first.date} to ${last.date} (latest: ${last.weight_kg} kg).`
  }
  return 'Try asking about your logged calories, workouts, weight progress, or ask for a workout or meal suggestion.'
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
    const validated = validateInput(gymWorkoutSchema, workout, 'Invalid gym workout')
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
  list: async () => MOVEMENTS,
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
    }).strict().refine((value) => Object.keys(value).length > 0, 'At least one settings field is required.')
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
  list: async () => (await privateList('workout_plans', '*,workout_plan_exercises(*)', 'updated_at')).map(mapWorkoutPlan),
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
    return { item: mapWorkoutPlan(camelize(saved)) }
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
    return { item: mapWorkoutPlan(camelize(saved)) }
  },
  remove: async (id) => {
    const user = await requireSignedInUser()
    const client = requireSupabase()
    await resultOf(client.from('workout_plans').delete().eq('id', id).eq('user_id', user.id))
  },
}

function mapWorkoutPlan(row) {
  const { workoutPlanExercises = [], ...plan } = camelize(row)
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

export const gameApi = {
  get: async () => {
    if (!hasSupabaseConfig) return { game: initialGame }
    const user = await getSignedInUser()
    if (!user) return { game: initialGame }
    const client = requireSupabase()
    const [state, settings] = await Promise.all([
      resultOf(client.from('game_state').select('*').eq('user_id', user.id).maybeSingle()),
      resultOf(client.from('user_settings').select('time_zone').eq('user_id', user.id).maybeSingle()),
    ])
    if (!state) return { game: initialGame }
    const today = dateKeyInTimeZone(new Date(), settings?.time_zone || 'UTC')
    const reward = await resultOf(client.from('game_rewards').select('id').eq('user_id', user.id).eq('idempotency_key', `chat:${today}`).maybeSingle())
    return { game: mapGame(state, Boolean(reward)) }
  },
  rewardChat: async () => createReward('chat', dateKeyInTimeZone(new Date())),
}

export const assistantApi = {
  listConversations: async () => privateList('assistant_conversations', '*', 'updated_at').then((items) => items.map(camelize)),
  createConversation: async () => {
    if (!hasSupabaseConfig || !(await getSignedInUser())) return { id: 'guest', title: 'New conversation', messages: [] }
    const client = requireSupabase()
    return camelize(await resultOf(client.rpc('create_assistant_conversation')))
  },
  getConversation: async (id) => {
    if (id === 'guest') return { id, title: 'New conversation', messages: [] }
    const user = await requireSignedInUser()
    const client = requireSupabase()
    const conversation = await resultOf(client.from('assistant_conversations').select('*').eq('id', id).eq('user_id', user.id).single())
    const messages = await resultOf(client.from('assistant_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }))
    return { ...camelize(conversation), messages: messages.map(camelize) }
  },
  sendMessage: async (id, content, requestId = crypto.randomUUID()) => {
    const validatedContent = validateInput(z.string().trim().min(1).max(500), content, 'Invalid message')
    const user = hasSupabaseConfig ? await getSignedInUser() : null
    if (id === 'guest' || !user) {
      return {
        userMessage: { id: requestId, role: 'user', content: validatedContent },
        assistantMessage: { id: `${requestId}-reply`, role: 'assistant', content: await assistantReply(null, validatedContent) },
        game: null,
        duplicate: false,
      }
    }
    const client = requireSupabase()
    const existing = await resultOf(client.from('assistant_messages').select('*')
      .eq('conversation_id', id).eq('client_request_id', requestId).eq('role', 'user').maybeSingle())
    if (existing) {
      const assistantMessage = await resultOf(client.from('assistant_messages').select('*')
        .eq('conversation_id', id).eq('client_request_id', requestId).eq('role', 'assistant').single())
      return {
        userMessage: camelize(existing),
        assistantMessage: camelize(assistantMessage),
        game: await createReward('chat', dateKeyInTimeZone(new Date())),
        duplicate: true,
      }
    }

    let response
    if (coachApiBase) {
      const { data: { session }, error: sessionError } = await requireSupabase().auth.getSession()
      if (sessionError) throw sessionError
      if (!session?.access_token) throw new ApiError('Please sign in again to use the Coach.', { code: 'AUTH_REQUIRED' })
      let coachResponse
      try {
        coachResponse = await fetch(`${coachApiBase}/api/coach/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ content: validatedContent }),
        })
      } catch {
        throw new ApiError('The Coach service could not be reached. Please try again shortly.', { code: 'COACH_UNAVAILABLE' })
      }
      const body = await coachResponse.json().catch(() => ({}))
      if (!coachResponse.ok) {
        throw new ApiError(body?.error?.message || 'The Coach could not answer right now.', {
          code: body?.error?.code || 'COACH_UNAVAILABLE',
        })
      }
      response = body.text
      if (typeof response !== 'string' || !response.trim()) {
        throw new ApiError('The Coach returned an empty response. Please try again.', { code: 'COACH_UNAVAILABLE' })
      }
    } else if (import.meta.env.PROD) {
      throw new ApiError('The Coach service is not configured for this deployment.', { code: 'COACH_NOT_CONFIGURED' })
    } else {
      response = await assistantReply(user.id, validatedContent)
    }
    const saved = await resultOf(client.rpc('save_assistant_exchange', {
      p_conversation_id: id,
      p_request_id: requestId,
      p_user_content: validatedContent,
      p_assistant_content: response,
    }))
    return {
      userMessage: camelize(saved.userMessage),
      assistantMessage: camelize(saved.assistantMessage),
      game: saved.game,
      duplicate: saved.duplicate,
    }
  },
}
