import { useEffect, useRef, useState } from 'react'
import { useAuth } from './auth-context'
import { GameContext } from './game-context'
import { gameApi } from '../services/api'
import { REWARDS, getLevelInfo } from '../utils/xp'
import { BADGES } from '../data/badges'

const initial = { totalXP: 0, streak: 0, lastActive: null, counts: {}, badges: [], chatToday: false }

export function GameProvider({ children }) {
  const { user, status: authStatus } = useAuth()
  const userId = user?.id
  const [snapshot, setSnapshot] = useState({
    userId: null,
    game: initial,
    status: 'loading',
    error: '',
  })
  const hasCurrentGame = snapshot.userId === userId
  const game = userId && hasCurrentGame ? snapshot.game : initial
  const status = authStatus !== 'ready'
    ? 'loading'
    : !userId
      ? 'ready'
      : hasCurrentGame
        ? snapshot.status
        : 'loading'
  const error = hasCurrentGame ? snapshot.error : ''
  const [toast, setToast] = useState(null)
  const [levelUp, setLevelUp] = useState(null)
  const prevLevel = useRef(getLevelInfo(game.totalXP).level)

  useEffect(() => {
    if (authStatus !== 'ready' || !userId) return undefined
    let active = true

    gameApi.get()
      .then(({ game: persistedGame }) => {
        if (!active) return
        setSnapshot({ userId, game: persistedGame, status: 'ready', error: '' })
        prevLevel.current = getLevelInfo(persistedGame.totalXP).level
      })
      .catch((loadError) => {
        console.error('Failed to load game progress:', loadError)
        if (!active) return
        setSnapshot({
          userId,
          game: initial,
          status: 'error',
          error: 'Could not load your saved game progress. Please refresh to try again.',
        })
      })

    return () => { active = false }
  }, [authStatus, userId])

  useEffect(() => {
    const l = getLevelInfo(game.totalXP).level
    if (l > prevLevel.current) setLevelUp(l)
    prevLevel.current = l
  }, [game.totalXP])

  function applyGame(persistedGame, rewardType, ownerId = userId) {
    if (!persistedGame || typeof persistedGame.totalXP !== 'number') return
    const earnedXP = persistedGame.totalXP > game.totalXP
    const previousBadges = new Set(game.badges)
    const newlyUnlocked = (persistedGame.badges || []).filter((badgeId) => !previousBadges.has(badgeId))
    setSnapshot({ userId: ownerId, game: persistedGame, status: 'ready', error: '' })
    if ((earnedXP && rewardType && REWARDS[rewardType]) || newlyUnlocked.length) {
      const id = Date.now() + Math.random()
      const unlockedBadge = BADGES.find((badge) => badge.id === newlyUnlocked[0])
      const activity = {
        meal: 'Nutrition logged',
        workout: 'Workout completed',
        exercise: 'Exercise logged',
        weight: 'Progress updated',
        chat: 'Coach session complete',
        register: 'Player profile created',
      }[rewardType] || 'Progress saved'
      setToast({
        amount: earnedXP && rewardType ? REWARDS[rewardType] : 0,
        message: unlockedBadge ? `Achievement unlocked · ${unlockedBadge.name}` : activity,
        achievement: unlockedBadge || null,
        id,
      })
      setTimeout(() => setToast((current) => (current?.id === id ? null : current)), unlockedBadge ? 5000 : 3200)
    }
  }

  return (
    <GameContext.Provider value={{
      game,
      status,
      error,
      applyGame,
      toast,
      closeToast: () => setToast(null),
      levelUp,
      closeLevelUp: () => setLevelUp(null),
    }}>
      {children}
    </GameContext.Provider>
  )
}
