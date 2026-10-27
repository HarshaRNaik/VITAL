export const REWARDS = {
  register: 50,
  meal: 10,
  workout: 25,
  exercise: 10,
  weight: 15,
  chat: 5,
}

// XP needed to go from level n to n+1
export const xpForLevel = (n) => Math.round(100 * n * 1.5)

export function getLevelInfo(totalXP) {
  let level = 1
  let remaining = totalXP
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level++
  }
  const need = xpForLevel(level)
  return { level, current: remaining, need, percent: Math.round((remaining / need) * 100) }
}