import { describe, expect, it } from 'vitest'
import {
  aggregateFitnessAnalytics,
  aggregateHydration,
  calculateBmi,
  calculateBmr,
  calculateFastingDuration,
  calculateFastingRemaining,
  calculateHabitStreak,
  calculatePaceSecondsPerKm,
  calculateSpeedKph,
  calculateTdee,
  estimateActivityCalories,
  estimateCalorieTarget,
  estimateMacroTargets,
  inchesToCm,
  kgToPounds,
  kmToMiles,
  milesToKm,
  poundsToKg,
} from './fitness-calculations'

describe('fitness calculation services', () => {
  it('calculates BMI and rejects invalid physical measurements', () => {
    expect(calculateBmi(70, 175)).toBe(22.9)
    expect(() => calculateBmi(0, 175)).toThrow(RangeError)
  })

  it('estimates basal and total daily energy with explicit activity levels', () => {
    expect(calculateBmr({ weightKg: 70, heightCm: 175, ageYears: 30, sex: 'male' })).toBe(1649)
    expect(calculateBmr({ weightKg: 70, heightCm: 175, ageYears: 30, sex: 'female' })).toBe(1483)
    expect(calculateTdee(2000, 'moderate')).toBe(3100)
    expect(() => calculateTdee(2000, 'unknown')).toThrow(RangeError)
  })

  it('returns labelled calorie and macro estimates without equating them to measured intake', () => {
    expect(estimateCalorieTarget(2200, 'lose')).toEqual({ calories: 1900, estimated: true, goal: 'lose' })
    expect(estimateMacroTargets(70, 2200)).toEqual({
      proteinGrams: 112,
      carbohydrateGrams: 312,
      fatGrams: 56,
      estimated: true,
    })
    expect(() => estimateCalorieTarget(1000, 'lose')).toThrow(RangeError)
    expect(() => estimateMacroTargets(300, 1000)).toThrow(RangeError)
  })

  it('converts supported units with bounded numeric inputs', () => {
    expect(kgToPounds(70)).toBe(154.32)
    expect(poundsToKg(154.32)).toBe(70)
    expect(inchesToCm(68.9)).toBeCloseTo(175, 0)
    expect(kmToMiles(5)).toBe(3.107)
    expect(milesToKm(3.107)).toBeCloseTo(5, 2)
    expect(() => poundsToKg(-5)).toThrow(RangeError)
  })

  it('calculates distance pace, speed, and labelled MET-based calorie estimates', () => {
    expect(calculatePaceSecondsPerKm(5, 1500)).toBe(300)
    expect(calculateSpeedKph(5, 1500)).toBe(12)
    expect(estimateActivityCalories({ met: 6, weightKg: 70, durationSeconds: 1800 })).toEqual({ calories: 221, estimated: true })
  })

  it('aggregates unique hydration records by actual dates', () => {
    expect(aggregateHydration([
      { id: 'a', amountMl: 400, date: '2026-11-01' },
      { id: 'a', amountMl: 400, date: '2026-11-01' },
      { id: 'b', amountMl: 250, date: '2026-11-02' },
      { id: 'c', amountMl: 900, date: '2026-10-31' },
    ], { from: '2026-11-01', to: '2026-11-02' })).toEqual({ milliliters: 650, entries: 2, daysLogged: 2 })
    expect(() => aggregateHydration([], { from: '2026-02-31', to: '2026-03-01' })).toThrow(RangeError)
    expect(() => aggregateHydration([{ date: '2026-11-01', amountMl: 0 }], { from: '2026-11-01', to: '2026-11-01' })).toThrow(RangeError)
  })

  it('calculates consecutive habit completion through today', () => {
    expect(calculateHabitStreak(['2026-11-02', '2026-11-03', '2026-11-04', '2026-10-30'], '2026-11-04')).toBe(3)
    expect(calculateHabitStreak(['2026-11-03'], '2026-11-04')).toBe(0)
    expect(() => calculateHabitStreak([], '2026-02-31')).toThrow(RangeError)
    expect(() => calculateHabitStreak(['2026-02-31'], '2026-03-01')).toThrow(RangeError)
  })

  it('aggregates unique workout, activity, and consumed nutrition records', () => {
    expect(aggregateFitnessAnalytics({
      workouts: [
        { id: 'w1', sessionId: 's1', date: '2026-11-01', duration: 30 },
        { id: 'w2', sessionId: 's1', date: '2026-11-01', duration: 30 },
        { id: 'w3', date: '2026-11-02', duration: 20 },
      ],
      activities: [{ id: 'a1', distanceKm: 3, durationSeconds: 1800 }],
      meals: [{ id: 'm1', date: '2026-11-01', calories: 500, protein: 25, carbs: 60, fat: 10 }],
      measurements: [{ id: 'b1' }],
      hydration: [
        { id: 'h1', date: '2026-11-01', amountMl: 300 },
        { id: 'h1', date: '2026-11-01', amountMl: 300 },
      ],
    })).toMatchObject({
      workoutCount: 2,
      workoutMinutes: 50,
      workoutDays: 2,
      activityCount: 1,
      activityDistanceKm: 3,
      nutrition: { calories: 500, proteinGrams: 25, carbohydrateGrams: 60, fatGrams: 10, mealDays: 1 },
      hydration: { milliliters: 300, entries: 1, daysLogged: 1 },
      measurementCount: 1,
    })
  })

  it('calculates fasting elapsed and remaining durations from timestamps', () => {
    expect(calculateFastingDuration('2026-11-04T00:00:00Z', '2026-11-04T08:30:00Z')).toMatchObject({
      durationMinutes: 510,
      complete: true,
    })
    expect(calculateFastingRemaining('2026-11-04T00:00:00Z', 16, '2026-11-04T08:30:00Z')).toMatchObject({
      durationMinutes: 510,
      remainingMinutes: 450,
      complete: false,
    })
    expect(() => calculateFastingDuration('bad-date', '2026-11-04T08:30:00Z')).toThrow(RangeError)
  })
})
