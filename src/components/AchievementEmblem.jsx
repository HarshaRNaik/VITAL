import { useId } from 'react'

const rarityClass = {
  Common: 'relic-common',
  Rare: 'relic-rare',
  Epic: 'relic-epic',
  Legendary: 'relic-legendary',
  Mythic: 'relic-mythic',
}

function RelicSymbol({ symbol }) {
  switch (symbol) {
    case 'spark':
      return <><path d="M50 23 56 43 77 50 56 57 50 78 44 57 23 50 44 43Z" /><circle cx="50" cy="50" r="4" /></>
    case 'leaf':
      return <><path d="M69 29C48 29 31 39 31 56c0 10 8 16 18 15 18-2 23-22 20-42Z" /><path d="M34 68 64 37M47 56l-1-12m8 5 10-1" /></>
    case 'blade':
      return <><path d="m50 22 12 27-12 29-12-29 12-27Z" /><path d="M39 53h22M44 62l6 6 6-6" /><circle cx="50" cy="48" r="5" /></>
    case 'orbit':
      return <><circle cx="50" cy="50" r="10" /><ellipse cx="50" cy="50" rx="28" ry="11" transform="rotate(-35 50 50)" /><circle cx="69" cy="35" r="4" /></>
    case 'core':
      return <><path d="m50 27 20 12v22L50 73 30 61V39Z" /><path d="m50 36 12 7v14l-12 7-12-7V43Z" /><path d="M50 42v16m-8-8h16" /></>
    case 'pulse':
      return <><path d="M25 52h13l7-17 11 31 7-14h12" /><circle cx="50" cy="50" r="27" strokeDasharray="3 6" /></>
    case 'flame':
      return <><path d="M52 24c4 15-7 17-4 28 2-5 8-8 10-15 10 9 15 19 10 29-4 9-13 13-23 10-15-5-19-19-10-32 4-6 11-11 17-20Z" /><path d="M50 52c6 7 7 12 4 17-2 4-7 5-10 2-5-5-1-12 6-19Z" /></>
    case 'flare':
      return <><path d="M50 20 56 39 76 50 56 61 50 80 44 61 24 50 44 39Z" /><path d="m50 34 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" /><circle cx="50" cy="50" r="3" /></>
    case 'crown':
      return <><path d="m27 63 4-27 15 13 9-23 9 23 11-13 4 27Z" /><path d="M31 70h38M35 63v7m30-7v7" /><circle cx="31" cy="35" r="3" /><circle cx="55" cy="24" r="3" /><circle cx="74" cy="35" r="3" /></>
    default:
      return <><path d="M50 23 75 50 50 77 25 50Z" /><circle cx="50" cy="50" r="8" /></>
  }
}

export default function AchievementEmblem({ achievement, size = 'md', locked = false, unavailable = false }) {
  const gradientId = `relic-${useId().replaceAll(':', '')}`
  const sizeClass = size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-28 w-28' : 'h-20 w-20'

  return (
    <span className={`achievement-emblem ${rarityClass[achievement.rarity] || rarityClass.Common} ${locked ? 'achievement-emblem-locked' : ''} ${unavailable ? 'achievement-emblem-unavailable' : ''} ${sizeClass}`} role="img" aria-label={`${achievement.rarity} ${achievement.family}: ${achievement.name}${unavailable ? ', status unavailable' : locked ? ', locked' : ', unlocked'}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".88" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".16" />
          </linearGradient>
        </defs>
        <path className="relic-aura" d="m50 5 9 12 16-3 3 16 14 9-8 14 8 14-14 9-3 16-16-3-9 12-9-12-16 3-3-16-14-9 8-14-8-14 14-9 3-16 16 3Z" />
        {achievement.family === 'Awakening seal' && <><path className="relic-frame" d="M50 8 91 50 50 92 9 50Z" /><path className="relic-frame-soft" d="M50 19 81 50 50 81 19 50Z" /></>}
        {achievement.family === 'Hunter insignia' && <><path className="relic-frame" d="M50 9 82 22v28c0 20-12 33-32 42-20-9-32-22-32-42V22Z" /><path className="relic-frame-soft" d="M50 20 72 29v21c0 14-8 24-22 31-14-7-22-17-22-31V29Z" /></>}
        {achievement.family === 'System relic' && <><path className="relic-frame" d="m50 8 35 21v42L50 92 15 71V29Z" /><path className="relic-frame-soft" d="m50 19 25 15v32L50 81 25 66V34Z" /></>}
        {achievement.family === 'Streak sigil' && <><path className="relic-frame" d="M50 8c5 12 15 12 27 19-5 13 12 22 12 35 0 17-15 30-39 30S11 79 11 62c0-13 17-22 12-35C35 20 45 20 50 8Z" /><path className="relic-frame-soft" d="M50 22c4 9 11 10 19 15-4 10 8 17 8 26 0 12-11 21-27 21S23 75 23 63c0-9 12-16 8-26 8-5 15-6 19-15Z" /></>}
        <g className="relic-symbol" fill="none" stroke={`url(#${gradientId})`}><RelicSymbol symbol={achievement.symbol} /></g>
        {!locked && achievement.rarity === 'Legendary' && <circle className="relic-orbit" cx="50" cy="50" r="42" />}
        {locked && !unavailable && <g className="relic-lock"><rect x="42" y="47" width="16" height="13" rx="2" /><path d="M45 47v-4a5 5 0 0 1 10 0v4" /></g>}
      </svg>
    </span>
  )
}
