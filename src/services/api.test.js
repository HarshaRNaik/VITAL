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

  it('requires macro targets to be saved as a complete set', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const from = vi.fn()
    authMocks.requireSupabase.mockReturnValue({ from })
    const { settingsApi } = await import('./api')

    await expect(settingsApi.update({ proteinTargetGrams: 120 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(from).not.toHaveBeenCalled()
  })

  it('requires sign-in for new fitness tracking and resumable session writes', async () => {
    const { fitnessTrackingApi } = await import('./api')
    await expect(fitnessTrackingApi.bodyMeasurements.add({ measurementType: 'waist', value: 80, unit: 'cm', measuredOn: '2026-10-25' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fitnessTrackingApi.activitySessions.add({
      activityType: 'walking', source: 'manual', startedAt: '2026-10-25T10:00:00Z',
      endedAt: '2026-10-25T10:30:00Z', durationSeconds: 1800, date: '2026-10-25',
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fitnessTrackingApi.hydrationLogs.add({ amountMl: 300, date: '2026-10-25' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fitnessTrackingApi.habits.create({ name: 'Walk', category: 'walking' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fitnessTrackingApi.fasting.start({ scheduleHours: 16 }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(fitnessTrackingApi.workoutSessions.save({
      id: '550e8400-e29b-41d4-a716-446655440000',
      plan: { id: 'plan' }, state: { status: 'ready' }, status: 'ready',
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('validates activity timing before database writes', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const from = vi.fn()
    authMocks.requireSupabase.mockReturnValue({ from })
    const { fitnessTrackingApi } = await import('./api')

    await expect(fitnessTrackingApi.activitySessions.add({
      activityType: 'walking',
      source: 'manual',
      startedAt: '2026-10-25T10:30:00Z',
      endedAt: '2026-10-25T10:00:00Z',
      durationSeconds: 1800,
      date: '2026-10-25',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects unverified device sources and pace values outside database bounds', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const from = vi.fn()
    authMocks.requireSupabase.mockReturnValue({ from })
    const { fitnessTrackingApi } = await import('./api')

    await expect(fitnessTrackingApi.activitySessions.add({
      activityType: 'walking',
      source: 'device',
      startedAt: '2026-10-25T10:00:00Z',
      endedAt: '2026-10-25T10:01:00Z',
      durationSeconds: 60,
      distanceKm: 1,
      date: '2026-10-25',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(fitnessTrackingApi.activitySessions.add({
      activityType: 'walking',
      source: 'manual',
      startedAt: '2026-10-25T10:00:00Z',
      endedAt: '2026-11-01T10:00:00Z',
      durationSeconds: 604800,
      distanceKm: 0.01,
      date: '2026-10-25',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(from).not.toHaveBeenCalled()
  })

  it('derives activity pace and speed before persisting a validated session', async () => {
    const user = { id: 'user-a' }
    const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn() }
    query.insert.mockReturnValue(query)
    query.select.mockReturnValue(query)
    query.single.mockResolvedValue({
      data: { id: 'activity-a', user_id: user.id, distance_km: 5, duration_seconds: 1500, recorded_on: '2026-10-25' },
      error: null,
    })
    authMocks.requireSignedInUser.mockResolvedValue(user)
    const from = vi.fn(() => query)
    authMocks.requireSupabase.mockReturnValue({ from })
    const { fitnessTrackingApi } = await import('./api')

    await expect(fitnessTrackingApi.activitySessions.add({
      activityType: 'running',
      source: 'manual',
      startedAt: '2026-10-25T10:00:00Z',
      endedAt: '2026-10-25T10:25:00Z',
      durationSeconds: 1500,
      distanceKm: 5,
      date: '2026-10-25',
      requestId: 'activity-request-123',
    })).resolves.toMatchObject({ item: { id: 'activity-a', date: '2026-10-25' }, duplicate: false })
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      activity_type: 'running',
      pace_seconds_per_km: 300,
      speed_kph: 12,
      client_request_id: 'activity-request-123',
    }))
  })

  it('persists challenge status transitions through the owner-checked RPC', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'challenge-a', user_id: 'user-a', status: 'paused', status_history: [{ from: 'active', to: 'paused' }] },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { fitnessTrackingApi } = await import('./api')

    await expect(fitnessTrackingApi.challenges.setStatus('challenge-a', 'paused'))
      .resolves.toMatchObject({ id: 'challenge-a', status: 'paused', statusHistory: [{ from: 'active', to: 'paused' }] })
    expect(rpc).toHaveBeenCalledWith('set_fitness_challenge_status', {
      p_challenge_id: 'challenge-a',
      p_status: 'paused',
    })
  })

  it('persists completed workouts and their exercise sets through the database transaction', async () => {
    const user = { id: 'user-a' }
    const result = {
      item: {
        id: 'workout-a',
        user_id: user.id,
        name: 'Strength session',
        date: '2026-10-25',
        workout_sets: Array.from({ length: 8 }, (_, index) => ({
          id: `set-${index + 1}`,
          exercise_name: `Movement ${index + 1}`,
          exercise_sequence: index + 1,
          set_number: 1,
          reps: 8,
        })),
      },
      game: { totalXP: 25, streak: 1, badges: [] },
      duplicate: false,
    }
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null })
    authMocks.requireSignedInUser.mockResolvedValue(user)
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { workouts } = await import('./api')
    const sessionId = 'session-request-123'

    const savedWorkout = await workouts.add({
      sessionId,
      type: 'Guided',
      name: 'Strength session',
      duration: 12,
      date: '2026-10-25',
      performedSets: Array.from({ length: 8 }, (_, index) => ({
        exerciseId: `movement-${index + 1}`,
        exerciseSequence: index + 1,
        exerciseName: `Movement ${index + 1}`,
        setNumber: 1,
        reps: 8,
        restSeconds: 45,
      })),
    })
    expect(savedWorkout).toMatchObject({
      item: { id: 'workout-a' },
      game: result.game,
      duplicate: false,
    })
    expect(savedWorkout.item.sets).toHaveLength(8)
    expect(savedWorkout.item.sets[7]).toMatchObject({ exerciseName: 'Movement 8', exerciseSequence: 8, setNumber: 1 })

    expect(rpc).toHaveBeenCalledWith('record_completed_workout', {
      p_item: expect.objectContaining({
        session_id: sessionId,
        client_request_id: sessionId,
        performed_sets: expect.arrayContaining([expect.objectContaining({
          exercise_id: 'movement-1',
          exercise_sequence: 1,
          exercise_name: 'Movement 1',
          set_number: 1,
        })]),
      }),
    })
    expect(rpc.mock.calls[0][1].p_item.performed_sets).toHaveLength(8)
  })

  it('reloads all eight performed movements from workout history', async () => {
    const user = { id: 'user-a' }
    const rows = [{
      id: 'workout-long',
      user_id: user.id,
      name: 'Eight movement session',
      date: '2026-10-25',
      workout_sets: Array.from({ length: 8 }, (_, index) => ({
        id: `set-${index + 1}`,
        exercise_name: `Movement ${index + 1}`,
        exercise_sequence: index + 1,
        set_number: 1,
        reps: 8,
      })),
    }]
    const query = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.range.mockResolvedValue({ data: rows, error: null })
    authMocks.getSignedInUser.mockResolvedValue(user)
    authMocks.requireSignedInUser.mockResolvedValue(user)
    authMocks.requireSupabase.mockReturnValue({ from: vi.fn(() => query) })
    const { workouts } = await import('./api')

    const history = await workouts.list()
    expect(history[0].sets).toHaveLength(8)
    expect(history[0].sets.map((set) => set.exerciseSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
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

  it('accepts a matching workout id from the editor and rejects a mismatched id', async () => {
    authMocks.requireSignedInUser.mockResolvedValue({ id: 'user-a' })
    const id = '7d78d59d-5179-40ad-9565-4e268328c225'
    const rpc = vi.fn().mockResolvedValue({
      data: { item: { id, status: 'IN_PROGRESS', exercises: [] }, game: null, duplicate: false },
      error: null,
    })
    authMocks.requireSupabase.mockReturnValue({ rpc })
    const { gymWorkouts } = await import('./api')
    const workout = {
      id,
      name: 'Push day',
      status: 'IN_PROGRESS',
      unit: 'kg',
      startedAt: '2026-10-25T10:00:00.000Z',
      durationSeconds: 0,
      exercises: [],
    }

    await expect(gymWorkouts.save(id, workout)).resolves.toMatchObject({ item: { id } })
    expect(rpc).toHaveBeenCalledTimes(1)
    await expect(gymWorkouts.save('8d78d59d-5179-40ad-9565-4e268328c225', workout))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(rpc).toHaveBeenCalledTimes(1)
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
