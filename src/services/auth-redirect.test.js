import { describe, expect, it } from 'vitest'
import { getAuthRedirectUrl, PRODUCTION_APP_ORIGIN } from './auth-redirect'

describe('authentication redirect URLs', () => {
  it('uses the VITAL FITNESS production origin for production callbacks', () => {
    expect(getAuthRedirectUrl('/login?mode=recovery', { production: true }))
      .toBe(`${PRODUCTION_APP_ORIGIN}/login?mode=recovery`)
  })

  it('keeps local auth callbacks on the current Vite origin', () => {
    expect(getAuthRedirectUrl('/login', { production: false, origin: 'http://localhost:5173' }))
      .toBe('http://localhost:5173/login')
  })

  it('rejects external redirect paths', () => {
    expect(() => getAuthRedirectUrl('//attacker.example/path', { production: true })).toThrow()
  })
})
