import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Navbar from './NavBar'
import XPBar from './XPBar'
import { useGame } from '../context/game-context'
import AchievementEmblem from './AchievementEmblem'

export default function Layout() {
  const { toast, levelUp, closeLevelUp, closeToast } = useGame()
  const reduceMotion = useReducedMotion()
  return (
    <div className="system-shell min-h-screen md:flex">
      <Navbar />
      <main className="min-w-0 w-full max-w-screen-2xl flex-1 p-4 pb-24 md:mx-auto md:p-6">
        <XPBar />
        <Outlet />
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: -10 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -40 }}
            role="status"
            className="system-toast fixed right-4 top-4 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-semibold sm:right-6 sm:top-6"
          >
            <div className="flex items-start gap-3">
              {toast.achievement && <AchievementEmblem achievement={toast.achievement} size="sm" />}
              <div className="min-w-0 flex-1">
                <span className="system-kicker block">System notification</span>
                {toast.achievement ? <>
                  <span className="mt-1 block text-sm font-bold text-white">{toast.achievement.name} awakened</span>
                  <span className="mt-1 block text-xs font-medium text-gray-300">{toast.achievement.family} · {toast.achievement.rarity}</span>
                </> : <span className="block">{toast.message}</span>}
                {toast.amount > 0 && <span className="mt-2 block text-xs text-cyan-100">+{toast.amount} XP activity reward</span>}
              </div>
              <button type="button" aria-label="Dismiss system notification" onClick={closeToast} className="rounded-md px-1 text-lg leading-none text-gray-400 hover:text-white">×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {levelUp && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#02050b]/85 p-4 backdrop-blur-sm"
            onClick={closeLevelUp}
          >
            <motion.div
              initial={reduceMotion ? false : { scale: 0.5 }}
              animate={{ scale: 1 }}
              className="system-panel animate-xp-pop rounded-2xl p-10 text-center"
            >
              <p className="mb-3 text-5xl text-violet-200">✧</p>
              <p className="system-kicker mb-2">System evolution</p>
              <h2 className="mb-2 font-game text-xl text-xp">LEVEL UP</h2>
              <p className="mb-4 text-gray-300">You reached level {levelUp}</p>
              <button className="btn" onClick={closeLevelUp}>Awesome</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}