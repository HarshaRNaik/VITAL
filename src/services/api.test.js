import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getSignedInUser: vi.fn(),
  requireSignedInUser: vi.fn(),
  requireSupabase: vi.fn(),
}))

vi.mock('./supabase', () => ({
  hasSupabaseConfig: true,
  getSignedInUser: authMocks.getSignedInUser,
  requireSignedInUser: authMocks.requireSignedInUser,
  requireSupabase: authMocks.requireSupabase,
}))

describe('Supabase activity API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.getSignedInUser.mockResolvedValue(null)
    authMocks.requireSignedInUser.mockRejectedValue(Object.assign(
      new Error('Sign in or create an account to save private data.'),
      { code: 'AUTH_REQUIRED' },
    ))
  })

  it('returns no private activity for an unauthenticated visitor', async () => {
    const { meals, metrics, workouts, gymWorkouts } = await import('./api')

    await expect(meals.list()).resolves.toEqual([])
    await expect(metrics.list()).resolves.toEqual([])
    await expect(workouts.list()).resolves.toEqual([])
    await expect(gymWorkouts.list()).resolves.toEqual([])
    expect(authMocks.getSignedInUser).toHaveBeenCalledTimes(4)
  })

  it('requires sign-in before writing private records', async () => {
    const { meals, metrics, workouts } = await import('./api')

    await expect(meals.add({ name: 'Breakfast', calories: 400, date: '2026-10-25' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(metrics.add({ weight: 70, date: '2026-10-25' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(workouts.add({ name: 'Strength', type: 'Guided', duration: 10, date: '2026-10-25' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('persists completed workouts and their exercise sets through the database transaction', async () => {
    const user = { id: 'user-a' }
    const result = {
      item: {
        id: 'workout-a',
        user_id: user.id,
        name: 'Strength session',
        date: '2026-10-25',
        workout_sets: [{
          id: 'set-a',
          exercise_name: 'Squat',
          set_number: 1,
          reps: 8,
        }],
      },
      game: { totalXP: 25, streak: 1, badges: [] },
      duplicate: false,
    }
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null })
    authMocks.requireSignedInUser.mockResolvedValue(user)
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { workouts } = await import('./api')
    const sessionId = 'session-request-123'

    await expect(workouts.add({
      sessionId,
      type: 'Guided',
      name: 'Strength session',
      duration: 12,
      date: '2026-10-25',
      performedSets: [{
        exerciseId: 'bar-squat',
        exerciseSequence: 1,
        exerciseName: 'Squat',
        setNumber: 1,
        reps: 8,
        restSeconds: 45,
      }],
    })).resolves.toMatchObject({
      item: { id: 'workout-a', sets: [{ exerciseName: 'Squat', setNumber: 1 }] },
      game: result.game,
      duplicate: false,
    })

    expect(rpc).toHaveBeenCalledWith('record_completed_workout', {
      p_item: expect.objectContaining({
        session_id: sessionId,
        client_request_id: sessionId,
        performed_sets: [expect.objectContaining({
          exercise_id: 'bar-squat',
          exercise_sequence: 1,
          exercise_name: 'Squat',
          set_number: 1,
        })],
      }),
    })
  })

  it('accepts valid manually logged workouts without an exercise-set list', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn().mockResolvedValue({
      data: {
        item: { id: 'workout-manual', name: 'Morning walk', workout_sets: [] },
        game: { totalXP: 25 },
        duplicate: false,
      },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { workouts } = await import('./api')

    await expect(workouts.add({
      type: 'Cardio',
      name: 'Morning walk',
      duration: 30,
      date: '2026-10-25',
    })).resolves.toMatchObject({ item: { id: 'workout-manual', name: 'Morning walk' } })
    expect(rpc).toHaveBeenCalledWith('record_completed_workout', {
      p_item: expect.objectContaining({ performed_sets: [] }),
    })
  })

  it('uses the atomic workout-update RPC and validates the patch', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: 'workout-a',
        name: 'Updated workout',
        workout_sets: [{ id: 'set-b', exercise_name: 'Squat', set_number: 1, reps: 12 }],
      },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { workouts } = await import('./api')

    await expect(workouts.update('workout-a', {
      name: ' Updated workout ',
      performedSets: [{
        exerciseName: 'Squat',
        setNumber: 1,
        reps: 12,
        restSeconds: 30,
      }],
    })).resolves.toMatchObject({
      item: { name: 'Updated workout', sets: [{ exerciseName: 'Squat', reps: 12 }] },
    })
    expect(rpc).toHaveBeenCalledWith('update_completed_workout', {
      p_workout_id: 'workout-a',
      p_item: {
        name: 'Updated workout',
        performed_sets: [{
          exercise_id: null,
          exercise_sequence: null,
          exercise_name: 'Squat',
          set_number: 1,
          reps: 12,
          weight_kg: null,
          duration_seconds: null,
          rest_seconds: 30,
        }],
      },
    })
    await expect(workouts.update('workout-a', { duration: -1 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('persists custom workout plans with one atomic RPC', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: 'plan-a',
        name: 'Strength plan',
        workout_plan_exercises: [{
          exercise_id: 'bar-squat',
          sequence: 0,
          sets: 3,
          reps: 8,
        }],
      },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { workoutPlans } = await import('./api')

    await expect(workoutPlans.create({
      name: 'Strength plan',
      category: 'Strength',
      difficulty: 'Beginner',
      exercises: [{ exerciseId: 'bar-squat', sequence: 0, sets: 3, reps: 8 }],
    })).resolves.toMatchObject({
      item: { id: 'plan-a', exercises: [{ exerciseId: 'bar-squat', sequence: 0 }] },
    })
    expect(rpc).toHaveBeenCalledWith('save_workout_plan', expect.objectContaining({
      p_plan_id: null,
      p_item: expect.objectContaining({
        name: 'Strength plan',
        exercises: [expect.objectContaining({ exercise_id: 'bar-squat', sequence: 0 })],
      }),
    }))
  })

  it('saves gym workout drafts and completes them through the user-scoped reward RPC', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const id = '7d78d59d-5179-40ad-9565-4e268328c225'
    const rpc = vi.fn().mockResolvedValue({
      data: {
        item: { id, status: 'COMPLETED', exercises: [] },
        game: { totalXP: 25, streak: 1, badges: [] },
        duplicate: false,
      },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { gymWorkouts } = await import('./api')
    const workout = {
      name: 'Push day',
      status: 'COMPLETED',
      unit: 'kg',
      startedAt: '2026-10-25T10:00:00.000Z',
      durationSeconds: 1800,
      exercises: [{
        exerciseId: 'db-floor-press',
        exerciseName: 'Dumbbell floor press',
        focus: 'Chest and triceps',
        equipment: 'Dumbbells',
        sequence: 0,
        notes: '',
        sets: [{
          setNumber: 1,
          weightKg: 20,
          reps: 10,
          rpe: 8,
          setType: 'WORKING',
          completed: true,
          notes: '',
        }],
      }],
    }

    await expect(gymWorkouts.save(id, workout)).resolves.toMatchObject({
      item: { id, status: 'COMPLETED' },
      duplicate: false,
    })
    expect(rpc).toHaveBeenCalledWith('save_gym_workout', {
      p_workout_id: id,
      p_item: expect.objectContaining({
        status: 'COMPLETED',
        unit: 'kg',
        exercises: [expect.objectContaining({
          exercise_id: 'db-floor-press',
          sets: [expect.objectContaining({
            weight_kg: 20,
            set_type: 'WORKING',
            completed: true,
          })],
        })],
      }),
    })
    await expect(gymWorkouts.save(id, { ...workout, unit: 'stone' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('cancels only active gym sessions and persists gym-only workout templates', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: {
          id: '7d78d59d-5179-40ad-9565-4e268328c225',
          user_id: 'user-a',
          name: 'Upper body',
          exercises: [{ exercise_id: 'db-floor-press', sets: 3, reps: 10, rest_seconds: 90 }],
        },
        error: null,
      })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { gymWorkouts, gymWorkoutTemplates } = await import('./api')

    await expect(gymWorkouts.cancel('7d78d59d-5179-40ad-9565-4e268328c225')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('cancel_gym_workout', {
      p_workout_id: '7d78d59d-5179-40ad-9565-4e268328c225',
    })
    await expect(gymWorkoutTemplates.save(null, {
      name: 'Upper body',
      exercises: [{ exerciseId: 'db-floor-press', sets: 3, reps: 10, restSeconds: 90 }],
    })).resolves.toMatchObject({
      userId: 'user-a',
      exercises: [{ exerciseId: 'db-floor-press', restSeconds: 90 }],
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_gym_workout_template', {
      p_template_id: null,
      p_item: {
        name: 'Upper body',
        exercises: [{ exercise_id: 'db-floor-press', sets: 3, reps: 10, rest_seconds: 90 }],
      },
    })
    await expect(gymWorkoutTemplates.save(null, {
      name: 'Empty template',
      exercises: [],
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('reuses an activity request ID across retries and rejects invalid activity input', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { item: { id: 'meal-a', name: 'Breakfast' }, game: { totalXP: 10 }, duplicate: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { item: { id: 'meal-a', name: 'Breakfast' }, game: { totalXP: 10 }, duplicate: true },
        error: null,
      })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { meals } = await import('./api')
    const item = {
      name: 'Breakfast',
      type: 'Breakfast',
      calories: 400,
      date: '2026-10-25',
      requestId: 'meal-retry-101',
    }

    await meals.add(item)
    await meals.add(item)
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_nutrition_log', {
      p_item: expect.objectContaining({ client_request_id: 'meal-retry-101' }),
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_nutrition_log', {
      p_item: expect.objectContaining({ client_request_id: 'meal-retry-101' }),
    })
    await expect(meals.add({ ...item, calories: -1 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('persists assistant conversations through the rate-limited RPC', async () => {
    authMocks.getSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'conversation-a', title: 'New conversation' },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { assistantApi } = await import('./api')

    await expect(assistantApi.createConversation()).resolves.toMatchObject({ id: 'conversation-a' })
    expect(rpc).toHaveBeenCalledWith('create_assistant_conversation')

    rpc.mockResolvedValueOnce({ data: { rateLimited: true }, error: null })
    await expect(assistantApi.createConversation()).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('fails closed when Supabase session retrieval fails', async () => {
    authMocks.getSignedInUser.mockRejectedValue(new Error('Session refresh failed'))
    authMocks.requireSignedInUser.mockImplementation(async () => {
      const user = await authMocks.getSignedInUser()
      if (!user) throw Object.assign(new Error('Authentication required'), { code: 'AUTH_REQUIRED' })
      return user
    })
    const { meals } = await import('./api')

    await expect(meals.list()).rejects.toThrow('Session refresh failed')
    await expect(meals.add({
      name: 'Breakfast',
      type: 'Breakfast',
      calories: 400,
      date: '2026-10-25',
    })).rejects.toThrow('Session refresh failed')
  })

  it('serves the local exercise catalogue without requiring a database session', async () => {
    const { exerciseApi } = await import('./api')

    await expect(exerciseApi.list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'db-goblet-squat', animationSrc: expect.stringContaining('.gif') }),
    ]))
    expect(authMocks.getSignedInUser).not.toHaveBeenCalled()
  })
})
