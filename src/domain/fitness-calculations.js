const ACTIVITY_FACTORS = Object.freeze({
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
})

const finiteInRange = (value, min, max, label) => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be between ${min} and ${max}.`)
  }
}

export function calculateBmi(weightKg, heightCm) {
  finiteInRange(weightKg, 20, 500, 'Weight (kg)')
  finiteInRange(heightCm, 80, 260, 'Height (cm)')
  const heightM = heightCm / 100
  return Number((weightKg / (heightM * heightM)).toFixed(1))
}

export function calculateBmr({ weightKg, heightCm, ageYears, sex }) {
  finiteInRange(weightKg, 20, 300, 'Weight (kg)')
  finiteInRange(heightCm, 100, 240, 'Height (cm)')
  finiteInRange(ageYears, 18, 100, 'Age')
  if (!['female', 'male', 'average'].includes(sex)) {
    throw new RangeError('Sex must be female, male, or average for this estimate.')
  }
  const sexAdjustment = sex === 'male' ? 5 : sex === 'female' ? -161 : -78
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexAdjustment)
}

export function calculateTdee(bmr, activityLevel) {
  finiteInRange(bmr, 500, 5000, 'BMR')
  const factor = ACTIVITY_FACTORS[activityLevel]
  if (!factor) throw new RangeError('Select a supported activity level.')
  return Math.round(bmr * factor)
}

export function estimateCalorieTarget(tdee, goal = 'maintain') {
  finiteInRange(tdee, 1000, 8000, 'TDEE')
  const offsets = { lose: -300, maintain: 0, gain: 200 }
  if (!(goal in offsets)) throw new RangeError('Goal must be lose, maintain, or gain.')
  const calories = Math.round(tdee + offsets[goal])
  if (calories < 1200) throw new RangeError('This estimate is below the supported safe range; consult a qualified health professional.')
  return { calories, estimated: true, goal }
}

export function estimateMacroTargets(weightKg, calories) {
  finiteInRange(weightKg, 30, 300, 'Weight (kg)')
  finiteInRange(calories, 1000, 8000, 'Calories')
  const protein = Math.round(weightKg * 1.6)
  const fat = Math.round(weightKg * 0.8)
  const remainingCalories = calories - protein * 4 - fat * 9
  if (remainingCalories < 0) throw new RangeError('The selected calorie target cannot support these estimated macros.')
  const carbs = Math.round(remainingCalories / 4)
  return { proteinGrams: protein, carbohydrateGrams: carbs, fatGrams: fat, estimated: true }
}

export function kgToPounds(kilograms) {
  finiteInRange(kilograms, 0, 1000, 'Kilograms')
  return Number((kilograms * 2.2046226218).toFixed(2))
}

export function poundsToKg(pounds) {
  finiteInRange(pounds, 0, 2204.62, 'Pounds')
  return Number((pounds / 2.2046226218).toFixed(2))
}

export function cmToInches(centimeters) {
  finiteInRange(centimeters, 0, 300, 'Centimeters')
  return Number((centimeters / 2.54).toFixed(2))
}

export function inchesToCm(inches) {
  finiteInRange(inches, 0, 118.11, 'Inches')
  return Number((inches * 2.54).toFixed(2))
}

export function kmToMiles(kilometers) {
  finiteInRange(kilometers, 0, 100_000, 'Kilometers')
  return Number((kilometers * 0.6213711922).toFixed(3))
}

export function milesToKm(miles) {
  finiteInRange(miles, 0, 62_137.12, 'Miles')
  return Number((miles / 0.6213711922).toFixed(3))
}

export function calculatePaceSecondsPerKm(distanceKm, durationSeconds) {
  finiteInRange(distanceKm, 0.01, 100_000, 'Distance (km)')
  finiteInRange(durationSeconds, 1, 604_800, 'Duration (seconds)')
  return Math.round(durationSeconds / distanceKm)
}

export function calculateSpeedKph(distanceKm, durationSeconds) {
  finiteInRange(distanceKm, 0.01, 100_000, 'Distance (km)')
  finiteInRange(durationSeconds, 1, 604_800, 'Duration (seconds)')
  return Number((distanceKm / (durationSeconds / 3600)).toFixed(2))
}

export function estimateActivityCalories({ met, weightKg, durationSeconds }) {
  finiteInRange(met, 1, 20, 'MET')
  finiteInRange(weightKg, 20, 500, 'Weight (kg)')
  finiteInRange(durationSeconds, 1, 604_800, 'Duration (seconds)')
  return {
    calories: Math.round(met * 3.5 * weightKg / 200 * durationSeconds / 60),
    estimated: true,
  }
}

export function aggregateHydration(records, { from, to }) {
  if (!Array.isArray(records) || !isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new RangeError('Hydration records require a valid inclusive date range.')
  }
  const seen = new Set()
  const items = records.filter((record) => {
    if (!record || !isIsoDate(record.date)) throw new RangeError('Hydration records must have valid ISO dates.')
    if (record.date < from || record.date > to) return false
    const key = record.id || record.requestId
    if (!key) return true
    const identity = String(key)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  return {
    milliliters: items.reduce((total, record) => {
      const amount = Number(record.amountMl)
      if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('Hydration amounts must be positive finite values.')
      return total + amount
    }, 0),
    entries: items.length,
    daysLogged: new Set(items.map((record) => record.date)).size,
  }
}

export function calculateHabitStreak(completionDates, today) {
  if (!Array.isArray(completionDates) || !isIsoDate(today)) {
    throw new RangeError('Today must be a valid ISO date.')
  }
  if (completionDates.some((date) => !isIsoDate(date))) {
    throw new RangeError('Habit completion dates must be valid ISO dates.')
  }
  const dates = new Set(completionDates)
  const cursor = new Date(`${today}T00:00:00.000Z`)
  let streak = 0
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function aggregateFitnessAnalytics({
  workouts = [],
  activities = [],
  meals = [],
  measurements = [],
  hydration = [],
}) {
  const uniqueBy = (records, key, fallback) => [...new Map(records
    .filter((record) => record[key] || record[fallback])
    .map((record) => [record[key] || record[fallback], record])).values()]
  const sessions = uniqueBy(workouts, 'sessionId', 'id')
  const activitySessions = uniqueBy(activities, 'requestId', 'id')
  const uniqueMeals = uniqueBy(meals, 'requestId', 'id')
  const uniqueMeasurements = uniqueBy(measurements, 'id', 'id')
  const hydrationLogs = uniqueBy(hydration, 'requestId', 'id')
  const byPeriod = (records, period) => records.reduce((result, item) => {
    const key = String(item.date || '').slice(0, period === 'month' ? 7 : 10)
    if (key) result[key] = (result[key] || 0) + 1
    return result
  }, {})
  return {
    workoutCount: sessions.length,
    workoutMinutes: sessions.reduce((sum, item) => sum + Number(item.duration || 0), 0),
    workoutDays: new Set(sessions.map((item) => item.date)).size,
    activityCount: activitySessions.length,
    activityDistanceKm: activitySessions.reduce((sum, item) => sum + Number(item.distanceKm || 0), 0),
    activityMinutes: activitySessions.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0) / 60,
    nutrition: {
      calories: uniqueMeals.reduce((sum, item) => sum + Number(item.calories || 0), 0),
      proteinGrams: uniqueMeals.reduce((sum, item) => sum + Number(item.protein || 0), 0),
      carbohydrateGrams: uniqueMeals.reduce((sum, item) => sum + Number(item.carbs || 0), 0),
      fatGrams: uniqueMeals.reduce((sum, item) => sum + Number(item.fat || 0), 0),
      mealDays: new Set(uniqueMeals.map((item) => item.date)).size,
    },
    hydration: {
      milliliters: hydrationLogs.reduce((sum, item) => sum + Number(item.amountMl || 0), 0),
      entries: hydrationLogs.length,
      daysLogged: new Set(hydrationLogs.map((item) => item.date)).size,
    },
    measurementCount: uniqueMeasurements.length,
    dailyWorkouts: byPeriod(sessions, 'day'),
    monthlyWorkouts: byPeriod(sessions, 'month'),
  }
}

export function calculateFastingDuration(startedAt, endedAt = new Date()) {
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('Fasting timestamps must be valid and end after start.')
  }
  const durationMinutes = Math.floor((end - start) / 60_000)
  return {
    durationMinutes,
    remainingMinutes: 0,
    complete: true,
  }
}

export function calculateFastingRemaining(startedAt, targetHours, now = new Date()) {
  finiteInRange(targetHours, 1, 24, 'Fasting target hours')
  const start = new Date(startedAt).getTime()
  const current = new Date(now).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(current) || current < start) {
    throw new RangeError('Fasting timestamps must be valid and now cannot precede start.')
  }
  const targetMinutes = Math.round(targetHours * 60)
  const elapsedMinutes = Math.floor((current - start) / 60_000)
  return {
    durationMinutes: elapsedMinutes,
    remainingMinutes: Math.max(0, targetMinutes - elapsedMinutes),
    complete: elapsedMinutes >= targetMinutes,
  }
}
