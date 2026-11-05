const LEVEL_LIMITS = Object.freeze({
  Beginner: { maxSets: 2, baseRestSeconds: 75 },
  Intermediate: { maxSets: 3, baseRestSeconds: 60 },
  Advanced: { maxSets: 4, baseRestSeconds: 45 },
})

const GOAL_TERMS = Object.freeze({
  chest: ['chest', 'pectorals'],
  back: ['back', 'lats'],
  shoulders: ['shoulder', 'deltoid'],
  biceps: ['biceps', 'upper arms'],
  triceps: ['triceps', 'upper arms'],
  arms: ['arms', 'biceps', 'triceps', 'forearms', 'upper arms', 'lower arms'],
  abs: ['abs', 'abdominals', 'waist'],
  core: ['core', 'abs', 'abdominals', 'waist'],
  legs: ['legs', 'quadriceps', 'hamstrings', 'calves', 'upper legs', 'lower legs'],
  glutes: ['glutes', 'gluteals', 'hips'],
  cardio: ['cardio', 'cardiovascular'],
  yoga: ['yoga', 'mobility', 'flexibility', 'stretching'],
  full_body: ['full body', 'chest', 'back', 'shoulders', 'legs', 'core'],
})

function normalized(value) {
  return String(value || '').trim().toLowerCase()
}

function movementText(movement) {
  return [
    movement.name,
    movement.focus,
    movement.target,
    movement.bodyPart,
    movement.body_part,
    movement.muscleGroup,
    movement.muscle_group,
    ...(movement.secondaryMuscles || movement.secondary_muscles || []),
    movement.category,
  ].map(normalized).join(' ')
}

function equipmentMatches(movement, availableEquipment) {
  const required = normalized(movement.equipment)
  if (!required || /body ?weight|no equipment|none/.test(required)) return true
  const available = availableEquipment.map(normalized)
  return available.some((item) => item && (required.includes(item) || item.includes(required)))
}

