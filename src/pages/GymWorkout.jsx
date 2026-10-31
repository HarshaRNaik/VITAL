import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ExerciseAnimation from '../components/ExerciseAnimation'
import { MOVEMENTS } from '../data/workouts'
import { useGame } from '../context/game-context'
import { gymWorkoutTemplates, gymWorkouts } from '../services/api'

const TIMER_KEY = 'vital-gym-rest-timer'
const REST_PRESETS = [30, 60, 90, 120, 180]
const SET_TYPES = [
  ['WORKING', 'Working'],
  ['WARM_UP', 'Warm-up'],
  ['DROP', 'Drop'],
  ['FAILURE', 'Failure'],
  ['REST_PAUSE', 'Rest-pause'],
]
const STARTER_TEMPLATES = [
  { id: 'push-day', name: 'Push Day', ids: ['db-floor-press', 'band-press', 'db-shoulder-press', 'db-lateral-raise', 'db-overhead-triceps'] },
  { id: 'pull-day', name: 'Pull Day', ids: ['db-row', 'band-row', 'band-pull-apart', 'db-curl'] },
  { id: 'leg-day', name: 'Leg Day', ids: ['db-goblet-squat', 'db-rdl', 'db-split-squat', 'db-calf-raise'] },
  { id: 'upper-body', name: 'Upper Body', ids: ['db-floor-press', 'db-row', 'db-shoulder-press', 'db-curl', 'db-overhead-triceps'] },
  { id: 'lower-body', name: 'Lower Body', ids: ['db-goblet-squat', 'db-rdl', 'db-split-squat', 'band-glute', 'db-calf-raise'] },
  { id: 'full-body', name: 'Full Body', ids: ['db-goblet-squat', 'db-floor-press', 'db-row', 'db-rdl', 'db-dead-bug'] },
  { id: 'chest-triceps', name: 'Chest and Triceps', ids: ['db-floor-press', 'band-press', 'db-overhead-triceps'] },
  { id: 'back-biceps', name: 'Back and Biceps', ids: ['db-row', 'band-row', 'band-pull-apart', 'db-curl'] },
  { id: 'shoulder-day', name: 'Shoulder Day', ids: ['db-shoulder-press', 'db-lateral-raise', 'band-pull-apart'] },
].map((template) => ({
  ...template,
  exercises: template.ids.map((exerciseId) => ({ exerciseId, sets: 3, reps: 10, restSeconds: 90 })),
}))

const emptyRestTimer = { remaining: 0, endAt: null, duration: 90 }

function readRestTimer() {
  try {
    const timer = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null')
    if (!timer || !Number.isInteger(timer.duration) || timer.duration < 1 || timer.duration > 3600) return emptyRestTimer
    const endAt = Number.isFinite(timer.endAt) ? timer.endAt : null
    const remaining = endAt
      ? Math.min(3600, Math.max(0, Math.ceil((endAt - Date.now()) / 1000)))
      : Number.isInteger(timer.remaining) ? Math.min(3600, Math.max(0, timer.remaining)) : 0
    return { duration: timer.duration, remaining, endAt: remaining > 0 ? endAt : null }
  } catch (error) {
    console.error('Could not restore the gym rest timer:', error)
    return emptyRestTimer
  }
}

function asSet(setNumber) {
  return {
    setNumber,
    weightKg: null,
    reps: 8,
    rpe: null,
    setType: 'WORKING',
    completed: false,
    notes: '',
  }
}

function newWorkout() {
  return {
    name: 'Gym session',
    status: 'IN_PROGRESS',
    unit: 'kg',
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    exercises: [],
  }
}

function volume(session) {
  return (session.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).reduce((sum, set) => (
    sum + (set.completed && set.setType === 'WORKING' && Number.isFinite(set.weightKg) && Number.isFinite(set.reps)
      ? set.weightKg * set.reps
      : 0)
  ), 0), 0)
}

function estimatedOneRepMax(set) {
  return set.weightKg > 0 && set.reps > 0 ? set.weightKg * (1 + set.reps / 30) : 0
}

function clock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function unitWeight(weightKg, unit) {
  if (!Number.isFinite(weightKg)) return ''
  return (unit === 'lb' ? weightKg * 2.2046226218 : weightKg).toFixed(1).replace(/\.0$/, '')
}

function storedWeight(value, unit) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return unit === 'lb' ? parsed / 2.2046226218 : parsed
}

