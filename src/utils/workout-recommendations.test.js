import { describe, expect, it } from 'vitest'
import { isEquipmentCompatible, recommendWorkouts } from './workout-recommendations'

const plans = [
  { id: 'body', requiredEquipment: [], difficulty: 'Beginner', durationMinutes: 15, targetMuscles: ['Chest', 'Core'] },
  { id: 'db', requiredEquipment: ['Dumbbells'], difficulty: 'Beginner', durationMinutes: 20, targetMuscles: ['Chest'] },
  { id: 'mixed', requiredEquipment: ['Dumbbells', 'Gym machines'], difficulty: 'Beginner', durationMinutes: 20, targetMuscles: ['Chest'] },
  { id: 'advanced', requiredEquipment: [], difficulty: 'Advanced', durationMinutes: 10, targetMuscles: ['Chest'] },
]

describe('home workout recommendations', () => {
  it('keeps gym equipment out of no-equipment and dumbbell recommendations', () => {
    expect(plans.filter((plan) => isEquipmentCompatible(plan, 'No equipment')).map((plan) => plan.id)).toEqual(['body', 'advanced'])
    expect(plans.filter((plan) => isEquipmentCompatible(plan, 'Dumbbells')).map((plan) => plan.id)).toEqual(['body', 'db', 'advanced'])
  })

  it('matches level, duration, and muscle focus together', () => {
    const result = recommendWorkouts(plans, {
      equipment: 'No equipment', level: 'Beginner', duration: 15, muscle: 'Chest',
    })
    expect(result.map((plan) => plan.id)).toEqual(['body'])
  })
})