export function matchExercises({
  movements,
  focus = 'full_body',
  equipment = [],
  excludeIds = [],
  limit = 12,
}) {
  if (!Array.isArray(movements)) throw new TypeError('Movements must be an array.')
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Limit must be between 1 and 100.')
  const terms = GOAL_TERMS[normalized(focus)] || [normalized(focus)]
  const excluded = new Set(excludeIds)
  const candidates = movements
    .filter((movement) => movement && typeof movement.id === 'string' && !excluded.has(movement.id))
    .filter((movement) => equipmentMatches(movement, equipment))
    .map((movement) => {
      const text = movementText(movement)
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0)
      return { movement, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.movement.id.localeCompare(right.movement.id))
  const seen = new Set()
  return candidates.filter(({ movement }) => {
    const key = normalized(movement.name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, limit).map(({ movement }) => movement)
}

export function sequenceExercises(movements, { difficulty = 'Beginner', restSeconds, firstSequence = 0 } = {}) {
  const level = LEVEL_LIMITS[difficulty]
  if (!level) throw new RangeError('Difficulty must be Beginner, Intermediate, or Advanced.')
  if (!Array.isArray(movements) || movements.some((movement) => !movement?.id)) {
    throw new TypeError('Every exercise must have an ID.')
  }
  const rest = restSeconds ?? level.baseRestSeconds
  if (!Number.isInteger(rest) || rest < 0 || rest > 3600) throw new RangeError('Rest must be between 0 and 3600 seconds.')
  return movements.map((movement, index) => {
    const timed = movement.tracking === 'timed' || Number(movement.durationSeconds) > 0 && !movement.reps
    return {
      ...movement,
      sequence: firstSequence + index + 1,
      sets: Math.min(Number.isInteger(movement.sets) && movement.sets > 0 ? movement.sets : 1, level.maxSets),
      reps: timed ? null : Number(movement.reps || movement.defaultReps || 10),
      durationSeconds: timed ? Number(movement.durationSeconds || movement.defaultSeconds || 30) : null,
      restSeconds: Number.isInteger(movement.restSeconds) ? movement.restSeconds : rest,
    }
  })
}

export function recommendProgression({ difficulty, completedSessions, recovery, userApproved = false }) {
  if (!LEVEL_LIMITS[difficulty]) throw new RangeError('Unsupported difficulty.')
  if (!Number.isInteger(completedSessions) || completedSessions < 0) throw new RangeError('Completed sessions must be a non-negative integer.')
  if (recovery !== 'good' || !userApproved || completedSessions < 4 || difficulty === 'Advanced') {
    return { eligible: false, recommendation: 'Maintain the current workload and review recovery before changing difficulty.' }
  }
  return {
    eligible: true,
    recommendation: difficulty === 'Beginner'
      ? 'Consider moving to Intermediate after confirming the current workload feels manageable.'
      : 'Consider adding one repetition or a small amount of load to one exercise, not both.',
  }
}

export function createWorkoutSession(plan, { sessionId, now = Date.now() } = {}) {
  if (!plan || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
    throw new TypeError('A workout plan with at least one exercise is required.')
  }
  if (!sessionId || typeof sessionId !== 'string') throw new TypeError('A workout session ID is required.')
  return {
    id: sessionId,
    planId: plan.id || null,
    status: 'ready',
    exerciseIndex: 0,
    setNumber: 1,
    completedSets: [],
    elapsedSeconds: 0,
    timerSeconds: Number(plan.exercises[0].durationSeconds) || 0,
    restSeconds: 0,
    startedAt: null,
    updatedAt: new Date(now).toISOString(),
  }
}

export function restoreWorkoutProgress(recovery, { planId, exercises }) {
  const state = recovery?.state
  const index = Number(state?.index)
  const setNumber = Number(state?.setNumber)
  if (recovery?.plan?.id !== planId || !Array.isArray(exercises)
    || !['ready', 'running', 'paused'].includes(recovery.status)
    || !Number.isInteger(index) || index < 0 || index >= exercises.length
    || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > exercises[index].sets
    || !['ready', 'running', 'paused', 'rest', 'restPaused'].includes(state.status)) {
    throw new RangeError('Saved workout progress does not match the workout plan.')
  }
  const validKeys = new Set(exercises.flatMap((exercise, exerciseIndex) => (
    Array.from({ length: exercise.sets }, (_, setIndex) => `${exerciseIndex}-${exercise.id}-${setIndex + 1}`)
  )))
  const completedSets = Array.isArray(state.completedSets)
    ? state.completedSets.filter((key) => typeof key === 'string' && validKeys.has(key))
    : []
  const bounded = (value, fallback, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback
  return {
    index,
    setNumber,
    status: state.status,
    secondsLeft: bounded(state.secondsLeft, exercises[index].durationSeconds || 0, 86400),
    restLeft: bounded(state.restLeft, 0, 3600),
    completedSets,
    elapsedSeconds: bounded(state.elapsedSeconds, 0, 86400),
  }
}

function updateSession(session, changes, now) {
  return { ...session, ...changes, updatedAt: new Date(now).toISOString() }
}

export function startWorkoutSession(session, { now = Date.now() } = {}) {
  if (!['ready', 'paused'].includes(session.status)) throw new Error('Only ready or paused sessions can start.')
  return updateSession(session, {
    status: session.status === 'ready' ? 'running' : session.status,
    startedAt: session.startedAt || new Date(now).toISOString(),
  }, now)
}

export function pauseWorkoutSession(session, { now = Date.now() } = {}) {
  if (!['running', 'resting'].includes(session.status)) throw new Error('Only active sessions can be paused.')
  return updateSession(session, { status: 'paused', resumeStatus: session.status }, now)
}

export function resumeWorkoutSession(session, { now = Date.now() } = {}) {
  if (session.status !== 'paused') throw new Error('Only paused sessions can be resumed.')
  return updateSession(session, { status: session.resumeStatus || 'running', resumeStatus: null }, now)
}

export function tickWorkoutSession(session, seconds = 1, { now = Date.now() } = {}) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new RangeError('Tick must be from 0 to 3600 seconds.')
  if (!['running', 'resting'].includes(session.status)) return session
  const elapsedSeconds = session.elapsedSeconds + seconds
  if (session.status === 'resting') {
    const restSeconds = Math.max(0, session.restSeconds - seconds)
    return updateSession(session, {
      elapsedSeconds,
      restSeconds,
      status: restSeconds === 0 ? 'running' : 'resting',
    }, now)
  }
  const timerSeconds = Math.max(0, session.timerSeconds - seconds)
  return updateSession(session, {
    elapsedSeconds,
    timerSeconds,
    status: timerSeconds === 0 && session.timerSeconds > 0 ? 'paused' : 'running',
  }, now)
}

export function completeWorkoutSet(session, plan, { now = Date.now() } = {}) {
  if (session.status !== 'running') throw new Error('Start or resume the session before completing a set.')
  const exercise = plan.exercises[session.exerciseIndex]
  if (!exercise) throw new RangeError('Current exercise is unavailable.')
  if (exercise.tracking === 'timed' && session.timerSeconds > 0) throw new Error('Finish the timed interval before completing the set.')
  const key = `${session.exerciseIndex}:${session.setNumber}`
  const completedSets = session.completedSets.includes(key) ? session.completedSets : [...session.completedSets, key]
  const lastSet = session.setNumber >= exercise.sets
  const lastExercise = session.exerciseIndex === plan.exercises.length - 1
  if (lastSet && lastExercise) return updateSession(session, { completedSets, status: 'completed', restSeconds: 0 }, now)

  const nextExerciseIndex = lastSet ? session.exerciseIndex + 1 : session.exerciseIndex
  const nextSetNumber = lastSet ? 1 : session.setNumber + 1
  const restSeconds = Number(exercise.restSeconds) || 0
  const nextExercise = plan.exercises[nextExerciseIndex]
  return updateSession(session, {
    completedSets,
    exerciseIndex: nextExerciseIndex,
    setNumber: nextSetNumber,
    timerSeconds: Number(nextExercise.durationSeconds) || 0,
    restSeconds,
    status: restSeconds ? 'resting' : 'running',
  }, now)
}

export function skipWorkoutRest(session, { now = Date.now() } = {}) {
  if (session.status !== 'resting') return session
  return updateSession(session, { status: 'running', restSeconds: 0 }, now)
}

export function skipWorkoutExercise(session, plan, direction, { now = Date.now() } = {}) {
  if (!['running', 'paused', 'resting'].includes(session.status)) throw new Error('Start the session before changing exercises.')
  if (!Number.isInteger(direction) || ![-1, 1].includes(direction)) throw new RangeError('Direction must be -1 or 1.')
  const exerciseIndex = Math.max(0, Math.min(plan.exercises.length - 1, session.exerciseIndex + direction))
  const exercise = plan.exercises[exerciseIndex]
  return updateSession(session, {
    exerciseIndex,
    setNumber: 1,
    timerSeconds: Number(exercise.durationSeconds) || 0,
    restSeconds: 0,
    status: session.status === 'paused' ? 'paused' : 'running',
  }, now)
}

export function completedPerformedSets(exercises, completedSets, availableExerciseIds = new Set()) {
  if (!Array.isArray(exercises) || !Array.isArray(completedSets) || !(availableExerciseIds instanceof Set)) {
    throw new TypeError('Exercises, completed set keys, and available exercise IDs are required.')
  }
  const completed = new Set(completedSets)
  return exercises.flatMap((exercise, exerciseIndex) => {
    if (!exercise || typeof exercise.id !== 'string' || !Number.isInteger(exercise.sets) || exercise.sets < 1) {
      throw new TypeError('Every workout exercise must have an ID and a positive set count.')
    }
    return Array.from({ length: exercise.sets }, (_, setIndex) => {
      const setNumber = setIndex + 1
      if (!completed.has(`${exerciseIndex}-${exercise.id}-${setNumber}`)) return null
      return {
        exerciseId: availableExerciseIds.has(exercise.id) ? exercise.id : null,
        exerciseSequence: exerciseIndex + 1,
        exerciseName: exercise.name,
        setNumber,
        ...(exercise.tracking === 'reps'
          ? { reps: exercise.reps }
          : { durationSeconds: exercise.durationSeconds }),
        restSeconds: exercise.restSeconds,
      }
    }).filter(Boolean)
  })
}

export function recoveryDayFor(date, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days) || days < 0 || days > 365) {
    throw new RangeError('A valid ISO date and day offset are required.')
  }
  const result = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(result.getTime())) throw new RangeError('Date is invalid.')
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
