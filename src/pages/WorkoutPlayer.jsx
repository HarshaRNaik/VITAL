import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import ExerciseAnimation from '../components/ExerciseAnimation'
import { WORKOUTS } from '../data/workouts'
import { useGame } from '../context/game-context'
import { exerciseApi, workouts } from '../services/api'
import { today } from '../utils/helpers'

const DEFAULT_PLAN_ID = 'beginner-full-body'
const fmt = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const setKey = (exercise, exerciseIndex, setNumber) => `${exerciseIndex}-${exercise.id}-${setNumber}`

export default function WorkoutPlayer() {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { applyGame, game } = useGame()
  const planId = searchParams.get('plan') || DEFAULT_PLAN_ID
  const matchedPlan = WORKOUTS.find((item) => item.id === planId)
  const plan = matchedPlan || WORKOUTS.find((item) => item.id === DEFAULT_PLAN_ID)
  const courseSessionParam = searchParams.get('courseSession')
  const courseSessionIndex = courseSessionParam === null ? null : Number.parseInt(courseSessionParam, 10)
  const validCourseSession = courseSessionIndex === null
    || (Number.isInteger(courseSessionIndex) && String(courseSessionIndex) === courseSessionParam && Boolean(plan.weeklySchedule?.[courseSessionIndex]))
  const courseSession = validCourseSession && courseSessionIndex !== null ? plan.weeklySchedule?.[courseSessionIndex] : null
  const courseExercises = courseSession ? plan.exercises.filter((item) => courseSession.movementIds.includes(item.id)) : null
  const activeExercises = courseExercises?.length ? courseExercises : plan.exercises
  const sessionTitle = courseSession ? `${plan.name} · ${courseSession.day}` : plan.name
  const sessionDuration = courseSession?.durationMinutes ?? plan.durationMinutes
  const sessionEquipment = courseSession
    ? [...new Set(activeExercises.map((item) => item.equipment).filter((item) => item !== 'Bodyweight only' && item !== 'No-equipment cardio'))]
    : plan.requiredEquipment
  const routeSessionParam = searchParams.get('session') || ''
  const routeSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routeSessionParam)
    ? routeSessionParam
    : ''
  const [sessionId, setSessionId] = useState(routeSession === 'new' ? '' : routeSession)
  const [started, setStarted] = useState(Boolean(routeSession && routeSession !== 'new'))
  const [finished, setFinished] = useState(false)
  const [index, setIndex] = useState(0)
  const [setNumber, setSetNumber] = useState(1)
  const [status, setStatus] = useState('ready')
  const [secondsLeft, setSecondsLeft] = useState(activeExercises[0].durationSeconds || 0)
  const [restLeft, setRestLeft] = useState(0)
  const [completedSets, setCompletedSets] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [catalogWarning, setCatalogWarning] = useState('')
  const [recordedDuration, setRecordedDuration] = useState(null)
  const [recordedExerciseCount, setRecordedExerciseCount] = useState(null)
  const [newBadges, setNewBadges] = useState([])
  const elapsedRef = useRef(0)
  const [elapsedDisplay, setElapsedDisplay] = useState(0)
  const secondsRef = useRef(activeExercises[0].durationSeconds || 0)
  const restRef = useRef(0)
  const completionStarted = useRef(false)
  const exerciseCatalogPromise = useRef(null)
  const badgeIdsBefore = useRef(game.badges)
  const rewardPending = useRef(false)
  const exercise = activeExercises[index]
  const sessionKey = setKey(exercise, index, setNumber)
  const totalSets = activeExercises.reduce((total, item) => total + item.sets, 0)
  const completedSetCount = completedSets.length
  const completedExerciseCount = activeExercises.filter((item, itemIndex) => Array.from({ length: item.sets }, (_, setIndex) => setKey(item, itemIndex, setIndex + 1)).every((key) => completedSets.includes(key))).length

  const loadExerciseIds = useCallback(() => {
    if (!exerciseCatalogPromise.current) {
      exerciseCatalogPromise.current = exerciseApi.list()
        .then((items) => new Set(items.map((item) => item.id)))
        .catch((catalogError) => {
          console.error('Failed to load exercise catalogue:', catalogError)
          setCatalogWarning('Exercise references are temporarily unavailable; completed sets can still be saved by name.')
          return new Set()
        })
    }
    return exerciseCatalogPromise.current
  }, [])

  useEffect(() => {
    loadExerciseIds()
  }, [loadExerciseIds])

  useEffect(() => {
    if (!routeSession || routeSession === 'new') return
    workouts.list()
      .then((items) => {
        const saved = items.find((item) => item.sessionId === routeSession)
        if (saved) {
          setStarted(false)
          setFinished(true)
          setRecordedDuration(Number(saved.durationSeconds) || (Number(saved.duration) || 1) * 60)
          setRecordedExerciseCount(Number(saved.exercisesCompleted ?? activeExercises.length))
        }
      })
      .catch((loadError) => {
        console.error('Failed to load completed workout:', loadError)
        setError('Could not verify the saved workout status. You can continue, and the server will prevent duplicate records.')
      })
  }, [routeSession, activeExercises.length])

  useEffect(() => {
    if (!rewardPending.current) return
    setNewBadges(game.badges.filter((id) => !badgeIdsBefore.current.includes(id)))
    rewardPending.current = false
  }, [game.badges])

  useEffect(() => {
    const repBasedActive = started && status === 'ready' && exercise.tracking === 'reps'
    if (!repBasedActive && status !== 'running' && status !== 'rest') return undefined
    const timer = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsedDisplay(elapsedRef.current)
      if (repBasedActive) return
      if (status === 'rest') {
        restRef.current -= 1
        setRestLeft(restRef.current)
        if (restRef.current <= 0) setStatus('ready')
        return
      }
      secondsRef.current -= 1
      setSecondsLeft(secondsRef.current)
      if (secondsRef.current <= 0) setStatus('paused')
    }, 1000)
    return () => window.clearInterval(timer)
  }, [started, status, exercise.tracking])

  useEffect(() => {
    if (!started || finished) return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [started, finished])

  function beginWorkout() {
    const id = sessionId || crypto.randomUUID()
    setSessionId(id)
    const params = new URLSearchParams(searchParams)
    params.set('plan', plan.id)
    params.set('session', id)
    setSearchParams(params, { replace: true })
    setStarted(true)
    setStatus('ready')
    elapsedRef.current = 0
    setElapsedDisplay(0)
  }

  function goToExercise(nextIndex) {
    if (nextIndex < 0 || nextIndex >= activeExercises.length) return
    const next = activeExercises[nextIndex]
    setIndex(nextIndex)
    setSetNumber(1)
    secondsRef.current = next.durationSeconds || 0
    setSecondsLeft(secondsRef.current)
    setRestLeft(0)
    setStatus('ready')
  }

  function startTimer() {
    if (status === 'restPaused') {
      setStatus('rest')
      return
    }
    if (status === 'ready' && exercise.tracking === 'timed') {
      if (secondsRef.current <= 0) secondsRef.current = exercise.durationSeconds
      setSecondsLeft(secondsRef.current)
    }
    setStatus('running')
  }

  function pauseTimer() {
    setStatus(status === 'rest' ? 'restPaused' : 'paused')
  }

  async function finishWorkout(nextCompletedSets) {
    if (completionStarted.current || !sessionId) return
    completionStarted.current = true
    setSaving(true)
    setError('')
    const durationSeconds = elapsedRef.current
    const completedCount = activeExercises.filter((item, itemIndex) => Array.from({ length: item.sets }, (_, setIndex) => setKey(item, itemIndex, setIndex + 1)).every((key) => nextCompletedSets.includes(key))).length
    try {
      const exerciseIds = await loadExerciseIds()
      const missingExerciseReference = activeExercises.some((item) => !exerciseIds.has(item.id))
      setCatalogWarning(missingExerciseReference
        ? 'Some exercise references are not in the server catalogue; those sets will be saved by name.'
        : '')
      const performedSets = activeExercises.flatMap((item, itemIndex) => (
        Array.from({ length: item.sets }, (_, setIndex) => ({
          exerciseId: exerciseIds.has(item.id) ? item.id : null,
          exerciseSequence: itemIndex + 1,
          exerciseName: item.name,
          setNumber: setIndex + 1,
          ...(item.tracking === 'reps'
            ? { reps: item.reps }
            : { durationSeconds: item.durationSeconds }),
          restSeconds: item.restSeconds,
        }))
      ))
      const record = {
        type: 'Guided',
        name: sessionTitle,
        planId: plan.id,
        planCategory: plan.category,
        courseSession: courseSession?.day,
        plannedDurationMinutes: sessionDuration,
        duration: Math.max(1, Math.ceil(durationSeconds / 60)),
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
        calories: 0,
        date: today(),
        exercisesCompleted: completedCount,
        setsCompleted: nextCompletedSets.length,
        performedSets,
        sessionId,
      }
      const saved = await workouts.add(record)
      if (!saved.duplicate) {
        badgeIdsBefore.current = game.badges
        rewardPending.current = true
      }
      applyGame(saved.game, saved.duplicate ? undefined : 'workout')
      setCompletedSets(nextCompletedSets)
      setRecordedDuration(durationSeconds)
      setRecordedExerciseCount(completedCount)
      setFinished(true)
      setStatus('complete')
    } catch (saveError) {
      completionStarted.current = false
      console.error('Failed to save guided workout:', saveError)
      setError(saveError.code === 'AUTH_REQUIRED' || saveError.code === 'SUPABASE_NOT_CONFIGURED'
        ? saveError.message
        : 'Your workout could not be saved. Please try again before leaving this screen.')
    } finally {
      setSaving(false)
    }
  }

  function completeSet() {
    if (saving || (exercise.tracking === 'timed' && secondsLeft > 0)) return
    const nextCompletedSets = completedSets.includes(sessionKey) ? completedSets : [...completedSets, sessionKey]
    setCompletedSets(nextCompletedSets)

    const lastSetOfExercise = setNumber >= exercise.sets
    const lastExercise = index >= activeExercises.length - 1
    if (lastSetOfExercise && lastExercise) {
      finishWorkout(nextCompletedSets)
      return
    }

    if (lastSetOfExercise) goToExercise(index + 1)
    else {
      setSetNumber((value) => value + 1)
      secondsRef.current = exercise.durationSeconds || 0
      setSecondsLeft(secondsRef.current)
    }

    if (exercise.restSeconds > 0) {
      restRef.current = exercise.restSeconds
      setRestLeft(exercise.restSeconds)
      setStatus('rest')
    } else {
      setStatus('ready')
    }
  }

  function leaveWorkout() {
    if (window.confirm('Leave this workout? Your in-progress session will not be recorded.')) nav('/fitness')
  }

  if (!matchedPlan) {
    return (
      <section className="empty-state page-enter mx-auto max-w-xl">
        <span className="text-4xl">🔎</span>
        <h1 className="mt-3 text-xl font-bold text-white">Workout not found</h1>
        <p className="mt-2 text-sm text-gray-400">That plan is not available in the library. Browse the current workout plans instead.</p>
        <button type="button" className="btn mt-4 min-h-11" onClick={() => nav('/fitness')}>Back to workout library</button>
      </section>
    )
  }

  if (courseSessionParam !== null && (!validCourseSession || !courseSession || !courseExercises?.length)) {
    return (
      <section className="empty-state page-enter mx-auto max-w-xl">
        <span className="text-4xl">🔎</span>
        <h1 className="mt-3 text-xl font-bold text-white">Course session not found</h1>
        <p className="mt-2 text-sm text-gray-400">That session is not available in this course. Choose a session from the weekly course schedule.</p>
        <button type="button" className="btn mt-4 min-h-11" onClick={() => nav('/fitness')}>Back to workout library</button>
      </section>
    )
  }

  if (finished) {
    const duration = recordedDuration ?? elapsedDisplay
    const exerciseCount = recordedExerciseCount ?? completedExerciseCount
    return (
      <section className="page-enter mx-auto max-w-3xl space-y-4 py-4">
        <div className="hero-panel p-6 text-center sm:p-10">
          <span aria-hidden="true" className="text-6xl">🏆</span>
          <p className="mt-4 font-game text-xs text-xp">SESSION COMPLETE</p>
          <h1 className="mt-3 text-3xl font-extrabold">Strong work.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-gray-300">{sessionTitle}: {exerciseCount} of {activeExercises.length} movements completed in {fmt(duration)}. Your session is saved in workout history.</p>
          <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-3 text-left sm:grid-cols-3">
            <div className="card"><p className="text-xs text-gray-500">Movements</p><p className="mt-1 text-2xl font-extrabold">{exerciseCount}/{activeExercises.length}</p></div>
            <div className="card"><p className="text-xs text-gray-500">Duration</p><p className="mt-1 text-2xl font-extrabold">{fmt(duration)}</p></div>
            <div className="card col-span-2 sm:col-span-1"><p className="text-xs text-gray-500">XP earned</p><p className="mt-1 text-2xl font-extrabold text-xp">+25</p></div>
          </div>
          {newBadges.length > 0 && <p className="mt-5 font-semibold text-xp">🎉 Achievement unlocked: {newBadges.join(', ')}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn min-h-12" onClick={() => nav('/fitness')}>Back to library</button>
            <button className="btn-ghost min-h-12" onClick={() => { setFinished(false); setStarted(false); setSessionId(''); setCompletedSets([]); setIndex(0); setSetNumber(1); setError(''); completionStarted.current = false; const params = new URLSearchParams({ plan: plan.id }); if (courseSessionIndex !== null) params.set('courseSession', String(courseSessionIndex)); setSearchParams(params, { replace: true }) }}>Repeat this workout</button>
          </div>
        </div>
        <div className="card">
          <h2 className="font-game text-xs text-xp">SESSION PLAN</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {activeExercises.map((item, itemIndex) => <li key={`${item.id}-${itemIndex}`} className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-sm"><span className="mr-2">{item.emoji}</span><span className="font-semibold text-white">{item.name}</span><p className="mt-1 text-xs text-gray-400">{item.tracking === 'reps' ? `${item.sets} × ${item.reps} reps` : `${item.sets} × ${item.durationSeconds}s`}</p></li>)}
          </ol>
        </div>
      </section>
    )
  }

  if (!started) {
    return (
      <section className="page-enter mx-auto max-w-4xl">
        <button type="button" className="btn-ghost mb-4 min-h-11" onClick={() => nav('/fitness')}>← Workout library</button>
        <div className="system-panel system-hero rounded-2xl p-5 sm:p-8">
          <p className="system-kicker">Quest briefing · training protocol</p>
          <span className="badge">{plan.category}</span>
          <h1 className="mt-4 text-3xl font-extrabold">{sessionTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">{plan.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="badge">{sessionDuration} min {courseSession ? 'estimated' : plan.weeklySchedule ? 'course total' : 'estimated'}</span><span className="badge">{plan.difficulty}</span><span className="badge">{courseSession && sessionEquipment.length === 0 ? 'No external equipment' : sessionEquipment.join(', ') || plan.equipment}</span>
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-gray-400">Equipment checklist</p>
          <p className="mt-1 text-sm text-white">{sessionEquipment.length ? sessionEquipment.join(', ') : 'No external equipment required'}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Target areas</p>
          <p className="mt-1 text-sm text-white">{plan.targetMuscles.join(' · ')}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-gray-300"><span className="font-semibold text-white">Warm-up:</span> {plan.warmup}</p>
            <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-gray-300"><span className="font-semibold text-white">Cooldown:</span> {plan.cooldown}</p>
          </div>
          {courseSession && <p className="mt-4 rounded-xl border border-xp/15 bg-xp/5 p-3 text-sm text-gray-300"><span className="font-semibold text-xp">{courseSession.day} · {courseSession.focus}:</span> {courseSession.detail}</p>}
          {plan.weeklySchedule && !courseSession && <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Choose a session from the weekly course</p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-3">{plan.weeklySchedule.map((session, sessionIndex) => <li key={session.day} className="rounded-xl border border-white/5 bg-white/[0.03] p-3"><p className="text-xs font-bold text-xp">{session.day} · {session.focus}</p><p className="mt-1 text-xs text-gray-400">{session.detail}</p><p className="mt-2 text-[11px] text-gray-500">{session.durationMinutes} min</p><button type="button" className="btn-ghost mt-3 min-h-10 w-full justify-center text-xs" onClick={() => setSearchParams({ plan: plan.id, courseSession: String(sessionIndex) }, { replace: true })}>Choose {session.day}</button></li>)}</ol>
          </div>}
          <h2 className="mt-6 font-game text-xs text-xp">EXERCISE SEQUENCE</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {activeExercises.map((item, itemIndex) => <li key={`${item.id}-${itemIndex}`} className="quest-step rounded-xl border border-cyan-100/10 bg-black/20 p-3">
              <p className="font-semibold text-white">{item.emoji} {itemIndex + 1}. {item.name}</p>
              <p className="mt-1 text-xs text-gray-400">{item.tracking === 'reps' ? `${item.sets} sets × ${item.reps} reps` : `${item.sets} × ${item.durationSeconds}s timed`} · {item.restSeconds}s rest</p>
              <p className="mt-2 text-xs text-gray-400">{item.instruction}</p>
              <p className="mt-1 text-xs text-xp">Easier option: {item.easier}</p>
            </li>)}
          </ol>
          <p className="mt-5 rounded-xl border border-streak/20 bg-streak/5 p-3 text-xs text-gray-300">Use a controlled pace and suitable load. Stop if you experience pain, dizziness, or other concerning symptoms. For barbell movements, use the listed safety setup and ask a qualified coach if unsure.</p>
          {(!plan.weeklySchedule || courseSession) && <button className="btn mt-5 min-h-12 px-6" onClick={beginWorkout}>Start {courseSession ? courseSession.day : 'workout'} <span aria-hidden="true">→</span></button>}
        </div>
      </section>
    )
  }

  return (
    <main className="page-enter mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="system-kicker">Active quest · {plan.difficulty}</p><h1 className="mt-1 text-2xl font-extrabold">{sessionTitle}</h1><p className="mt-1 text-xs text-gray-500">{sessionDuration} min estimated · {plan.targetMuscles.join(' · ')}</p></div>
        <button className="btn-ghost min-h-11" onClick={leaveWorkout}>End session</button>
      </div>

      <div className="system-panel mb-4 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white"><span className="system-kicker">Quest step</span><span className="ml-2">{String(index + 1).padStart(2, '0')} / {String(activeExercises.length).padStart(2, '0')}</span></p>
          <p className="text-right text-xs text-gray-400">Set {setNumber}/{exercise.sets} · {completedSetCount}/{totalSets} sets</p>
        </div>
        <div className="progress-track mt-3" role="progressbar" aria-label="Workout session progress" aria-valuemin="0" aria-valuemax={totalSets} aria-valuenow={completedSetCount}><div className="progress-fill" style={{ width: `${(completedSetCount / totalSets) * 100}%` }} /></div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section key={`${exercise.id}-${index}`} initial={{ opacity: 0, x: 22 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -22 }} transition={{ duration: 0.2 }} className="system-panel rounded-2xl p-4 text-center sm:p-6">
          <ExerciseAnimation exercise={{ ...exercise, duration: exercise.durationSeconds || 0 }} priority />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-xp">{exercise.focus} · {exercise.equipment}</p>
          <h2 className="mt-2 text-2xl font-extrabold">{exercise.name}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-400">{exercise.instruction}</p>
          <p className="mx-auto mt-2 max-w-xl text-xs text-xp">Easier option: {exercise.easier}</p>

          {exercise.tracking === 'timed' ? (
            <div className="my-6">
              <p className="workout-timer tabular-nums" aria-live="polite">{status === 'rest' || status === 'restPaused' ? fmt(restLeft) : fmt(secondsLeft)}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{status === 'rest' || status === 'restPaused' ? status === 'restPaused' ? 'Rest paused' : 'Rest' : status === 'ready' ? 'Ready when you are' : secondsLeft === 0 ? 'Interval complete' : status === 'paused' ? 'Paused' : 'Move at a steady pace'}</p>
            </div>
          ) : (
            <div className="my-6 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-3xl font-extrabold">{exercise.sets} <span className="text-sm font-medium text-gray-400">sets</span> × {exercise.reps} <span className="text-sm font-medium text-gray-400">reps</span></p>
              <p className="mt-1 text-xs text-gray-500">Complete the set with steady form; reps are a guide, not a race.</p>
              {(status === 'rest' || status === 'restPaused') && <p className="mt-3 text-sm text-streak">Rest {fmt(restLeft)}</p>}
            </div>
          )}

          {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          {catalogWarning && <p role="status" className="mb-4 rounded-xl border border-xp/20 bg-xp/5 p-3 text-sm text-gray-300">{catalogWarning}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            {exercise.tracking === 'timed' && (status === 'ready' || status === 'paused' || status === 'restPaused') && <button className="btn min-h-12 min-w-36" onClick={startTimer}>{status === 'ready' ? '▶ Start interval' : status === 'restPaused' ? '▶ Resume rest' : '▶ Resume'}</button>}
            {exercise.tracking === 'timed' && (status === 'running' || status === 'rest') && <button className="btn-ghost min-h-12 min-w-36" onClick={pauseTimer}>Ⅱ Pause</button>}
            {exercise.tracking === 'timed' && status === 'paused' && secondsLeft === 0 && <button className="btn min-h-12 min-w-40" disabled={saving} onClick={completeSet}>{saving ? 'Saving…' : setNumber === exercise.sets && index === activeExercises.length - 1 ? 'Finish workout' : 'Complete set'}</button>}
            {exercise.tracking === 'reps' && status === 'ready' && <><button className="btn min-h-12 min-w-40" disabled={saving} onClick={completeSet}>{saving ? 'Saving…' : setNumber === exercise.sets && index === activeExercises.length - 1 ? 'Finish workout' : '✓ Complete set'}</button><button className="btn-ghost min-h-12" onClick={pauseTimer}>Ⅱ Pause session</button></>}
            {exercise.tracking === 'reps' && status === 'paused' && <button className="btn min-h-12 min-w-36" onClick={() => setStatus('ready')}>▶ Resume session</button>}
            {status === 'rest' && <button className="btn-ghost min-h-12" onClick={pauseTimer}>Ⅱ Pause rest</button>}
            {status === 'restPaused' && <button className="btn min-h-12" onClick={startTimer}>▶ Resume rest</button>}
            {(status === 'rest' || status === 'restPaused') && <button className="btn-ghost min-h-12" onClick={() => { restRef.current = 0; setRestLeft(0); setStatus('ready') }}>Skip rest</button>}
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button className="btn-ghost min-h-11" disabled={index === 0} onClick={() => goToExercise(index - 1)}>← Previous</button>
        <p className="text-center text-xs text-gray-500">Timer pauses between sets and when you pause.</p>
        <button className="btn-ghost min-h-11" disabled={index >= activeExercises.length - 1} onClick={() => goToExercise(index + 1)}>Next →</button>
      </div>

      <section className="system-panel mt-5 rounded-2xl p-4 sm:p-5" aria-label="Workout quest steps">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="system-kicker">Quest sequence</p><p className="mt-1 text-xs text-gray-500">Complete every set to clear a movement.</p></div>
          <span className="text-xs font-semibold text-cyan-100">{completedExerciseCount}/{activeExercises.length} cleared</span>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2">
          {activeExercises.map((item, itemIndex) => {
            const isComplete = Array.from({ length: item.sets }, (_, setIndex) => setKey(item, itemIndex, setIndex + 1))
              .every((key) => completedSets.includes(key))
            const isCurrent = itemIndex === index
            return <li key={`${item.id}-quest-${itemIndex}`} aria-current={isCurrent ? 'step' : undefined} className={`quest-step flex items-center gap-3 rounded-xl border p-3 ${isCurrent ? 'border-cyan-200/30 bg-cyan-200/[0.06]' : 'border-white/5 bg-black/10'}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs ${isComplete ? 'border-teal-200/30 bg-teal-200/10 text-teal-100' : isCurrent ? 'border-cyan-200/25 text-cyan-100' : 'border-white/10 text-gray-500'}`}>{isComplete ? '✓' : String(itemIndex + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1"><p className={`truncate text-sm font-semibold ${isCurrent ? 'text-cyan-50' : 'text-gray-300'}`}>{item.name}</p><p className="mt-0.5 text-[11px] text-gray-500">{item.sets} sets · {item.tracking === 'reps' ? `${item.reps} reps` : `${item.durationSeconds}s`}</p></div>
              {isCurrent && <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-200">Active</span>}
            </li>
          })}
        </ol>
      </section>
    </main>
  )
}
