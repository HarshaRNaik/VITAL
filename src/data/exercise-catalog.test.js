import { describe, expect, it } from 'vitest'
import { searchExerciseDataset } from './exercise-catalog'

describe('exercise dataset catalog', () => {
  it('preserves source exercise IDs and supports bounded metadata searches', () => {
    const result = searchExerciseDataset({ query: '3/4 sit-up', limit: 1 })
    expect(result).toMatchObject({ total: 1, offset: 0, limit: 1 })
    expect(result.items[0]).toMatchObject({
      id: '0001',
      name: '3/4 sit-up',
      bodyPart: 'waist',
      equipment: 'body weight',
    })
    expect(result.items[0]).not.toHaveProperty('gifUrl')
  })

  it('filters by focus and equipment without modifying catalog identifiers', () => {
    const result = searchExerciseDataset({ focus: 'waist', equipment: 'body weight', limit: 500 })
    expect(result.total).toBeGreaterThan(0)
    expect(result.items.every((item) => item.bodyPart.includes('waist') && item.equipment.includes('body weight'))).toBe(true)
    expect(new Set(result.items.map((item) => item.id)).size).toBe(result.items.length)
  })

  it('rejects invalid pagination and filter input', () => {
    expect(() => searchExerciseDataset({ limit: 501 })).toThrow(RangeError)
    expect(() => searchExerciseDataset({ offset: -1 })).toThrow(RangeError)
    expect(() => searchExerciseDataset({ query: 3 })).toThrow(TypeError)
  })
})
