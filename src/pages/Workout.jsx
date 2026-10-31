import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { gymWorkouts, workouts } from '../services/api'

const startOfWeek = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

export default function Workout() {
  const [stats, setStats] = useState({ home: 0, homeWeek: 0, gym: 0, gymWeek: 0 })
  const [error, setError] = useState('')

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
