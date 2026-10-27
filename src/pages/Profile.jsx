import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'
import AchievementEmblem from '../components/AchievementEmblem'
import { BADGES } from '../data/badges'
import { metrics, workouts } from '../services/api'
import { getLevelInfo } from '../utils/xp'

export default function Profile() {
  const { user } = useAuth()
  const { game, status: gameStatus, error: gameError } = useGame()
  const userId = user?.id
  const [historySnapshot, setHistorySnapshot] = useState({ userId: null, workouts: [], metrics: [], error: '' })
  const hasHistory = Boolean(userId && historySnapshot.userId === userId)
  const history = hasHistory ? historySnapshot : { workouts: [], metrics: [] }
  const loading = Boolean(userId && !hasHistory)
  const error = hasHistory ? historySnapshot.error : ''
  const { level, current, need, percent } = getLevelInfo(game.totalXP)
  const earnedBadges = user && gameStatus === 'ready' ? BADGES.filter((badge) => game.badges.includes(badge.id)) : []
  const totalMinutes = history.workouts.reduce((total, item) => total + Number(item.duration || 0), 0)
  const latestMetric = history.metrics[0]

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    Promise.all([workouts.list(), metrics.list()])
      .then(([workoutList, metricList]) => {
        if (!active) return
        setHistorySnapshot({
          userId,
          workouts: workoutList,
          metrics: metricList.sort((a, b) => b.date.localeCompare(a.date)),
          error: '',
        })
      })
      .catch((loadError) => {
        console.error('Failed to load player status:', loadError)
        if (active) setHistorySnapshot({
          userId,
          workouts: [],
          metrics: [],
          error: 'Could not load your saved player history. Please try again.',
        })
      })
    return () => { active = false }
  }, [userId])

  return (
    <div className="page-enter system-shell mx-auto max-w-5xl space-y-5 pb-6">
      <header className="system-panel system-hero relative overflow-hidden rounded-2xl p-5 sm:p-8">
        <div aria-hidden="true" className="system-grid pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-40" />
        <p className="system-kicker">Player file · private status</p>
        <h1 className="relative mt-3 text-3xl font-extrabold sm:text-4xl">{user?.name || 'Player status'}</h1>
        <p className="relative mt-2 text-sm text-gray-400">{user ? user.email : 'Sign in to view private profile data and saved progress.'}</p>
        {user?.goal && <p className="relative mt-3 text-sm text-cyan-100">Objective: {user.goal}</p>}
        {!user && <Link to="/login" className="btn mt-5 min-h-11">Sign in to sync status</Link>}
      </header>

      {(error || gameError) && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error || gameError}</p>}

      <section aria-label="Player progression" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="system-panel rounded-xl p-4"><p className="system-kicker">Rank</p><p className="system-value mt-2 text-3xl font-extrabold">{user ? `LVL ${level}` : '—'}</p></div>
        <div className="system-panel rounded-xl p-4"><p className="system-kicker">Total experience</p><p className="system-value mt-2 text-3xl font-extrabold">{user ? game.totalXP.toLocaleString() : '—'}<span className="ml-1 text-xs text-cyan-100/60">{user ? 'XP' : 'sign in'}</span></p></div>
        <div className="system-panel rounded-xl p-4"><p className="system-kicker">Current streak</p><p className="system-value mt-2 text-3xl font-extrabold">{user ? game.streak : '—'}<span className="ml-1 text-xs text-cyan-100/60">{user ? 'days' : 'sign in'}</span></p></div>
        <div className="system-panel rounded-xl p-4"><p className="system-kicker">Completed sessions</p><p className="system-value mt-2 text-3xl font-extrabold">{loading ? '…' : user ? history.workouts.length.toLocaleString() : '—'}</p></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="system-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="system-kicker">Experience progress</p><p className="mt-1 text-xs text-gray-500">Uses your saved account progression.</p></div><span className="text-sm font-bold text-cyan-100">{user ? `LVL ${level}` : 'UNLINKED'}</span></div>
          <div className="progress-track" role="progressbar" aria-label={`Level ${level} experience`} aria-valuemin="0" aria-valuemax={need} aria-valuenow={current}><div className="progress-fill progress-fill-xp" style={{ width: `${percent}%` }} /></div>
          <p className="mt-2 text-xs text-gray-400">{user ? `${current} / ${need} XP · ${need - current} XP to level ${level + 1}` : 'Sign in to load account progression.'}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="text-xs text-gray-500">Training time</p><p className="mt-1 text-xl font-bold text-white">{loading ? '…' : user ? `${totalMinutes.toLocaleString()} min` : 'Sign in to sync'}</p></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><p className="text-xs text-gray-500">Latest weight</p><p className="mt-1 text-xl font-bold text-white">{loading ? '…' : !user ? 'Sign in to sync' : latestMetric ? `${latestMetric.weight} kg` : 'Not configured'}</p></div>
          </div>
          {gameStatus === 'loading' && <p role="status" className="mt-3 text-xs text-gray-500">Syncing account progression…</p>}
        </div>

        <div className="system-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="system-kicker">Achievement relics</p><p className="mt-1 text-xs text-gray-500">{!user ? 'Sign in to sync saved milestones.' : gameStatus === 'loading' ? 'Syncing saved milestones…' : gameStatus === 'error' ? 'Saved milestones are unavailable.' : `${earnedBadges.length} recorded unlock${earnedBadges.length === 1 ? '' : 's'}`}</p></div><Link to="/achievements" className="text-xs font-semibold text-cyan-200 hover:text-white">Open gallery ↗</Link></div>
          {earnedBadges.length ? <div className="flex flex-wrap gap-3">{earnedBadges.slice(0, 5).map((badge) => <Link key={badge.id} to="/achievements" aria-label={`Inspect ${badge.name} achievement`}><AchievementEmblem achievement={badge} size="sm" /></Link>)}</div> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-gray-400">{!user ? 'Sign in to load private achievements.' : gameStatus === 'loading' ? 'Loading recorded achievements…' : gameStatus === 'error' ? 'Could not load recorded achievements.' : 'No achievements have been recorded yet.'}</p>}
        </div>
      </section>

      <section className="system-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between"><div><p className="system-kicker">Historical progress</p><p className="mt-1 text-xs text-gray-500">Workout and measurement history lives in Analytics.</p></div><Link to="/analytics" className="text-xs font-semibold text-cyan-200 hover:text-white">Open analytics ↗</Link></div>
        {loading ? <p role="status" className="text-sm text-gray-400">Loading saved history…</p> : history.workouts.length || history.metrics.length ? <p className="text-sm text-gray-300">{history.workouts.length} saved workouts · {history.metrics.length} recorded measurements · {totalMinutes.toLocaleString()} minutes trained</p> : <p className="text-sm text-gray-400">{user ? 'No private workout or measurement history is available yet.' : 'Sign in to load your private workout and measurement history.'}</p>}
      </section>
    </div>
  )
}