function PlateCalculator({ unit }) {
  const [target, setTarget] = useState('60')
  const [bar, setBar] = useState('20')
  const [plateInput, setPlateInput] = useState('25, 20, 15, 10, 5, 2.5, 1.25')
  const calculation = useMemo(() => {
    const targetWeight = Number(target)
    const barWeight = Number(bar)
    let remaining = (targetWeight - barWeight) / 2
    const plates = plateInput.split(',').map((item) => Number(item.trim()))
      .filter((weight) => Number.isFinite(weight) && weight > 0 && weight <= 1_000_000)
      .sort((left, right) => right - left)
    if (!Number.isFinite(targetWeight) || !Number.isFinite(barWeight) || targetWeight <= 0
      || targetWeight > 1_000_000 || barWeight < 0 || barWeight > 1_000_000
      || !Number.isFinite(remaining) || remaining < 0 || !plates.length) {
      return { plates: [], exact: false, remaining }
    }
    const loaded = []
    for (const weight of plates) {
      const count = Math.floor((remaining + 1e-8) / weight)
      remaining -= count * weight
      if (count) loaded.push({ weight, count })
    }
    return { plates: loaded, exact: remaining < 1e-6, remaining: Math.max(0, remaining) }
  }, [bar, plateInput, target])

  return (
    <section className="card">
      <h2 className="font-game text-xs text-violet-200">PLATE CALCULATOR</h2>
      <p className="mt-2 text-xs text-gray-400">Enter total barbell weight and available plates; the arrangement is per side.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-400">Target ({unit})<input type="number" min="0.5" max="1000000" step="0.5" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-sm text-white" /></label>
        <label className="text-xs text-gray-400">Bar ({unit})<input type="number" min="0" max="1000000" step="0.5" value={bar} onChange={(event) => setBar(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-sm text-white" /></label>
      </div>
      <label className="mt-2 block text-xs text-gray-400">Available plates per side ({unit})
        <input value={plateInput} maxLength={200} onChange={(event) => setPlateInput(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-2 text-sm text-white" />
      </label>
      {calculation.exact ? <div className="mt-3">
        <p className="text-sm font-semibold text-white">Each side</p>
        <div className="mt-2 flex min-h-12 flex-wrap items-end gap-1" aria-label="Plate arrangement on each side">
          {calculation.plates.map(({ weight, count }) => <span key={weight} title={`${count} plates at ${weight} ${unit} each`} className="flex h-10 min-w-12 items-center justify-center rounded border border-violet-200/30 bg-violet-200/10 px-1 text-[10px] font-bold text-violet-100">{weight} × {count}</span>)}
          {calculation.plates.length === 0 && <span className="text-xs text-gray-400">No plates required</span>}
        </div>
      </div> : <p role="status" className="mt-3 text-xs text-amber-200">{calculation.remaining < 0 ? 'Target must be at least the bar weight.' : calculation.remaining >= 0 ? `Available plates cannot exactly reach this target (short by ${calculation.remaining.toFixed(2)} ${unit} per side).` : 'Enter a valid target and bar weight.'}</p>}
    </section>
  )
}

function playTimerCue() {
  try {
    const AudioContextType = window.AudioContext || window.webkitAudioContext
    if (!AudioContextType) return
    const context = new AudioContextType()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.12
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.25)
    oscillator.onended = () => context.close()
  } catch (error) {
    console.error('Could not play the rest timer alert:', error)
  }
}

export default function GymWorkout() {
  const { applyGame } = useGame()
  const [sessions, setSessions] = useState([])
  const [templates, setTemplates] = useState([])
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('All muscle groups')
  const [elapsed, setElapsed] = useState(0)
  const [saveState, setSaveState] = useState('saved')
  const [restTimer, setRestTimer] = useState(readRestTimer)
  const [timerNow, setTimerNow] = useState(() => Date.now())
  const [customRest, setCustomRest] = useState('')
  const [autoRest, setAutoRest] = useState(true)
  const [timerError, setTimerError] = useState('')
  const currentRef = useRef(active)
  const restTimerRef = useRef(restTimer)
  const saveQueue = useRef(Promise.resolve())
  const alertedTimer = useRef(null)
  const cancelingWorkout = useRef(null)

  useEffect(() => { currentRef.current = active }, [active])

  useEffect(() => {
    let mounted = true
    Promise.all([gymWorkouts.list(), gymWorkoutTemplates.list()])
      .then(([items, savedTemplates]) => {
        if (!mounted) return
        const ordered = [...items].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
        setSessions(ordered)
        setTemplates(savedTemplates)
        const draft = ordered.find((item) => item.status === 'IN_PROGRESS')
        if (draft) setActive(draft)
        setLoading(false)
      })
      .catch((loadError) => {
        console.error('Failed to load gym workout history:', loadError)
        if (mounted) {
          setError(loadError.message || 'Gym workout history could not be loaded.')
          setLoading(false)
        }
      })
    return () => { mounted = false }
  }, [])

  const persist = useCallback((workout, completing = false) => {
    setSaveState('saving')
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      const saved = await gymWorkouts.save(workout.id, {
        ...workout,
        status: completing ? 'COMPLETED' : 'IN_PROGRESS',
        durationSeconds: Math.min(86_400, Math.max(0, Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000))),
      })
      setSessions((previous) => [saved.item, ...previous.filter((item) => item.id !== saved.item.id)])
      if (completing && !saved.duplicate) applyGame(saved.game, 'workout')
      if (currentRef.current?.id === workout.id || completing) setSaveState('saved')
      return saved
    })
    saveQueue.current = operation
    operation.catch((saveError) => {
      console.error('Failed to save gym workout:', saveError)
      setSaveState('error')
      setError(saveError.message || 'Could not save your gym workout. Your current edits remain on screen.')
    })
    return operation
  }, [applyGame])

  useEffect(() => {
    if (!active || active.status !== 'IN_PROGRESS') return undefined
    const timeout = window.setTimeout(() => {
      if (currentRef.current && cancelingWorkout.current !== currentRef.current.id) persist(currentRef.current)
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [active, persist])

  useEffect(() => {
    if (!active || active.status !== 'IN_PROGRESS') return undefined
    const updateElapsed = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000)))
    const interval = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(interval)
  }, [active])

  const changeRestTimer = useCallback((timer) => {
    restTimerRef.current = timer
    setRestTimer(timer)
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(timer))
      setTimerError('')
    } catch (storageError) {
      console.error('Could not persist the gym rest timer:', storageError)
      setTimerError('Rest timer recovery is unavailable in this browser session.')
    }
  }, [])

  useEffect(() => {
    if (!restTimer.endAt) return undefined
    const timerEndAt = restTimer.endAt
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000))
      setTimerNow(Date.now())
      if (remaining === 0) {
        const timer = restTimerRef.current
        changeRestTimer({ ...timer, remaining: 0, endAt: null })
        if (alertedTimer.current !== timerEndAt) {
          alertedTimer.current = timerEndAt
          playTimerCue()
        }
      }
    }
    const interval = window.setInterval(tick, 250)
    return () => window.clearInterval(interval)
  }, [restTimer.endAt, changeRestTimer])

  const completedSessions = useMemo(() => sessions.filter((session) => session.status === 'COMPLETED'), [sessions])
  const totalVolume = useMemo(() => completedSessions.reduce((total, session) => total + volume(session), 0), [completedSessions])
  const muscleGroups = useMemo(() => ['All muscle groups', ...new Set(MOVEMENTS.map((item) => item.focus))], [])
  const availableExercises = useMemo(() => {
    const query = search.trim().toLowerCase()
    return MOVEMENTS.filter((item) => (
      (!query || `${item.name} ${item.focus} ${item.equipment}`.toLowerCase().includes(query))
      && (muscle === 'All muscle groups' || item.focus === muscle)
    ))
  }, [muscle, search])

  const startWorkout = async (template = null) => {
    setError('')
    try {
      const base = newWorkout()
      if (template) {
        base.name = template.name
        base.exercises = template.exercises.flatMap((planned, sequence) => {
          const movement = MOVEMENTS.find((item) => item.id === planned.exerciseId)
          if (!movement) return []
          return [{
            exerciseId: movement.id,
            exerciseName: movement.name,
            focus: movement.focus,
            equipment: movement.equipment,
            sequence,
            notes: '',
            sets: Array.from({ length: planned.sets }, (_, index) => ({ ...asSet(index + 1), reps: planned.reps })),
          }]
        })
      }
      const draft = { id: crypto.randomUUID(), ...base }
      const saved = await gymWorkouts.save(draft.id, draft)
      setSessions((previous) => [saved.item, ...previous.filter((item) => item.id !== saved.item.id)])
      setActive(saved.item)
      setEditingTemplateId(template && templates.some((item) => item.id === template.id) ? template.id : null)
      setElapsed(0)
    } catch (startError) {
      console.error('Failed to start gym workout:', startError)
      setError(startError.message || 'Could not start a gym workout.')
    }
  }

  const saveTemplate = async () => {
    if (!active?.exercises.length) {
      setError('Add at least one exercise before saving a template.')
      return
    }
    try {
      const template = await gymWorkoutTemplates.save(editingTemplateId, {
        name: active.name,
        exercises: active.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: Math.max(1, exercise.sets.length),
          reps: exercise.sets.find((set) => set.reps)?.reps || 8,
          restSeconds: 90,
        })),
      })
      setTemplates((previous) => [template, ...previous.filter((item) => item.id !== template.id)])
      setEditingTemplateId(template.id)
      setError('')
    } catch (saveError) {
      console.error('Failed to save gym workout template:', saveError)
      setError(saveError.message || 'Could not save this gym workout template.')
    }
  }

  const removeTemplate = async (id) => {
    try {
      await gymWorkoutTemplates.remove(id)
      setTemplates((previous) => previous.filter((item) => item.id !== id))
      if (editingTemplateId === id) setEditingTemplateId(null)
    } catch (removeError) {
      console.error('Failed to remove gym workout template:', removeError)
      setError(removeError.message || 'Could not remove this gym workout template.')
    }
  }

  const updateWorkout = (update) => {
    setActive((current) => current && ({ ...current, ...update }))
  }

  const addExercise = (movement) => {
    if (!active || active.exercises.some((item) => item.exerciseId === movement.id)) return
    setActive((current) => current && ({
      ...current,
      exercises: [...current.exercises, {
        exerciseId: movement.id,
        exerciseName: movement.name,
        focus: movement.focus,
        equipment: movement.equipment,
        sequence: current.exercises.length,
        notes: '',
        sets: [asSet(1), asSet(2), asSet(3)],
      }],
    }))
  }

  const updateExercise = (exerciseIndex, patch) => {
    setActive((current) => current && ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, ...patch } : exercise),
    }))
  }

  const updateSet = (exerciseIndex, setIndex, patch) => {
    setActive((current) => current && ({
      ...current,
      exercises: current.exercises.map((exercise, index) => index === exerciseIndex
        ? { ...exercise, sets: exercise.sets.map((set, position) => position === setIndex ? { ...set, ...patch } : set) }
        : exercise),
    }))
  }

  const addSet = (exerciseIndex) => {
    const exercise = active?.exercises[exerciseIndex]
    if (!exercise || exercise.sets.length >= 100) return
    updateExercise(exerciseIndex, { sets: [...exercise.sets, asSet(exercise.sets.length + 1)] })
  }

  const removeSet = (exerciseIndex, setIndex) => {
    const exercise = active?.exercises[exerciseIndex]
    if (!exercise) return
    const sets = exercise.sets.filter((_set, index) => index !== setIndex)
      .map((set, index) => ({ ...set, setNumber: index + 1 }))
    updateExercise(exerciseIndex, { sets })
  }

  const reorderExercise = (index, direction) => {
    if (!active) return
    const target = index + direction
    if (target < 0 || target >= active.exercises.length) return
    const exercises = [...active.exercises]
    ;[exercises[index], exercises[target]] = [exercises[target], exercises[index]]
    updateWorkout({ exercises: exercises.map((exercise, sequence) => ({ ...exercise, sequence })) })
  }

  const setRestDuration = (duration) => {
    changeRestTimer({ duration, remaining: duration, endAt: null })
  }

  const startRest = (duration = restTimer.remaining || restTimer.duration) => {
    const seconds = Math.max(1, Math.min(3600, Number(duration) || 90))
    changeRestTimer({ duration: seconds, remaining: seconds, endAt: Date.now() + seconds * 1000 })
  }

  const toggleRest = () => {
    if (restTimer.endAt) {
      const remaining = Math.max(0, Math.ceil((restTimer.endAt - Date.now()) / 1000))
      changeRestTimer({ ...restTimer, remaining, endAt: null })
    } else {
      startRest(restTimer.remaining || restTimer.duration)
    }
  }

  const leaveWorkoutOpen = async () => {
    const latest = currentRef.current
    if (latest) {
      try {
        await persist(latest)
      } catch {
        return
      }
    }
    setActive(null)
  }

  const cancelWorkout = async () => {
    if (!active || !window.confirm('Cancel this gym workout and discard its in-progress session?')) return
    cancelingWorkout.current = active.id
    try {
      await saveQueue.current.catch(() => undefined)
      await gymWorkouts.cancel(active.id)
      setSessions((previous) => previous.filter((session) => session.id !== active.id))
      currentRef.current = null
      setActive(null)
      setEditingTemplateId(null)
      setError('')
    } catch (cancelError) {
      cancelingWorkout.current = null
      console.error('Failed to cancel gym workout:', cancelError)
      setError(cancelError.message || 'Could not cancel this gym workout.')
    }
  }

  const finishWorkout = async () => {
    if (!active || active.status !== 'IN_PROGRESS') return
    const hasWorkingSet = active.exercises.some((exercise) => exercise.sets.some((set) => (
      set.completed && set.setType === 'WORKING' && set.weightKg > 0 && set.reps > 0
    )))
    if (!hasWorkingSet) {
      setError('Complete at least one working set with a weight and repetitions before finishing.')
      return
    }
    setError('')
    const done = { ...active, durationSeconds: elapsed }
    try {
      await persist(done, true)
      setActive(null)
      setEditingTemplateId(null)
    } catch {
      setError('Your workout could not be finished. Check your connection and try again; it is still saved as an active session.')
    }
  }

  const recentVolume = active ? volume(active) : 0
  const bestLifts = useMemo(() => {
    const records = new Map()
    completedSessions.forEach((session) => session.exercises.forEach((exercise) => {
      const record = records.get(exercise.exerciseId) || { name: exercise.exerciseName, weightKg: 0, reps: 0, oneRepMaxKg: 0 }
      exercise.sets.forEach((set) => {
        if (!set.completed || set.setType !== 'WORKING' || !Number.isFinite(set.weightKg) || !Number.isFinite(set.reps)) return
        record.weightKg = Math.max(record.weightKg, set.weightKg)
        record.reps = Math.max(record.reps, set.reps)
        record.oneRepMaxKg = Math.max(record.oneRepMaxKg, estimatedOneRepMax(set))
      })
      records.set(exercise.exerciseId, record)
    }))
    return [...records.values()].filter((record) => record.weightKg > 0)
  }, [completedSessions])

  if (loading) return <p role="status" className="card">Loading Gym Partner…</p>

  return (
    <div className="page-enter mx-auto max-w-6xl space-y-5 pb-8">
      <header className="hero-panel flex flex-wrap items-end justify-between gap-4 p-5 sm:p-7">
        <div>
          <Link to="/workout" className="btn-ghost mb-2 inline-flex min-h-10 items-center text-xs">← Workout modes</Link>
          <p className="font-game text-xs text-violet-200">GYM PARTNER</p>
          <h1 className="mt-2 text-3xl font-extrabold">Train with a plan. Track every set.</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">Your strength sessions, training volume, and gym progress are kept separate from Home Workout.</p>
        </div>
        {!active && <button type="button" className="btn min-h-12" onClick={startWorkout}>＋ Start Gym Workout</button>}
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}

      {!active && (
        <>
          <section aria-label="Gym statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card"><p className="text-xs text-gray-400">Gym sessions</p><p className="mt-1 text-2xl font-bold">{completedSessions.length}</p></div>
            <div className="card"><p className="text-xs text-gray-400">Training volume</p><p className="mt-1 text-2xl font-bold">{Math.round(totalVolume).toLocaleString()} <span className="text-sm text-gray-400">kg</span></p></div>
            <div className="card"><p className="text-xs text-gray-400">Exercises tracked</p><p className="mt-1 text-2xl font-bold">{bestLifts.length}</p></div>
            <div className="card"><p className="text-xs text-gray-400">In-progress sessions</p><p className="mt-1 text-2xl font-bold">{sessions.filter((session) => session.status === 'IN_PROGRESS').length}</p></div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-game text-xs text-violet-200">WORKOUT TEMPLATES</h2><p className="mt-2 text-sm text-gray-400">Start from a plan or reuse a template you have saved.</p></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STARTER_TEMPLATES.map((template) => <article key={template.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{template.name}</span><span className="text-xs text-gray-400">{template.exercises.length} exercises</span></span>
                <button type="button" className="btn-ghost min-h-10 shrink-0 px-3 text-xs" onClick={() => startWorkout(template)}>Start</button>
              </article>)}
              {templates.map((template) => <article key={template.id} className="flex items-center justify-between gap-2 rounded-xl border border-violet-200/15 bg-violet-200/[0.03] p-3">
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{template.name}</span><span className="text-xs text-gray-400">{template.exercises.length} exercises · Saved</span></span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn-ghost min-h-10 px-3 text-xs" onClick={() => startWorkout(template)}>Start</button>
                  <button type="button" className="btn-ghost min-h-10 px-2 text-xs text-red-300" aria-label={`Delete ${template.name} template`} onClick={() => removeTemplate(template.id)}>×</button>
                </div>
              </article>)}
            </div>
          </section>

          <PlateCalculator unit="kg" />

          {sessions.some((session) => session.status === 'IN_PROGRESS') && (
            <section className="card">
              <h2 className="font-game text-xs text-violet-200">RESUME TRAINING</h2>
              <ul className="mt-3 divide-y divide-white/5">
                {sessions.filter((session) => session.status === 'IN_PROGRESS').map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><p className="font-semibold text-white">{session.name}</p><p className="mt-1 text-xs text-gray-400">Started {new Date(session.startedAt).toLocaleString()}</p></div>
                  <button type="button" className="btn min-h-11" onClick={() => setActive(session)}>Resume workout</button>
                </li>)}
              </ul>
            </section>
          )}

          {bestLifts.length > 0 && (
            <section className="card">
              <h2 className="font-game text-xs text-violet-200">STRENGTH PROGRESSION</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bestLifts.map((record) => <article key={record.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="font-semibold text-white">{record.name}</h3>
                  <p className="mt-2 text-sm text-gray-300">Best: {unitWeight(record.weightKg, 'kg')} kg · {record.reps} reps</p>
                  <p className="mt-1 text-xs text-gray-400">Estimated 1RM: {unitWeight(record.oneRepMaxKg, 'kg')} kg</p>
                </article>)}
              </div>
              <p className="mt-3 text-xs text-gray-500">Records are calculated from completed, valid sets in your gym history.</p>
            </section>
          )}

          <section className="card">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-game text-xs text-violet-200">GYM WORKOUT HISTORY</h2><p className="mt-2 text-sm text-gray-400">Completed sessions and working-set volume only.</p></div>
            </div>
            {completedSessions.length === 0 ? <p className="mt-4 text-sm text-gray-500">No completed gym sessions yet. Start your first session when you’re ready.</p> : (
              <ul className="mt-4 divide-y divide-white/5">
                {completedSessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><p className="font-semibold text-white">{session.name}</p><p className="mt-1 text-xs text-gray-400">{new Date(session.startedAt).toLocaleDateString()} · {session.exercises.length} exercises · {clock(session.durationSeconds || 0)}</p></div>
                  <p className="text-sm font-semibold text-violet-100">{Math.round(volume(session)).toLocaleString()} kg volume</p>
                </li>)}
              </ul>
            )}
          </section>
        </>
      )}

      {active && (
        <section className="space-y-4">
          <div className="sticky top-0 z-10 rounded-2xl border border-violet-200/20 bg-[#09111e]/95 p-4 shadow-xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <label className="sr-only" htmlFor="gym-workout-name">Workout name</label>
                <input id="gym-workout-name" value={active.name} maxLength={120} onChange={(event) => updateWorkout({ name: event.target.value })} className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 font-semibold text-white" />
                <div className="text-right"><p className="font-mono text-lg text-white">{clock(elapsed)}</p><p className="text-[10px] text-gray-400">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="gym-unit">Weight unit</label>
                <select id="gym-unit" value={active.unit} onChange={(event) => updateWorkout({ unit: event.target.value })} className="min-h-11 rounded-lg border border-white/10 bg-[#111c2a] px-3 text-sm text-white"><option value="kg">kg</option><option value="lb">lb</option></select>
                <button type="button" onClick={finishWorkout} className="btn min-h-11">Finish</button>
                <button type="button" onClick={leaveWorkoutOpen} className="btn-ghost min-h-11">Back</button>
                <button type="button" onClick={cancelWorkout} className="btn-ghost min-h-11 text-red-300">Cancel workout</button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Working-set volume this session: {Math.round(recentVolume).toLocaleString()} kg</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
              {active.exercises.map((exercise, exerciseIndex) => {
                const movement = MOVEMENTS.find((item) => item.id === exercise.exerciseId) || { ...exercise, emoji: '🏋️' }
                const previous = completedSessions.find((session) => session.exercises.some((item) => item.exerciseId === exercise.exerciseId))
                  ?.exercises.find((item) => item.exerciseId === exercise.exerciseId)
                return <article key={`${exercise.exerciseId}-${exerciseIndex}`} className="card space-y-4">
                  <div className="flex items-start gap-3">
                    <ExerciseAnimation exercise={{ ...movement, duration: 0, sets: exercise.sets.length, reps: exercise.sets[0]?.reps ?? 0 }} compact />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-violet-200">{exercise.focus} · {exercise.equipment}</p>
                      <h2 className="mt-1 text-lg font-bold text-white">{exercise.exerciseName}</h2>
                      <label className="sr-only" htmlFor={`exercise-notes-${exerciseIndex}`}>Notes for {exercise.exerciseName}</label>
                      <input id={`exercise-notes-${exerciseIndex}`} value={exercise.notes} maxLength={500} placeholder="Exercise notes (optional)" onChange={(event) => updateExercise(exerciseIndex, { notes: event.target.value })} className="mt-2 min-h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button type="button" className="btn-ghost min-h-9 px-3" aria-label={`Move ${exercise.exerciseName} up`} onClick={() => reorderExercise(exerciseIndex, -1)} disabled={exerciseIndex === 0}>↑</button>
                      <button type="button" className="btn-ghost min-h-9 px-3" aria-label={`Move ${exercise.exerciseName} down`} onClick={() => reorderExercise(exerciseIndex, 1)} disabled={exerciseIndex === active.exercises.length - 1}>↓</button>
                      <button type="button" className="btn-ghost min-h-9 px-3 text-red-300" aria-label={`Remove ${exercise.exerciseName}`} onClick={() => updateWorkout({ exercises: active.exercises.filter((_item, index) => index !== exerciseIndex).map((item, index) => ({ ...item, sequence: index })) })}>×</button>
                    </div>
                  </div>

                  {previous && <div className="rounded-lg border border-violet-200/10 bg-violet-200/[0.04] p-3">
                    <p className="text-xs font-semibold text-violet-100">Previous workout</p>
                    <p className="mt-1 text-xs text-gray-300">{previous.sets.filter((set) => set.completed).map((set) => `${unitWeight(set.weightKg, active.unit)} ${active.unit} × ${set.reps}`).join(' · ') || 'No completed sets recorded'}</p>
                  </div>}

                  <div className="space-y-2">
                    <div className="hidden grid-cols-[2.4rem_1fr_1fr_5rem_6rem_2.8rem_2.8rem] gap-2 px-1 text-[10px] uppercase tracking-wider text-gray-500 sm:grid">
                      <span>Set</span><span>Weight ({active.unit})</span><span>Reps</span><span>RPE</span><span>Type</span><span>Done</span><span />
                    </div>
                    {exercise.sets.map((set, setIndex) => <div key={setIndex} className={`grid grid-cols-[2rem_1fr_1fr_1fr_2.8rem_2.8rem] gap-2 rounded-xl border p-2 sm:grid-cols-[2.4rem_1fr_1fr_5rem_6rem_2.8rem_2.8rem] ${set.completed ? 'border-good/30 bg-good/5' : 'border-white/5 bg-black/10'}`}>
                      <span className="flex items-center justify-center text-sm font-bold text-gray-300">{set.setNumber}</span>
                      <label className="sr-only" htmlFor={`weight-${exerciseIndex}-${setIndex}`}>Set {set.setNumber} weight in {active.unit}</label>
                      <input id={`weight-${exerciseIndex}-${setIndex}`} inputMode="decimal" type="number" min="0" step="0.5" value={unitWeight(set.weightKg, active.unit)} placeholder="Weight" onChange={(event) => updateSet(exerciseIndex, setIndex, { weightKg: event.target.value === '' ? null : storedWeight(event.target.value, active.unit) })} className="min-h-11 min-w-0 rounded-lg border border-white/10 bg-[#111c2a] px-2 text-base text-white" />
                      <label className="sr-only" htmlFor={`reps-${exerciseIndex}-${setIndex}`}>Set {set.setNumber} repetitions</label>
                      <input id={`reps-${exerciseIndex}-${setIndex}`} inputMode="numeric" type="number" min="1" max="1000" step="1" value={set.reps ?? ''} placeholder="Reps" onChange={(event) => updateSet(exerciseIndex, setIndex, { reps: event.target.value === '' ? null : Number(event.target.value) })} className="min-h-11 min-w-0 rounded-lg border border-white/10 bg-[#111c2a] px-2 text-base text-white" />
                      <label className="sr-only" htmlFor={`rpe-${exerciseIndex}-${setIndex}`}>Set {set.setNumber} RPE</label>
                      <input id={`rpe-${exerciseIndex}-${setIndex}`} inputMode="decimal" type="number" min="1" max="10" step="0.5" value={set.rpe ?? ''} placeholder="RPE" onChange={(event) => updateSet(exerciseIndex, setIndex, { rpe: event.target.value === '' ? null : Number(event.target.value) })} className="min-h-11 min-w-0 rounded-lg border border-white/10 bg-[#111c2a] px-2 text-base text-white" />
                      <label className="sr-only" htmlFor={`set-type-${exerciseIndex}-${setIndex}`}>Set {set.setNumber} type</label>
                      <select id={`set-type-${exerciseIndex}-${setIndex}`} value={set.setType} onChange={(event) => updateSet(exerciseIndex, setIndex, { setType: event.target.value })} className="col-span-6 min-h-11 rounded-lg border border-white/10 bg-[#111c2a] px-2 text-xs text-white sm:col-span-1">
                        {SET_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <button type="button" aria-label={`${set.completed ? 'Uncomplete' : 'Complete'} set ${set.setNumber}`} aria-pressed={set.completed} onClick={() => {
                        const completed = !set.completed
                        updateSet(exerciseIndex, setIndex, { completed })
                        if (completed && autoRest) startRest()
                      }} className={`min-h-11 rounded-lg border text-lg ${set.completed ? 'border-good/40 bg-good/10 text-good' : 'border-white/10 bg-white/[0.03] text-gray-300'}`}>{set.completed ? '✓' : '○'}</button>
                      <button type="button" aria-label={`Delete set ${set.setNumber}`} onClick={() => removeSet(exerciseIndex, setIndex)} className="min-h-11 rounded-lg border border-white/10 text-gray-400 hover:text-red-300">×</button>
                    </div>)}
                    <button type="button" onClick={() => addSet(exerciseIndex)} className="btn-ghost min-h-10 w-full text-sm">＋ Add set</button>
                  </div>
                </article>
              })}

              {active.exercises.length === 0 && <div className="empty-state"><p className="text-sm text-gray-400">Add an exercise from your library to begin tracking sets.</p></div>}

              <section className="card">
                <h2 className="font-game text-xs text-violet-200">ADD EXERCISE</h2>
                <button type="button" onClick={saveTemplate} className="btn-ghost mt-3 min-h-10 w-full text-sm">Save current exercises as template</button>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_15rem]">
                  <label className="sr-only" htmlFor="gym-exercise-search">Search exercises</label>
                  <input id="gym-exercise-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises or equipment" className="min-h-11 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
                  <label className="sr-only" htmlFor="gym-muscle-filter">Filter by muscle group</label>
                  <select id="gym-muscle-filter" value={muscle} onChange={(event) => setMuscle(event.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-[#111c2a] px-3 text-sm text-white">{muscleGroups.map((group) => <option key={group}>{group}</option>)}</select>
                </div>
                <ul className="mt-3 grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
                  {availableExercises.filter((item) => !active.exercises.some((exercise) => exercise.exerciseId === item.id)).map((item) => <li key={item.id}>
                    <button type="button" onClick={() => addExercise(item)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-left hover:border-violet-200/30">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{item.name}</span><span className="block truncate text-xs text-gray-400">{item.focus} · {item.equipment}</span></span><span aria-hidden="true" className="text-violet-200">＋</span>
                    </button>
                  </li>)}
                </ul>
                {availableExercises.length === 0 && <p className="mt-3 text-sm text-gray-400">No matching exercises in the current exercise library.</p>}
              </section>
            </div>

            <aside className="space-y-4">
              <section className="card lg:sticky lg:top-32">
                <h2 className="font-game text-xs text-violet-200">REST TIMER</h2>
                <p role="timer" aria-live="off" className="my-4 text-center font-mono text-5xl font-bold text-white">{clock(restTimer.endAt ? Math.max(0, Math.ceil((restTimer.endAt - timerNow) / 1000)) : restTimer.remaining)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {REST_PRESETS.map((duration) => <button key={duration} type="button" aria-pressed={restTimer.duration === duration} onClick={() => setRestDuration(duration)} className={`btn-ghost min-h-10 px-2 text-xs ${restTimer.duration === duration ? 'border-violet-200/40 text-violet-100' : ''}`}>{duration}s</button>)}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const seconds = Number(customRest); if (Number.isInteger(seconds) && seconds > 0 && seconds <= 3600) { setRestDuration(seconds); setCustomRest('') } }}>
                  <label className="sr-only" htmlFor="custom-rest">Custom rest duration in seconds</label>
                  <input id="custom-rest" type="number" min="1" max="3600" value={customRest} onChange={(event) => setCustomRest(event.target.value)} placeholder="Custom seconds" className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" />
                  <button className="btn-ghost min-h-10 px-3 text-xs" type="submit">Set</button>
                </form>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="btn min-h-11" onClick={toggleRest}>{restTimer.endAt ? 'Pause' : restTimer.remaining > 0 ? 'Resume' : 'Start'}</button>
                  <button type="button" className="btn-ghost min-h-11" onClick={() => changeRestTimer({ ...restTimer, remaining: 0, endAt: null })}>Reset</button>
                </div>
                <label className="mt-4 flex min-h-10 items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={autoRest} onChange={(event) => setAutoRest(event.target.checked)} />Start timer after completing a set</label>
                {timerError && <p role="status" className="mt-2 text-xs text-amber-200">{timerError}</p>}
              </section>
              <PlateCalculator unit={active.unit} />
            </aside>
          </div>
        </section>
      )}
    </div>
  )
}
