import { Link } from 'react-router-dom'
import AchievementGallery from '../components/AchievementGallery'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'

export default function Achievements() {
  const { game, status, error } = useGame()
  const { user } = useAuth()

  return (
    <div className="page-enter system-shell mx-auto max-w-6xl space-y-5 pb-6">
      <header className="system-panel system-hero relative overflow-hidden rounded-2xl p-5 sm:p-8">
        <div aria-hidden="true" className="system-grid pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-40" />
        <p className="system-kicker">Collection / achievement records</p>
        <h1 className="relative mt-3 text-3xl font-extrabold sm:text-4xl">System Relic Gallery</h1>
        <p className="relative mt-3 max-w-2xl text-sm text-gray-300">Original insignias for milestones already tracked by your account. Rarity describes the milestone tier; it does not change its reward.</p>
        {!user && <p className="relative mt-4 text-xs text-violet-200">Guest view · sign in to load saved unlocks and progress. <Link to="/login" className="font-semibold underline underline-offset-4">Sign in ↗</Link></p>}
      </header>
      <AchievementGallery game={game} signedIn={Boolean(user)} loading={status === 'loading'} error={error} />
    </div>
  )
}
