import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gymWorkouts, workouts } from '../services/api'
import { coachApi } from '../services/coach'
import { useAuth } from '../context/auth-context'

const startOfWeek = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

export default function Workout() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ home: 0, homeWeek: 0, gym: 0, gymWeek: 0 })
  const [error, setError] = useState('')
  const [plans, setPlans] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([workouts.list(), gymWorkouts.list()])
      .then(([homeSessions, gymSessions]) => {
        if (!active) return
        const weekStart = startOfWeek().getTime()
        const completedHome = homeSessions.filter((session) => session.status !== 'IN_PROGRESS')
        const completedGym = gymSessions.filter((session) => session.status === 'COMPLETED')
        setStats({
          home: completedHome.length,
          homeWeek: completedHome.filter((session) => new Date(`${session.date}T00:00:00`).getTime() >= weekStart).length,
          gym: completedGym.length,
          gymWeek: completedGym.filter((session) => new Date(session.startedAt).getTime() >= weekStart).length,
        })
        setError('')
      })
      .catch((loadError) => {
        console.error('Failed to load workout overview:', loadError)
        if (active) setError('Workout activity could not be loaded. Please try again later.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) { setPlans([]); return undefined }
    let active = true
    coachApi.workoutPlans.list().then((items) => { if (active) setPlans(items) }).catch((loadError) => {
      console.error('Failed to load saved workout plans:', loadError)
      if (active) setError('Saved workout plans could not be loaded. Apply the coach plan database migration, then refresh.')
    })
    return () => { active = false }
  }, [user])

  async function removePlan(id) {
    try { await coachApi.workoutPlans.remove(id); setPlans((items) => items.filter((plan) => plan.id !== id)) }
    catch (removeError) { setError(removeError.message || 'Could not remove this plan.') }
  }

  return (
    <div className="page-enter mx-auto max-w-5xl space-y-6 pb-6">
      <header className="hero-panel relative overflow-hidden p-6 sm:p-9">
        <p className="font-game text-xs text-xp">VITAL TRAINING</p>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Choose your workout.</h1>
        <p className="mt-3 max-w-2xl text-sm text-gray-300">
          Move at home or train for strength at the gym. Your sessions and progress stay separate.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}

      {user && <section className="system-panel rounded-2xl p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-game text-xs text-cyan-200">SAVED PROGRAMS</p><h2 className="mt-2 text-xl font-bold">Your AI workout plans</h2></div><Link to="/coach" className="btn min-h-10">Ask AI Coach</Link></div>
        {plans.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{plans.map((plan) => <li key={plan.id} className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold">{plan.title}</h3><p className="mt-1 text-xs text-gray-400">{plan.difficulty} · {plan.days?.length || 0} training days</p><p className="mt-2 text-sm text-gray-300">{plan.description}</p><div className="mt-3 flex flex-wrap gap-2">{(plan.days || []).map((day) => <span key={day.day} className="rounded-md bg-white/5 px-2 py-1 text-xs">{day.day}: {day.exercises?.length || 0} exercises</span>)}</div><div className="mt-3 flex justify-between"><Link to="/coach" className="text-xs text-cyan-100 underline">Modify with Coach</Link><button className="text-xs text-red-300" onClick={() => removePlan(plan.id)}>Delete</button></div></li>)}</ul> : <p className="mt-3 text-sm text-gray-400">No saved AI plans yet.</p>}
      </section>}

      <section aria-label="Workout modes" className="grid gap-4 md:grid-cols-2">
        <article className="system-panel group flex min-h-80 flex-col overflow-hidden rounded-2xl p-6 transition duration-200 hover:-translate-y-1 hover:border-cyan-200/30 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-game text-xs text-cyan-200">MOVE ANYWHERE</p>
              <h2 className="mt-3 text-2xl font-extrabold text-white">Home Workout</h2>
            </div>
            <span aria-hidden="true" className="text-5xl">🏠</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-gray-300">
            Train anywhere, anytime, with or without equipment. Pick up where your home workout library already is.
          </p>
          <div className="mt-auto grid grid-cols-2 gap-3 pt-7">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400">Sessions</p><p className="mt-1 text-xl font-bold text-white">{stats.home}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400">This week</p><p className="mt-1 text-xl font-bold text-white">{stats.homeWeek}</p>
            </div>
          </div>
          <Link to="/fitness" className="btn mt-4 flex min-h-12 items-center justify-center">
            Open Home Workout <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        </article>

        <article className="system-panel group flex min-h-80 flex-col overflow-hidden rounded-2xl border-violet-200/15 p-6 transition duration-200 hover:-translate-y-1 hover:border-violet-200/35 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-game text-xs text-violet-200">STRENGTH PROTOCOL</p>
              <h2 className="mt-3 text-2xl font-extrabold text-white">Gym Workout</h2>
            </div>
            <span aria-hidden="true" className="text-5xl">🏋️</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-gray-300">
            Your Gym Partner: log sets, track previous lifts, and see your strength and training volume over time.
          </p>
          <div className="mt-auto grid grid-cols-2 gap-3 pt-7">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400">Gym sessions</p><p className="mt-1 text-xl font-bold text-white">{stats.gym}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-gray-400">This week</p><p className="mt-1 text-xl font-bold text-white">{stats.gymWeek}</p>
            </div>
          </div>
          <Link to="/workout/gym" className="btn-ghost mt-4 flex min-h-12 items-center justify-center border-violet-200/20 text-violet-100 hover:border-violet-200/40">
            Open Gym Partner <span aria-hidden="true" className="ml-2">→</span>
          </Link>
        </article>
      </section>
    </div>
  )
}
