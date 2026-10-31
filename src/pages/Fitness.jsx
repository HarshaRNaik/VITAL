import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Field from '../components/Field'
import ExerciseAnimation from '../components/ExerciseAnimation'
import { workouts, metrics } from '../services/api'
import { useGame } from '../context/game-context'
import { WORKOUT_TYPES } from '../data/constants'
import { DIFFICULTIES, EQUIPMENT_CATEGORIES, TRAINING_CATEGORIES, WORKOUTS } from '../data/workouts'
import { today } from '../utils/helpers'
import { recommendWorkouts } from '../utils/workout-recommendations'

const HOME_PREFERENCES_KEY = 'vital-home-workout-preferences'
const defaultHomePreferences = { equipment: 'No equipment', level: 'Beginner', duration: '30', muscle: 'Any muscle group' }

function readHomePreferences() {
  try {
    return { ...defaultHomePreferences, ...JSON.parse(localStorage.getItem(HOME_PREFERENCES_KEY) || '{}') }
  } catch {
    return defaultHomePreferences
  }
}

const emptyW = () => ({
  type: 'Cardio',
  name: '',
  duration: '',
  calories: '',
  date: today(),
  sessionId: null,
})

const emptyM = () => ({
  weight: '',
  date: today(),
})

export default function Fitness() {
  const { applyGame } = useGame()
  const metricRequestId = useRef(null)

  const [wList, setWList] = useState([])
  const [mList, setMList] = useState([])
  const [w, setW] = useState(emptyW())
  const [m, setM] = useState(emptyM())
  const [editId, setEditId] = useState(null)
  const [wErr, setWErr] = useState({})
  const [mErr, setMErr] = useState({})
  const [feedback, setFeedback] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [equipmentFilter, setEquipmentFilter] = useState('All equipment')
  const [difficultyFilter, setDifficultyFilter] = useState('All levels')
  const [durationFilter, setDurationFilter] = useState('Any duration')
  const [muscleFilter, setMuscleFilter] = useState('All muscle groups')
  const [quickFilter, setQuickFilter] = useState('')
  const [selectedWorkoutId, setSelectedWorkoutId] = useState('')
  const [homePreferences, setHomePreferences] = useState(readHomePreferences)

  async function load() {
    try {
      const [workoutList, metricList] = await Promise.all([workouts.list(), metrics.list()])
      setWList(workoutList.sort((a, b) => b.date.localeCompare(a.date)))
      setMList(metricList.sort((a, b) => b.date.localeCompare(a.date)))
      setLoadError('')
    } catch (error) {
      console.error('Failed to load fitness history:', error)
      setLoadError('Could not load your fitness history. Please refresh to try again.')
    }
  }

  useEffect(() => {
    Promise.all([workouts.list(), metrics.list()])
      .then(([workoutList, metricList]) => {
        setWList(workoutList.sort((a, b) => b.date.localeCompare(a.date)))
        setMList(metricList.sort((a, b) => b.date.localeCompare(a.date)))
      })
      .catch((error) => {
        console.error('Failed to load fitness history:', error)
        setLoadError('Could not load your fitness history. Please refresh to try again.')
      })
  }, [])

  async function submitWorkout(e) {
    e.preventDefault()
    setFeedback('')

    const er = {}

    if (!w.name.trim()) er.name = 'Required'
    if (!(Number(w.duration) > 0) || !Number.isInteger(Number(w.duration))) {
      er.duration = 'Enter a whole number above 0'
    }
    if (w.calories !== '' && Number(w.calories) < 0) {
      er.calories = 'Cannot be negative'
    }
    if (!w.date) er.date = 'Required'

    setWErr(er)

    if (Object.keys(er).length) return

    const item = {
      type: w.type,
      name: w.name.trim(),
      duration: +w.duration,
      calories: +w.calories || 0,
      date: w.date,
      ...(w.sessionId && !editId ? { sessionId: w.sessionId } : {}),
    }

    setSaving(true)
    try {
      if (editId) {
        await workouts.update(editId, item)
        setEditId(null)
        setFeedback('Workout updated.')
      } else {
        item.sessionId = w.sessionId || crypto.randomUUID()
        const result = await workouts.add(item)
        applyGame(result.game, result.duplicate ? undefined : 'workout')
        setFeedback(result.duplicate ? 'Workout already recorded.' : 'Workout recorded. +25 XP')
      }
      setW(emptyW())
      setWErr({})
      await load()
    } catch (error) {
      console.error('Failed to save workout:', error)
      setFeedback(error.code === 'AUTH_REQUIRED' || error.code === 'SUPABASE_NOT_CONFIGURED'
        ? error.message
        : 'Could not save this workout. Please try again.')
      if (!editId) setW((current) => ({ ...current, sessionId: item.sessionId }))
    } finally {
      setSaving(false)
    }
  }

  async function submitMetric(e) {
    e.preventDefault()
    setFeedback('')

    const er = {}

    if (!(Number(m.weight) > 0)) {
      er.weight = 'Enter a valid weight'
    }

    if (!m.date) {
      er.date = 'Required'
    }

    setMErr(er)

    if (Object.keys(er).length) return

    setSaving(true)
    try {
      const result = await metrics.add({
        weight: +m.weight,
        date: m.date,
        requestId: metricRequestId.current || (metricRequestId.current = crypto.randomUUID()),
      })
      metricRequestId.current = null
      applyGame(result.game, result.duplicate ? undefined : 'weight')
      setFeedback('Weight measurement logged. +15 XP')
      setM(emptyM())
      setMErr({})
      await load()
    } catch (error) {
      console.error('Failed to save weight measurement:', error)
      setFeedback(error.code === 'AUTH_REQUIRED' || error.code === 'SUPABASE_NOT_CONFIGURED'
        ? error.message
        : 'Could not save this measurement. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const latestWeight = mList.length > 0 ? mList[0].weight : null

  const totalMinutes = wList.reduce(
    (total, workout) => total + Number(workout.duration || 0),
    0
  )

  const totalCalories = wList.reduce(
    (total, workout) => total + Number(workout.calories || 0),
    0
  )

  const muscleGroups = useMemo(() => [...new Set(WORKOUTS.flatMap((item) => item.targetMuscles))].sort(), [])
  const filteredWorkouts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return WORKOUTS.filter((item) => {
      const searchText = [item.name, item.description, ...item.targetMuscles, ...item.exercises.map((exercise) => exercise.name)].join(' ').toLowerCase()
      const durationMatches = durationFilter === 'Any duration'
        || (durationFilter === 'Under 15 min' && item.durationMinutes < 15)
        || (durationFilter === '15–30 min' && item.durationMinutes >= 15 && item.durationMinutes <= 30)
        || (durationFilter === 'Over 30 min' && item.durationMinutes > 30)
      const quickMatches = !quickFilter
        || (quickFilter === 'No equipment' && ['Bodyweight only', 'No-equipment cardio'].includes(item.equipment))
        || (quickFilter === 'Home workouts' && item.tags.includes('home'))
        || (quickFilter === 'Gym workouts' && item.tags.includes('gym'))
        || (quickFilter === 'Under 15 min' && item.durationMinutes < 15)
        || (quickFilter === 'Beginner friendly' && item.difficulty === 'Beginner')
        || (quickFilter === 'Full body' && item.category === 'Full body')
        || (quickFilter === 'Mixed training' && item.category === 'Mixed training courses')
      return (!query || searchText.includes(query))
        && (categoryFilter === 'All categories' || item.category === categoryFilter)
        && (equipmentFilter === 'All equipment' || item.equipment === equipmentFilter)
        && (difficultyFilter === 'All levels' || item.difficulty === difficultyFilter)
        && durationMatches
        && (muscleFilter === 'All muscle groups' || item.targetMuscles.includes(muscleFilter))
        && quickMatches
    })
  }, [search, categoryFilter, equipmentFilter, difficultyFilter, durationFilter, muscleFilter, quickFilter])
  const selectedWorkout = WORKOUTS.find((item) => item.id === selectedWorkoutId)
  const recommendedWorkouts = useMemo(() => recommendWorkouts(WORKOUTS, homePreferences), [homePreferences])

  function updateHomePreference(key, value) {
    setHomePreferences((current) => {
      const next = { ...current, [key]: value }
      try { localStorage.setItem(HOME_PREFERENCES_KEY, JSON.stringify(next)) } catch (error) {
        console.warn('Could not save Home Workout preferences:', error)
      }
      return next
    })
  }

  return (
    <div className="page-enter space-y-5 pb-6">

      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-xp/20 via-white/5 to-transparent p-5">
        <div className="relative z-10">
          <Link to="/workout" className="btn-ghost mb-2 inline-flex min-h-10 items-center text-xs">← Workout modes</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-xp">
            FITNESS
          </p>

          <h1 className="mt-2 text-2xl md:text-3xl font-bold">
            Train stronger. Move better. 💪
          </h1>

          <p className="mt-1 max-w-xl text-sm text-gray-400">
            Track your workouts, monitor your body metrics, and build
            consistency one session at a time.
          </p>
        </div>

        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-xp/10 blur-3xl" />
      </div>
      {loadError && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{loadError}</p>}
      {feedback && <p role="status" className={`rounded-xl border p-3 text-sm ${feedback.startsWith('Could not') ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-good/20 bg-good/5 text-good'}`}>{feedback}</p>}

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">Workouts</p>
              <p className="mt-1 text-2xl font-bold">
                {wList.length}
              </p>
            </div>

            <span className="text-xl">💪</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Total sessions
          </p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">Training time</p>
              <p className="mt-1 text-2xl font-bold">
                {totalMinutes}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  min
                </span>
              </p>
            </div>

            <span className="text-xl">⏱️</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Total duration
          </p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">Calories burned</p>
              <p className="mt-1 text-2xl font-bold">
                {totalCalories}
              </p>
            </div>

            <span className="text-xl">🔥</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Reported calories from logged workouts
          </p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">Latest weight</p>
              <p className="mt-1 text-2xl font-bold">
                {latestWeight ?? '—'}
                {latestWeight && (
                  <span className="ml-1 text-xs font-normal text-gray-500">
                    kg
                  </span>
                )}
              </p>
            </div>

            <span className="text-xl">⚖️</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">
            Latest measurement
          </p>
        </div>
      </div>

      <section id="workout-library" className="space-y-4">
        <section aria-label="Personalized home workout recommendations" className="system-panel rounded-2xl p-5 sm:p-6">
          <div>
            <p className="font-game text-xs text-cyan-200">YOUR HOME TRAINING SETUP</p>
            <h2 className="mt-2 text-xl font-bold text-white">Recommendations that fit your equipment.</h2>
            <p className="mt-1 text-sm text-gray-400">Change these any time. Gym-only plans are excluded when your equipment does not support them.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Available equipment" value={homePreferences.equipment} onChange={(event) => updateHomePreference('equipment', event.target.value)} options={['No equipment', 'Dumbbells', 'Resistance bands', 'Gym equipment']} />
            <Field label="Fitness level" value={homePreferences.level} onChange={(event) => updateHomePreference('level', event.target.value)} options={DIFFICULTIES} />
            <Field label="Available time" value={homePreferences.duration} onChange={(event) => updateHomePreference('duration', event.target.value)} options={['15', '20', '30', '45', '60']} />
            <Field label="Muscle focus" value={homePreferences.muscle} onChange={(event) => updateHomePreference('muscle', event.target.value)} options={['Any muscle group', ...muscleGroups]} />
          </div>
          {recommendedWorkouts.length === 0 ? <p className="mt-4 text-sm text-gray-400">No plans match all of these settings yet. Try a longer duration or choose any muscle group.</p> : (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {recommendedWorkouts.map((item) => <article key={item.id} className="rounded-xl border border-cyan-200/10 bg-black/15 p-4">
                <h3 className="font-semibold text-white">{item.name}</h3>
                <p className="mt-1 text-xs text-gray-400">{item.durationMinutes} min · {item.difficulty} · {item.equipment}</p>
                <button type="button" className="btn-ghost mt-3 min-h-10 w-full text-xs" onClick={() => { setSelectedWorkoutId(item.id); document.getElementById('workout-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>View compatible plan</button>
              </article>)}
            </div>
          )}
        </section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-game text-xs text-xp">WORKOUT LIBRARY</p>
            <h2 className="mt-2 text-2xl font-extrabold">Choose your session.</h2>
            <p className="mt-1 text-sm text-gray-400">Browse {WORKOUTS.length} plans with real exercise sequences, equipment, and modifications.</p>
          </div>
          <a href="#workout-log" className="btn-ghost min-h-11 text-sm">＋ Log completed training</a>
        </div>

        <div className="card space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Quick workout filters">
            {['No equipment', 'Home workouts', 'Gym workouts', 'Under 15 min', 'Beginner friendly', 'Full body', 'Mixed training'].map((filter) => (
              <button key={filter} type="button" aria-pressed={quickFilter === filter} className={`btn-ghost min-h-10 text-xs ${quickFilter === filter ? 'border-xp/40 bg-xp/10 text-xp' : ''}`} onClick={() => setQuickFilter(quickFilter === filter ? '' : filter)}>{filter}</button>
            ))}
          </div>
          <div className="grid gap-x-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Search workouts or movements" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try squats, mobility, cardio…" />
            <Field label="Training category" options={['All categories', ...TRAINING_CATEGORIES]} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} />
            <Field label="Equipment" options={['All equipment', ...EQUIPMENT_CATEGORIES]} value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)} />
            <Field label="Difficulty" options={['All levels', ...DIFFICULTIES]} value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} />
            <Field label="Duration" options={['Any duration', 'Under 15 min', '15–30 min', 'Over 30 min']} value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)} />
            <Field label="Target muscle group" options={['All muscle groups', ...muscleGroups]} value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value)} />
          </div>
          <p aria-live="polite" className="text-xs text-gray-500">{filteredWorkouts.length} {filteredWorkouts.length === 1 ? 'workout' : 'workouts'} match your filters.</p>
        </div>

        {selectedWorkout && (
          <article className="hero-panel p-5 sm:p-7" aria-label={`${selectedWorkout.name} details`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="badge">{selectedWorkout.category}</span>
                <h3 className="mt-3 text-2xl font-extrabold">{selectedWorkout.name}</h3>
                <p className="mt-2 max-w-2xl text-sm text-gray-300">{selectedWorkout.description}</p>
              </div>
              <button type="button" className="btn-ghost min-h-10" onClick={() => setSelectedWorkoutId('')}>Close details</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="badge">{selectedWorkout.durationMinutes} min {selectedWorkout.weeklySchedule ? 'course total' : 'estimated'}</span>
              <span className="badge">{selectedWorkout.difficulty}</span>
              <span className="badge">{selectedWorkout.equipment}</span>
              {selectedWorkout.targetMuscles.map((muscle) => <span key={muscle} className="badge">{muscle}</span>)}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Training goal</p>
            <p className="mt-1 text-sm text-white">{selectedWorkout.trainingGoal}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Equipment checklist</p>
            <p className="mt-1 text-sm text-white">{selectedWorkout.requiredEquipment.length ? selectedWorkout.requiredEquipment.join(', ') : 'No external equipment required'}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-gray-300"><span className="font-semibold text-white">Warm-up:</span> {selectedWorkout.warmup}</p>
              <p className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-gray-300"><span className="font-semibold text-white">Cooldown:</span> {selectedWorkout.cooldown}</p>
            </div>
            {selectedWorkout.weeklySchedule && <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Weekly course sequence</p>
              <ol className="mt-2 grid gap-2 sm:grid-cols-3">{selectedWorkout.weeklySchedule.map((session, sessionIndex) => {
                const sessionMovements = selectedWorkout.exercises.filter((exercise) => session.movementIds.includes(exercise.id))
                const sessionEquipment = [...new Set(sessionMovements.map((exercise) => exercise.equipment).filter((item) => item !== 'Bodyweight only' && item !== 'No-equipment cardio'))]
                return <li key={session.day} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs font-bold text-xp">{session.day} · {session.focus}</p>
                  <p className="mt-1 text-xs text-gray-400">{session.detail}</p>
                  <p className="mt-2 text-[11px] text-gray-500">{session.durationMinutes} min · {sessionEquipment.length ? sessionEquipment.join(', ') : 'No external equipment'}</p>
                  <Link to={`/fitness/workout?plan=${selectedWorkout.id}&courseSession=${sessionIndex}`} className="btn-ghost mt-3 min-h-10 justify-center text-xs">Start {session.day}</Link>
                </li>
              })}</ol>
            </div>}
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {selectedWorkout.exercises.map((exercise, index) => (
                <li key={`${exercise.id}-${index}`} className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div className="flex items-start gap-3">
                    {exercise.animationSrc
                      ? <ExerciseAnimation exercise={{ ...exercise, duration: exercise.tracking === 'timed' ? exercise.durationSeconds : 0 }} compact />
                      : <span className="text-lg">{exercise.emoji}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{index + 1}. {exercise.name}</p>
                      <p className="mt-1 text-xs text-gray-400">{exercise.tracking === 'reps' ? `${exercise.sets} sets × ${exercise.reps} reps` : `${exercise.sets} × ${exercise.durationSeconds}s`} · {exercise.restSeconds}s rest</p>
                      <p className="mt-1 text-xs text-gray-500">{exercise.instruction}</p>
                      {exercise.easier && <p className="mt-1 text-xs text-xp">Easier option: {exercise.easier}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-xl border border-streak/20 bg-streak/5 p-3 text-xs text-gray-300">Move at a controlled pace, use the listed alternatives when needed, and stop if you feel pain, dizziness, or anything concerning.</p>
            {!selectedWorkout.weeklySchedule && <Link to={`/fitness/workout?plan=${selectedWorkout.id}`} className="btn mt-4 min-h-12">Start workout <span aria-hidden="true">→</span></Link>}
          </article>
        )}

        {filteredWorkouts.length === 0 ? (
          <div className="empty-state min-h-44">
            <span className="text-3xl">🔎</span><p className="mt-2 text-sm font-semibold text-white">No plans match those filters</p>
            <p className="mt-1 text-xs text-gray-500">Try clearing a filter or searching for another movement.</p>
            <button type="button" className="btn-ghost mt-3" onClick={() => { setSearch(''); setCategoryFilter('All categories'); setEquipmentFilter('All equipment'); setDifficultyFilter('All levels'); setDurationFilter('Any duration'); setMuscleFilter('All muscle groups'); setQuickFilter('') }}>Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredWorkouts.map((item) => (
              <article key={item.id} className="card card-interactive flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-xp">{item.category}</p><h3 className="mt-2 text-base font-bold text-white">{item.name}</h3></div>
                  <span aria-hidden="true" className="rounded-xl bg-xp/10 p-2 text-xl">{item.equipment === 'Dumbbells' || item.equipment === 'Barbells and plates' || item.equipment === 'Kettlebells' ? '🏋️' : item.equipment === 'Gym machines' ? '🏢' : item.equipment === 'Resistance bands' ? '🟢' : item.category === 'Mixed training courses' ? '🔀' : item.category === 'Yoga and recovery' ? '🧘' : '🤸'}</span>
                </div>
                <p className="mt-2 flex-1 text-xs leading-relaxed text-gray-400">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="badge">{item.durationMinutes} min</span><span className="badge">{item.difficulty}</span><span className="badge">{item.equipment}</span>
                </div>
                <p className="mt-3 text-[11px] text-gray-500">{item.exercises.length} movements · {item.targetMuscles.join(' · ')}</p>
                <button type="button" className="btn-ghost mt-4 min-h-11 w-full" aria-expanded={selectedWorkoutId === item.id} onClick={() => { setSelectedWorkoutId(selectedWorkoutId === item.id ? '' : item.id); document.getElementById('workout-library')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>View plan & exercises</button>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Workout section */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">

        {/* Workout form */}
        <form id="workout-log" onSubmit={submitWorkout} className="card min-w-0">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                {editId ? 'EDIT WORKOUT' : 'LOG TRAINING'}
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                {editId
                  ? 'Update your workout details'
                  : 'Record a completed training session'}
              </p>
            </div>

            <span className="text-xl">
              {editId ? '✏️' : '➕'}
            </span>
          </div>

          <Field
            label="Exercise type"
            options={WORKOUT_TYPES}
            value={w.type}
            onChange={(e) =>
              setW({ ...w, type: e.target.value })
            }
          />

          <Field
            label="Workout name"
            value={w.name}
            onChange={(e) =>
              setW({ ...w, name: e.target.value })
            }
            error={wErr.name}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Duration (minutes)"
              type="number"
              value={w.duration}
              onChange={(e) =>
                setW({ ...w, duration: e.target.value })
              }
              error={wErr.duration}
            />

            <Field
              label="Calories burned"
              type="number"
              value={w.calories}
              onChange={(e) =>
                setW({ ...w, calories: e.target.value })
              }
              error={wErr.calories}
            />
          </div>

          <Field
            label="Date"
            type="date"
            value={w.date}
            onChange={(e) =>
              setW({ ...w, date: e.target.value })
            }
            error={wErr.date}
          />

          <div className="flex gap-2 pt-1">
            <button className="btn min-h-11 flex-1" disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Save changes' : 'Add workout (+25 XP)'}
            </button>

            {editId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setEditId(null)
                  setW(emptyW())
                  setWErr({})
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Workout history */}
        <div className="card min-w-0">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                WORKOUT HISTORY
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Your recent training sessions
              </p>
            </div>

            <span className="text-xl">📋</span>
          </div>

          {wList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <div className="text-4xl">🏃</div>

              <p className="mt-3 font-semibold">
                No workouts yet
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Log your first training session to start
                building your fitness history.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {wList.map((x) => (
                <li
                  key={x.id}
                  className="group rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all hover:border-white/10 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-xp/10 text-lg">
                      {x.type === 'Cardio'
                        ? '🏃'
                        : x.type === 'Strength'
                          ? '🏋️'
                          : x.type === 'Yoga'
                            ? '🧘'
                            : x.type === 'HIIT'
                              ? '⚡'
                              : '💪'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {x.name}
                      </p>

                      <p className="mt-0.5 text-xs text-gray-500">
                        {x.type} · {x.date}
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {x.duration} min
                        {x.planId && WORKOUTS.find((plan) => plan.id === x.planId)
                          ? ` actual · ${x.plannedDurationMinutes || WORKOUTS.find((plan) => plan.id === x.planId).durationMinutes} min planned`
                          : ''}
                        {x.calories > 0 ? ` · ${x.calories} kcal` : x.planId ? ' · calories not estimated' : ''}
                      </p>
                    </div>

                    <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        className="btn-ghost px-2"
                        onClick={() => {
                          setW(x)
                          setEditId(x.id)
                          setWErr({})
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="btn-ghost px-2 text-red-400"
                        onClick={async () => {
                          if (!window.confirm('Delete this workout from your history?')) return
                          try {
                            await workouts.remove(x.id)
                            setFeedback('Workout deleted.')
                            await load()
                          } catch (error) {
                            console.error('Failed to delete workout:', error)
                            setFeedback('Could not delete this workout. Please try again.')
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Body metrics */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">

        <form onSubmit={submitMetric} className="card min-w-0">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                BODY METRICS
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Keep track of your weight over time
              </p>
            </div>

            <span className="text-xl">⚖️</span>
          </div>

          <Field
            label="Weight (kg)"
            type="number"
            step="0.1"
            value={m.weight}
            onChange={(e) => {
              metricRequestId.current = null
              setM({ ...m, weight: e.target.value })
            }}
            error={mErr.weight}
          />

          <Field
            label="Date"
            type="date"
            value={m.date}
            onChange={(e) => {
              metricRequestId.current = null
              setM({ ...m, date: e.target.value })
            }}
            error={mErr.date}
          />

          <button className="btn min-h-11 w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Log weight (+15 XP)'}
          </button>
        </form>

        {/* Weight history */}
        <div className="card min-w-0">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                WEIGHT HISTORY
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Your recorded measurements
              </p>
            </div>

            <span className="text-xl">📈</span>
          </div>

          {mList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <div className="text-4xl">⚖️</div>

              <p className="mt-3 font-semibold">
                No weight entries yet
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Add your first measurement to start
                tracking your progress.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {mList.map((x) => (
                <li
                  key={x.id}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {x.weight} kg
                    </p>

                    <p className="mt-0.5 text-xs text-gray-500">
                      {x.date}
                    </p>
                  </div>

                  <button
                    className="btn-ghost text-red-400"
                    onClick={async () => {
                      if (!window.confirm('Delete this weight measurement?')) return
                      try {
                        await metrics.remove(x.id)
                        setFeedback('Weight measurement deleted.')
                        await load()
                      } catch (error) {
                        console.error('Failed to delete weight measurement:', error)
                        setFeedback('Could not delete this measurement. Please try again.')
                      }
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </div>
  )
}
