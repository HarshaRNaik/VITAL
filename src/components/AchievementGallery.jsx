import { useMemo, useState } from 'react'
import { BADGES, getBadgeProgress } from '../data/badges'
import AchievementEmblem from './AchievementEmblem'

const rarities = ['All rarities', ...new Set(BADGES.map((badge) => badge.rarity))]
const categories = ['All categories', ...new Set(BADGES.map((badge) => badge.category))]

export default function AchievementGallery({ game, signedIn, loading = false, error = '' }) {
  const [rarity, setRarity] = useState('All rarities')
  const [category, setCategory] = useState('All categories')
  const [selectedId, setSelectedId] = useState(BADGES[0]?.id)
  const accountReady = signedIn && !loading && !error
  const unlockedIds = new Set(accountReady ? game.badges : [])
  const visibleBadges = useMemo(() => BADGES.filter((badge) => (
    (rarity === 'All rarities' || badge.rarity === rarity)
      && (category === 'All categories' || badge.category === category)
  )), [rarity, category])
  const selected = visibleBadges.find((badge) => badge.id === selectedId) || visibleBadges[0]
  const selectedUnlocked = selected ? unlockedIds.has(selected.id) : false
  const progress = selected && signedIn && !loading && !error
    ? getBadgeProgress(selected, game)
    : { current: 0, target: 0, available: false }

  function changeFilter(setter, value) {
    setter(value)
    setSelectedId(null)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="system-panel rounded-2xl p-4 sm:p-5" aria-label="Achievement relic gallery">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="system-kicker">Relic collection</p><p className="mt-1 text-xs text-gray-500">{!signedIn ? 'Sign in to verify account unlocks.' : loading ? 'Syncing saved milestones…' : error ? 'Saved milestones could not be loaded' : `${unlockedIds.size} of ${BADGES.length} relics awakened · unlocks come from saved milestones`}</p></div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="relic-rarity">Filter by rarity</label>
            <select id="relic-rarity" className="input !mt-0 min-h-10 w-auto text-xs" value={rarity} onChange={(event) => changeFilter(setRarity, event.target.value)}>
              {rarities.map((item) => <option key={item}>{item}</option>)}
            </select>
            <label className="sr-only" htmlFor="relic-category">Filter by category</label>
            <select id="relic-category" className="input !mt-0 min-h-10 w-auto text-xs" value={category} onChange={(event) => changeFilter(setCategory, event.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visibleBadges.map((badge) => {
            const unlocked = unlockedIds.has(badge.id)
            const isSelected = selected?.id === badge.id
            const statusLabel = accountReady
              ? unlocked ? 'Awakened' : 'Sealed'
              : loading ? 'Checking' : error ? 'Unavailable' : 'Sign in to verify'
            return (
              <li key={badge.id}>
                <button type="button" aria-pressed={isSelected} aria-label={`${badge.name}, ${badge.rarity}, ${statusLabel.toLowerCase()}`} onClick={() => setSelectedId(badge.id)} className={`relic-card flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center transition-colors ${isSelected ? 'border-cyan-100/40 bg-cyan-100/[0.06]' : 'border-white/10 bg-black/10 hover:border-cyan-100/25'} ${unlocked ? '' : 'relic-card-locked'}`}>
                  <AchievementEmblem achievement={badge} size="md" locked={accountReady && !unlocked} unavailable={!accountReady} />
                  <span className="text-sm font-semibold text-white">{badge.name}</span>
                  <span className="text-[9px] uppercase tracking-[0.16em] text-gray-400">{badge.rarity}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${unlocked ? 'text-teal-200' : 'text-gray-500'}`}>{statusLabel}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {!visibleBadges.length && <p className="empty-state mt-3">No relics match these filters.</p>}
      </section>

      <section className="system-panel h-fit rounded-2xl p-5 sm:p-7" aria-label="Selected achievement details" aria-live="polite">
        {selected ? <>
          <div className="flex flex-col items-center text-center">
            <AchievementEmblem achievement={selected} size="lg" locked={accountReady && !selectedUnlocked} unavailable={!accountReady} />
            <p className="system-kicker mt-4">{selected.family}</p>
            <h2 className="mt-2 text-2xl font-bold text-white">{selected.name}</h2>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span className={`rarity-chip rarity-${selected.rarity.toLowerCase()}`}>{selected.rarity}</span>
              <span className="badge">{selected.category}</span>
              <span className={selectedUnlocked ? 'badge badge-success' : 'badge'}>{selectedUnlocked ? 'Unlocked' : !accountReady ? loading ? 'Checking' : error ? 'Unavailable' : 'Unverified' : 'Locked'}</span>
            </div>
          </div>
          <dl className="mt-6 space-y-4 border-t border-white/10 pt-5">
            <div><dt className="system-kicker">Relic record</dt><dd className="mt-1 text-sm text-gray-300">{selected.desc}</dd></div>
            <div><dt className="system-kicker">Awakening condition</dt><dd className="mt-1 text-sm text-gray-300">{selected.requirement}</dd></div>
            <div>
              <dt className="system-kicker">Verified progress</dt>
              <dd className="mt-2">
                {progress.available ? <>
                  <div className="flex justify-between text-xs text-gray-400"><span>{Math.min(progress.current, progress.target)} / {progress.target}</span><span>{selectedUnlocked ? 'Requirement met' : 'In progress'}</span></div>
                  <div className="progress-track mt-2" role="progressbar" aria-label={`${selected.name} progress`} aria-valuemin="0" aria-valuemax={progress.target} aria-valuenow={Math.min(progress.current, progress.target)}>
                    <div className="progress-fill" style={{ width: `${progress.target ? Math.min(progress.current / progress.target * 100, 100) : 0}%` }} />
                  </div>
                </> : <p className="text-sm text-gray-400">{error ? 'Saved progress is unavailable because account synchronization failed.' : loading ? 'Loading saved achievement progress…' : signedIn ? 'Progress is unavailable for this record.' : 'Sign in to load saved achievement progress.'}</p>}
              </dd>
            </div>
            <div><dt className="system-kicker">Reward</dt><dd className="mt-1 text-sm text-gray-300">Recognition relic · no bonus XP. Existing activity rewards are unchanged.</dd></div>
            {selectedUnlocked && <div><dt className="system-kicker">Unlock record</dt><dd className="mt-1 text-sm text-gray-400">Unlocked on this account. A separate unlock timestamp is not stored.</dd></div>}
          </dl>
        </> : <p className="empty-state">Choose a relic to inspect its record.</p>}
      </section>
    </div>
  )
}
