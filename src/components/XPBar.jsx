import { useGame } from '../context/game-context'
import { useAuth } from '../context/auth-context'
import { getLevelInfo } from '../utils/xp'

export default function XPBar() {
  const { game, status } = useGame()
  const { user } = useAuth()
  const { level, current, need, percent } = getLevelInfo(game.totalXP)
  const syncing = Boolean(user && status === 'loading')
  return (
    <div className="system-panel mb-5 flex items-center gap-3 rounded-xl p-3 sm:gap-4 sm:p-4">
      <div className="shrink-0">
        <div className="font-game text-[10px] text-xp sm:text-xs">{syncing ? 'SYNC…' : user ? `RANK ${level}` : 'RANK —'}</div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">Player XP</p>
      </div>
      <div className="flex-1">
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={user ? `Level ${level} experience` : 'Sign in to sync XP'} aria-valuemin="0" aria-valuemax={need} aria-valuenow={user ? current : 0}>
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-200 transition-all duration-700" style={{ width: `${user ? percent : 0}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-400">{syncing ? 'Syncing account progression…' : user ? `${current} / ${need} XP` : 'Sign in to sync account XP'}{user && !syncing && <span className="text-gray-600"> to level {level + 1}</span>}</p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-extrabold text-violet-200">{syncing ? '…' : user ? `${game.streak}d` : '—'}</div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500">streak</p>
      </div>
    </div>
  )
}