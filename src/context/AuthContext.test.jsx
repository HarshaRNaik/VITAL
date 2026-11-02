import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './auth-errors'

describe('authentication error handling', () => {
  it('uses a safe message for invalid credentials', () => {
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toBe('Email or password is incorrect.')
  })

  it('explains verification requirements and recovery options', () => {
    expect(authErrorMessage({ message: 'Email not confirmed' })).toContain('verify your email')
  })

  it('handles cancelled Google OAuth without claiming a login', () => {
    expect(authErrorMessage({ message: 'User cancelled popup' })).toContain('closed before it finished')
  })

  it('explains that email codes can be invalid or expired', () => {
    expect(authErrorMessage({ message: 'Token has expired or is invalid' })).toContain('invalid or expired')
  })

  it('handles Supabase email rate limits without leaking provider details', () => {
    expect(authErrorMessage({ message: 'over_email_send_rate_limit' })).toContain('Wait a moment')
  })

  it('does not replace account-link conflicts with a success message', () => {
    expect(authErrorMessage({ message: 'Identity is already linked to another user' })).toContain('original method')
  })
})
