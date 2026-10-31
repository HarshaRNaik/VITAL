import { describe, expect, it } from 'vitest'
import { getSafeBackTarget } from './navigation'

describe('safe back navigation', () => {
  it('returns to the previous in-app history entry when one exists', () => {
    expect(getSafeBackTarget({ idx: 1 })).toBe(-1)
    expect(getSafeBackTarget({ idx: 3 })).toBe(-1)
  })

  it('falls back to the public landing page for direct or invalid history state', () => {
    expect(getSafeBackTarget({ idx: 0 })).toBe('/')
    expect(getSafeBackTarget(null)).toBe('/')
    expect(getSafeBackTarget({ idx: -1 })).toBe('/')
    expect(getSafeBackTarget({ idx: '2' })).toBe('/')
  })
})
