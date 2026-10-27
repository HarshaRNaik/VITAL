import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AchievementEmblem from '../components/AchievementEmblem'
import { meals, workouts } from '../services/api'
import { useGame } from '../context/game-context'
import { useAuth } from '../context/auth-context'
import { BADGES } from '../data/badges'
import { DAILY_CALORIE_TARGET } from '../data/constants'
import { today, sum } from '../utils/helpers'
import { getLevelInfo, REWARDS } from '../utils/xp'

const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export default function Hub() {
  const { game, status: gameStatus, error: gameError } = useGame()
  const { user } = useAuth()
  const [todayMeals, setTodayMeals] = useState([])
  const [todayWorkouts, setTodayWorkouts] = useState([])
  const [allWorkouts, setAllWorkouts] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.all([meals.list(), workouts.list()])
      .then(([mealList, workoutList]) => {
        if (!active) return
        const date = today()
        setTodayMeals(mealList.filter((item) => item.date === date))
        setTodayWorkouts(workoutList.filter((item) => item.date === date))
        setAllWorkouts(workoutList)
        setRecentActivity([
          ...mealList.map((item) => ({ ...item, kind: 'meal' })),
          ...workoutList.map((item) => ({ ...item, kind: 'workout' })),
        ].sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 5))
        setLoadError('')
      })
      .catch((error) => {
        console.error('Failed to load dashboard activity:', error)
        if (active) setLoadError('Could not load your latest activity. Please refresh to try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const eaten = sum(todayMeals, 'calories')
  const calorieProgress = Math.min(Math.round((eaten / DAILY_CALORIE_TARGET) * 100), 100)
  const hasActivityToday = todayMeals.length > 0 || todayWorkouts.length > 0 || game.chatToday
  const mobilityToday = todayWorkouts.some((workout) => /mobility|recovery|yoga/i.test(
    `${workout.planCategory || ''} ${workout.name || ''}`
  ))
  const { level, current, need, percent } = getLevelInfo(game.totalXP)
  const quests = [
    {
      id: 'training',
      label: "Complete today's training",
      detail: 'Finish any guided or logged workout.',
      done: todayWorkouts.length > 0,
      count: Math.min(todayWorkouts.length, 1),
      total: 1,
      reward: `+${REWARDS.workout} XP · existing workout reward`,
      icon: '01',
      to: '/fitness',
      action: 'Choose a workout',
    },
    {
      id: 'recovery',
      label: 'Make room for recovery',
      detail: 'Complete a mobility, yoga, or recovery session.',
      done: mobilityToday,
      count: Number(mobilityToday),
      total: 1,
      reward: `+${REWARDS.workout} XP · existing workout reward`,
      icon: '02',
      to: '/fitness/workout?plan=mobility-reset',
      action: 'Start mobility reset',
    },
    {
      id: 'nutrition',
      label: 'Log a meal',
      detail: 'Keep your nutrition history up to date.',
      done: todayMeals.length > 0,
      count: Math.min(todayMeals.length, 1),
      total: 1,
      reward: `+${REWARDS.meal} XP · per saved meal`,
      icon: '03',
      to: '/diet',
      action: 'Log nutrition',
    },
    {
      id: 'streak',
      label: 'Protect your streak',
      detail: 'Any saved activity today keeps your existing streak moving.',
      done: game.streak > 0 && hasActivityToday,
      count: Number(game.streak > 0 && hasActivityToday),
      total: 1,
      reward: user ? `${game.streak} day${game.streak === 1 ? '' : 's'} · tracked` : 'Sign in to sync',
      icon: '04',
      to: '/fitness',
      action: 'Keep moving',
    },
  ]
  const completion = Math.round((quests.filter((quest) => quest.done).length / quests.length) * 100)
  const nextQuest = quests.find((quest) => !quest.done)
  const totalMinutes = allWorkouts.reduce((total, workout) => total + Number(workout.duration || 0), 0)
  const latestActivity = recentActivity[0]
  const attributes = [
    { label: 'Training volume', value: loading ? '…' : user ? `${totalMinutes.toLocaleString()} min` : '—', detail: user ? 'total logged time' : 'sign in to sync', icon: '◷' },
    { label: 'Sessions', value: loading ? '…' : user ? allWorkouts.length.toLocaleString() : '—', detail: user ? 'saved workouts' : 'sign in to sync', icon: '◇' },
    { label: 'Consistency', value: user ? `${game.streak} day${game.streak === 1 ? '' : 's'}` : '—', detail: user ? 'current streak' : 'sign in to sync', icon: '↗' },
  ]
  const unlockedBadges = BADGES.filter((badge) => user && gameStatus === 'ready' && game.badges.includes(badge.id))
  const featuredBadge = unlockedBadges[0]

  return (
    <div className="page-enter system-shell space-y-5 pb-6">
      <section className="system-panel system-hero relative overflow-hidden rounded-2xl p-5 sm:p-8">
        <div aria-hidden="true" className="system-grid pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-60" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-cyan-200/10 shadow-[0_0_90px_rgb(34_211_238_/_8%)] sm:right-10">
          <div className="absolute inset-7 rounded-full border border-cyan-200/10" />
          <div className="absolute inset-16 rounded-full border border-cyan-200/10" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <p className="system-kicker">{user ? 'System online' : 'Guest interface'} · {dateLabel.format(new Date())}</p>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Welcome, {user?.name || 'Player'}.</h1>
          <p className="mt-3 max-w-xl text-sm text-gray-300 sm:text-base">
            {user?.goal ? `Objective: ${user.goal}.` : 'Your progress is built from the activity you actually record.'}
            {' '}One session at a time.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to="/fitness" className="btn min-h-12 px-5">Open training library <span aria-hidden="true">↗</span></Link>
            <Link to="/profile" className="btn-ghost min-h-12">Player status</Link>
            {nextQuest && <p className="text-xs text-gray-400">Next objective: <span className="font-semibold text-cyan-100">{nextQuest.label}</span></p>}
          </div>
        </div>
        <div className="relative z-10 mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="system-kicker">Rank</p>
            <p className="system-value mt-1 text-2xl font-extrabold">{user ? `LVL ${level}` : '—'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="system-kicker">Experience</p>
            <p className="system-value mt-1 text-2xl font-extrabold">{user ? game.totalXP.toLocaleString() : '—'} <span className="text-xs text-cyan-100/60">{user ? 'XP' : 'sign in'}</span></p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="system-kicker">Streak</p>
            <p className="system-value mt-1 text-2xl font-extrabold">{user ? game.streak : '—'} <span className="text-xs text-cyan-100/60">{user ? 'days' : 'sign in'}</span></p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="system-kicker">Daily quests</p>
            <p className="system-value mt-1 text-2xl font-extrabold">{loading ? '…' : completion}<span className="text-xs text-cyan-100/60">{loading ? '' : '%'}</span></p>
          </div>
        </div>
        <div className="relative z-10 mt-4">
          <div className="progress-track" role="progressbar" aria-label={`Level ${level} experience`} aria-valuemin="0" aria-valuemax={need} aria-valuenow={current}>
            <div className="progress-fill progress-fill-xp" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-400">{user ? `${current} / ${need} XP to level ${level + 1}` : 'Sign in to sync your account progression.'}</p>
        </div>
      </section>

      {(loadError || gameError) && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{loadError || gameError}</p>}

      <section aria-label="Tracked player attributes" className="grid gap-3 sm:grid-cols-3">
        {attributes.map((attribute) => (
          <div key={attribute.label} className="system-panel rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div><p className="system-kicker">{attribute.label}</p><p className="system-value mt-2 text-2xl font-bold">{attribute.value}</p><p className="mt-1 text-xs text-gray-500">{attribute.detail}</p></div>
              <span aria-hidden="true" className="text-2xl text-cyan-200/70">{attribute.icon}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="system-panel rounded-2xl p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="system-kicker">Daily quest board</p><p className="mt-2 text-xs text-gray-400">{loading ? 'Syncing saved activity…' : `${quests.filter((quest) => quest.done).length} of ${quests.length} objectives complete · progress from saved activity`}</p></div>
            <span className="rounded-lg border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5 text-sm font-bold text-cyan-100">{loading ? '…' : `${completion}%`}</span>
          </div>
          <div className="progress-track mb-4" role="progressbar" aria-label="Daily quest completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={completion}>
            <div className="progress-fill" style={{ width: `${completion}%` }} />
          </div>
          <ul className="space-y-2" aria-busy={loading}>
            {loading
              ? <li role="status" className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-gray-400">Syncing today’s saved records…</li>
              : quests.map((quest) => (
              <li key={quest.id} className={`quest-step rounded-xl border p-3 ${quest.done ? 'border-teal-300/20 bg-teal-300/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${quest.done ? 'border-teal-200/25 bg-teal-200/10 text-teal-100' : 'border-white/10 bg-white/[0.03] text-cyan-100/70'}`}>{quest.done ? '✓' : quest.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-x-3"><p className={`text-sm font-semibold ${quest.done ? 'text-teal-100' : 'text-white'}`}>{quest.label}</p><span className="text-[11px] text-gray-500">{quest.count}/{quest.total}</span></div>
                    <p className="mt-0.5 text-xs text-gray-500">{quest.detail}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-100/70">{quest.reward}</span>
                      {!quest.done && <Link to={quest.to} className="text-xs font-semibold text-cyan-200 hover:text-white">{quest.action} →</Link>}
                    </div>
                  </div>
                </div>
              </li>
              ))}
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-gray-500">XP is awarded by the existing saved workout, meal, and coach actions. Quest completion is derived from those records and adds no duplicate reward.</p>
          {!user && <p className="mt-3 rounded-lg border border-violet-200/15 bg-violet-200/[0.04] p-3 text-xs text-gray-300">Guest mode does not load or save private quest progress. <Link to="/login" className="font-semibold text-cyan-200 hover:text-white">Sign in to sync ↗</Link></p>}
        </div>

        <div className="space-y-5">
          <div className="system-panel rounded-2xl p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="system-kicker">System notifications</p><p className="mt-2 text-xs text-gray-500">Recent saved activity</p></div>
              <span aria-hidden="true" className="text-xl text-cyan-100">⌁</span>
            </div>
            {loading ? <p role="status" className="text-sm text-gray-400">Syncing activity…</p> : latestActivity ? (
              <ul className="space-y-2">
                {recentActivity.slice(0, 4).map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/10 p-3">
                    <span aria-hidden="true" className="text-lg text-cyan-100">{item.kind === 'meal' ? '◈' : '◆'}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{item.kind === 'meal' ? 'Nutrition record saved' : 'Workout record saved'}</p><p className="truncate text-xs text-gray-500">{item.name} · {item.date}</p></div>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Saved</span>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-gray-400">{user ? 'No saved activity yet. Complete an action to activate your event feed.' : 'Sign in to sync saved activity notifications.'}</p>}
          </div>

          <div className="system-panel rounded-2xl p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="system-kicker">Tracked today</p><p className="mt-1 text-xs text-gray-500">Nutrition · {todayMeals.length} meal{todayMeals.length === 1 ? '' : 's'}</p></div>
              <Link to="/analytics" className="text-xs font-semibold text-cyan-200 hover:text-white">Analytics ↗</Link>
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="system-value text-3xl font-extrabold">{user ? eaten.toLocaleString() : '—'} <span className="text-xs font-semibold text-gray-500">{user ? 'kcal' : 'sign in'}</span></p>
              <p className="text-xs text-gray-500">{user ? `${eaten.toLocaleString()} / ${DAILY_CALORIE_TARGET.toLocaleString()} kcal target` : 'Sign in to sync your nutrition logs.'}</p>
            </div>
            <div className="progress-track mt-3" role="progressbar" aria-label="Daily calorie target" aria-valuemin="0" aria-valuemax={DAILY_CALORIE_TARGET} aria-valuenow={eaten}>
              <div className="progress-fill" style={{ width: `${calorieProgress}%` }} />
            </div>
            <p className="mt-3 text-xs text-gray-500">Total training: <span className="text-gray-300">{loading ? 'Syncing…' : user ? `${totalMinutes.toLocaleString()} minutes` : 'sign in to sync'}</span> · Completed sessions: <span className="text-gray-300">{loading ? '—' : user ? allWorkouts.length : '—'}</span></p>
          </div>
        </div>
      </section>

      <section className="system-panel rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="system-kicker">System relic archive</p><p className="mt-2 text-xs text-gray-500">{!user ? 'Sign in to load saved milestones.' : gameStatus === 'loading' ? 'Syncing saved milestones…' : gameStatus === 'error' ? 'Saved milestones are unavailable.' : `${unlockedBadges.length} of ${BADGES.length} awakened · unlocked from saved milestones`}</p></div>
          <Link to="/achievements" className="text-xs font-semibold text-cyan-200 hover:text-white">Open gallery ↗</Link>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-violet-200/10 bg-violet-200/[0.03] p-4">
          {featuredBadge ? <>
            <AchievementEmblem achievement={featuredBadge} size="md" />
            <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-[0.18em] text-violet-200">Featured awakened relic</p><p className="mt-1 text-lg font-bold text-white">{featuredBadge.name}</p><p className="mt-1 text-xs text-gray-400">{featuredBadge.desc} · {featuredBadge.rarity}</p></div>
          </> : <>
            <AchievementEmblem achievement={BADGES[0]} size="md" locked={Boolean(user && gameStatus === 'ready')} unavailable={!user || gameStatus !== 'ready'} />
            <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Relic records</p><p className="mt-1 text-sm font-semibold text-white">{!user ? 'Sign in to sync achievements from your account.' : gameStatus === 'loading' ? 'Loading saved achievement records…' : gameStatus === 'error' ? 'Could not load saved achievement records.' : 'Complete a recorded milestone to awaken your first relic.'}</p></div>
          </>}
          <Link to="/achievements" className="btn-ghost min-h-11">Inspect collection</Link>
        </div>
      </section>
    </div>
  )
}
