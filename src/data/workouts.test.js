import { describe, expect, it } from 'vitest'
import { MOVEMENTS, WORKOUTS } from './workouts'

const movementById = new Map(MOVEMENTS.map((movement) => [movement.id, movement]))
const plansById = new Map(WORKOUTS.map((workout) => [workout.id, workout]))

describe('curated training plans', () => {
  it('provides eight distinct dataset-backed movements for standard sessions', () => {
    for (const plan of WORKOUTS.filter((item) => !item.exerciseCountNote)) {
      expect(plan.exercises.length, plan.id).toBeGreaterThanOrEqual(8)
      expect(plan.exercises.length, plan.id).toBeLessThanOrEqual(12)
      expect(new Set(plan.exercises.map((item) => item.id)).size, plan.id).toBe(plan.exercises.length)
    }
  })

  it('preserves movement details, IDs, equipment, animations, and stable ordering', () => {
    for (const plan of WORKOUTS) {
      const required = new Set(plan.requiredEquipment)
      plan.exercises.forEach((exercise, index) => {
        const source = movementById.get(exercise.id)
        expect(source, `${plan.id}: ${exercise.id}`).toBeDefined()
        expect(exercise.name).toBe(source.name)
        expect(exercise.focus).toBe(source.focus)
        expect(exercise.equipment).toBe(source.equipment)
        expect(exercise.instruction).toBe(source.instruction)
        expect(exercise.easier).toBe(source.easier)
        expect(exercise.animationSrc).toBe(source.animationSrc)
        expect(exercise.order).toBe(index + 1)
        expect(exercise.sets).toBeGreaterThan(0)
        expect(exercise.restSeconds).toBeGreaterThanOrEqual(0)
        expect(exercise.tracking === 'timed' ? exercise.durationSeconds : exercise.reps).toBeGreaterThan(0)
        if (!['Bodyweight only', 'No-equipment cardio'].includes(exercise.equipment)) {
          expect(required.has(exercise.equipment), `${plan.id}: ${exercise.equipment}`).toBe(true)
        }
      })
    }
  })

  it.each([
    ['dumbbell-chest-triceps', 'Chest'],
    ['dumbbell-back-biceps', 'Back'],
    ['dumbbell-shoulders', 'Shoulders'],
    ['dumbbell-upper', 'Arms'],
    ['dumbbell-legs', 'Legs'],
    ['push-day', 'Push day'],
    ['pull-day', 'Pull day'],
    ['bodyweight-upper', 'Upper body'],
    ['bodyweight-lower', 'Lower body'],
    ['dumbbell-full', 'Full body'],
    ['hybrid-home', 'Home workout'],
    ['hybrid-gym', 'Gym workout'],
  ])('keeps %s at the exercise target for %s plans', (id) => {
    expect(plansById.get(id).exercises).toHaveLength(8)
  })

  it('adapts working sets to the experience level', () => {
    const beginner = plansById.get('machine-full')
    const intermediate = plansById.get('dumbbell-full')
    const advanced = plansById.get('barbell-upper')
    expect(beginner.exercises.every((item) => item.sets <= 2)).toBe(true)
    expect(intermediate.exercises.every((item) => item.sets <= 3)).toBe(true)
    expect(advanced.exercises.every((item) => item.sets <= 3)).toBe(true)
  })

  it('explains short recovery sessions and equipment-limited plans', () => {
    for (const id of ['quick-move', 'mobility-reset', 'band-mobility', 'yoga-recovery', 'core-starter', 'abs-stability', 'barbell-bench']) {
      expect(plansById.get(id).exerciseCountNote).toMatch(/minute|distinct|movements|recovery/i)
    }
  })

  it('expands the weekly strength session while documenting short cardio and recovery sessions', () => {
    const course = plansById.get('weekly-balanced')
    const [strength, cardio, recovery] = course.weeklySchedule
    expect(course.exercises.filter((item) => strength.movementIds.includes(item.id))).toHaveLength(8)
    expect(strength.durationMinutes).toBeGreaterThan(15)
    expect(cardio.exerciseCountNote).toContain('intentionally brief')
    expect(recovery.exerciseCountNote).toContain('intentionally brief')
  })
})
