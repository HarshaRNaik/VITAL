import { describe, expect, it } from 'vitest'
import { BADGES, getBadgeProgress } from './badges'
import { getLevelInfo, xpForLevel } from '../utils/xp'

const byId = (id) => BADGES.find((badge) => badge.id === id)

describe('achievement relic records', () => {
  it('preserves stable badge identifiers and unique records', () => {
    const ids = BADGES.map((badge) => badge.id)
    expect(ids).toEqual([
      'welcome', 'first-meal', 'first-workout', 'ten-meals', 'ten-workouts',
      'chatty', 'streak3', 'streak7', 'lvl5',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports measurable saved progress without claiming unavailable progress', () => {
    expect(getBadgeProgress(byId('ten-workouts'), {
      counts: { workout: 6 },
    })).toEqual({ current: 6, target: 10, available: true })
    expect(getBadgeProgress(byId('lvl5'), { totalXP: 1500 })).toEqual({
      current: 5, target: 5, available: true,
    })
    expect(getBadgeProgress(byId('lvl5'), null)).toEqual({
      current: 0, target: 0, available: false,
    })
  })

  it('matches level-five eligibility to the existing XP progression formula', () => {
    const badge = byId('lvl5')
    const threshold = [1, 2, 3, 4].reduce((total, level) => total + xpForLevel(level), 0)
    expect(threshold).toBe(1500)
    expect(getLevelInfo(threshold - 1).level).toBe(4)
    expect(getLevelInfo(threshold).level).toBe(5)
    expect(badge.test({ totalXP: threshold - 1 })).toBe(false)
    expect(badge.test({ totalXP: threshold })).toBe(true)
  })

  it('handles incomplete game snapshots safely', () => {
    expect(byId('first-meal').test({})).toBe(false)
    expect(byId('streak7').test({})).toBe(false)
  })
})
