import { describe, expect, it } from 'vitest'
import {
  completeWorkoutSet,
  completedPerformedSets,
  createWorkoutSession,
  matchExercises,
  pauseWorkoutSession,
  recommendProgression,
  restoreWorkoutProgress,
  resumeWorkoutSession,
  sequenceExercises,
  skipWorkoutExercise,
  skipWorkoutRest,
  startWorkoutSession,
  tickWorkoutSession,
} from './workout-engine'

const movements = [
  { id: 'squat', name: 'Bodyweight squat', focus: 'Legs and glutes', equipment: 'Bodyweight only', tracking: 'reps', defaultReps: 10 },
  { id: 'db-squat', name: 'Dumbbell squat', focus: 'Legs', equipment: 'Dumbbells', tracking: 'reps', defaultReps: 10 },
  { id: 'plank', name: 'Forearm plank', focus: 'Core', equipment: 'Bodyweight only', tracking: 'timed', defaultSeconds: 30 },
]

describe('workout engine', () => {
  it('matches exercises by focus and available equipment without duplicates', () => {
    expect(matchExercises({ movements, focus: 'legs', equipment: [], limit: 10 }).map((item) => item.id))
      .toEqual(['squat'])
    expect(matchExercises({ movements, focus: 'legs', equipment: ['Dumbbells'], limit: 10 }).map((item) => item.id))
      .toEqual(['db-squat', 'squat'])
  })

  it('sequences exercises with level-appropriate volume and tracking units', () => {
    expect(sequenceExercises([
      { ...movements[0], sets: 5, reps: 12 },
      { ...movements[2], sets: 4, durationSeconds: 30 },
    ], { difficulty: 'Beginner' })).toMatchObject([
      { sequence: 1, sets: 2, reps: 12, durationSeconds: null, restSeconds: 75 },
      { sequence: 2, sets: 2, reps: null, durationSeconds: 30, restSeconds: 75 },
    ])
  })

  it('does not automatically progress difficulty when user approval or recovery is missing', () => {
    expect(recommendProgression({ difficulty: 'Beginner', completedSessions: 6, recovery: 'good' }).eligible).toBe(false)
    expect(recommendProgression({ difficulty: 'Beginner', completedSessions: 6, recovery: 'good', userApproved: true }).eligible).toBe(true)
    expect(recommendProgression({ difficulty: 'Advanced', completedSessions: 10, recovery: 'good', userApproved: true }).eligible).toBe(false)
  })

  it('tracks sets, rest intervals, pauses, and completed status deterministically', () => {
    const plan = { id: 'plan-a', exercises: [
      { id: 'squat', sets: 2, reps: 10, restSeconds: 30 },
      { id: 'plank', sets: 1, durationSeconds: 10, tracking: 'timed', restSeconds: 0 },
    ] }
    let session = createWorkoutSession(plan, { sessionId: 'session-a', now: 0 })
    session = startWorkoutSession(session, { now: 1000 })
    session = completeWorkoutSet(session, plan, { now: 2000 })
    expect(session).toMatchObject({ status: 'resting', exerciseIndex: 0, setNumber: 2, restSeconds: 30 })
    session = pauseWorkoutSession(session, { now: 3000 })
    session = resumeWorkoutSession(session, { now: 4000 })
    session = skipWorkoutRest(session, { now: 5000 })
    session = completeWorkoutSet(session, plan, { now: 6000 })
    expect(session).toMatchObject({ status: 'resting', exerciseIndex: 1, timerSeconds: 10 })
    session = skipWorkoutRest(session, { now: 7000 })
    session = tickWorkoutSession(session, 10, { now: 16000 })
    expect(session.status).toBe('paused')
    session = resumeWorkoutSession(session, { now: 17000 })
    session = completeWorkoutSet(session, plan, { now: 18000 })
    expect(session).toMatchObject({ status: 'completed', completedSets: ['0:1', '0:2', '1:1'] })
  })

  it('supports previous and next exercise navigation without changing completed-set history', () => {
    const plan = { exercises: movements.map((item) => ({ ...item, sets: 1, durationSeconds: item.defaultSeconds || null })) }
    let session = startWorkoutSession(createWorkoutSession(plan, { sessionId: 'session-b' }))
    session = skipWorkoutExercise(session, plan, 1)
    expect(session.exerciseIndex).toBe(1)
    session = skipWorkoutExercise(session, plan, -1)
    expect(session.exerciseIndex).toBe(0)
    expect(session.completedSets).toEqual([])
  })

  it('records only the sets actually completed in the guided workout', () => {
    const exercises = [
      { id: 'squat', name: 'Squat', sets: 2, reps: 10, tracking: 'reps', restSeconds: 30 },
      { id: 'plank', name: 'Plank', sets: 1, durationSeconds: 20, tracking: 'timed', restSeconds: 0 },
    ]
    expect(completedPerformedSets(exercises, ['0-squat-1', '1-plank-1'], new Set(['squat'])))
      .toEqual([
        { exerciseId: 'squat', exerciseSequence: 1, exerciseName: 'Squat', setNumber: 1, reps: 10, restSeconds: 30 },
        { exerciseId: null, exerciseSequence: 2, exerciseName: 'Plank', setNumber: 1, durationSeconds: 20, restSeconds: 0 },
      ])
  })

  it('restores validated session progress and ignores unknown completed-set keys', () => {
    const recovery = {
      plan: { id: 'plan-a' },
      status: 'running',
      state: {
        index: 1,
        setNumber: 1,
        status: 'paused',
        secondsLeft: 50000,
        restLeft: -1,
        elapsedSeconds: 120,
        completedSets: ['0-squat-1', 'invalid-key'],
      },
    }
    expect(restoreWorkoutProgress(recovery, { planId: 'plan-a', exercises: [
      { id: 'squat', sets: 2, durationSeconds: 0 },
      { id: 'plank', sets: 1, durationSeconds: 10 },
    ] })).toEqual({
      index: 1,
      setNumber: 1,
      status: 'paused',
      secondsLeft: 50000,
      restLeft: 0,
      elapsedSeconds: 120,
      completedSets: ['0-squat-1'],
    })
    expect(() => restoreWorkoutProgress(recovery, { planId: 'different-plan', exercises: movements }))
      .toThrow(RangeError)
  })

  it('rejects invalid plans and invalid timer updates', () => {
    expect(() => createWorkoutSession({ exercises: [] }, { sessionId: 'session-c' })).toThrow()
    expect(() => tickWorkoutSession({ status: 'running', elapsedSeconds: 0 }, -1)).toThrow(RangeError)
  })
})
