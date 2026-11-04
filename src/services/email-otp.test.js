import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  requestEmailOtp,
  resendEmailOtp,
  requestSignupEmailOtp,
  resendSignupEmailOtp,
  verifyEmailOtp,
} from './email-otp'

describe('Supabase email OTP operations', () => {
  let auth

  beforeEach(() => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
    auth = {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' }, session: { access_token: 'mock-token' } }, error: null }),
    }
  })

  it('requests a sign-in code without creating an account', async () => {
    await requestEmailOtp(auth, '  New.User@Example.com  ')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'new.user@example.com',
      options: { shouldCreateUser: false, emailRedirectTo: expect.stringMatching(/\/login$/) },
    })
  })

  it('resends a sign-in code without creating an account', async () => {
    await resendEmailOtp(auth, 'member@example.com')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'member@example.com',
      options: { shouldCreateUser: false, emailRedirectTo: expect.stringMatching(/\/login$/) },
    })
  })

  it('requests account creation only through the explicit signup OTP flow', async () => {
    await requestSignupEmailOtp(auth, '  New.User@Example.com  ', { name: '  Alex  ', goal: 'Strength' })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'new.user@example.com',
      options: {
        shouldCreateUser: true,
        data: { name: 'Alex', goal: 'Strength' },
        emailRedirectTo: expect.stringMatching(/\/login$/),
      },
    })
  })

  it('resends signup codes using the same explicit registration intent and metadata', async () => {
    await resendSignupEmailOtp(auth, 'member@example.com', { name: 'Sam', goal: 'Mobility' })
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'member@example.com',
      options: {
        shouldCreateUser: true,
        data: { name: 'Sam', goal: 'Mobility' },
        emailRedirectTo: expect.stringMatching(/\/login$/),
      },
    })
  })

  it('verifies the six-digit email token using Supabase email OTP', async () => {
    const result = await verifyEmailOtp(auth, ' MEMBER@example.com ', '123456')
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'member@example.com', token: '123456', type: 'email' })
    expect(result.user.id).toBe('user-1')
  })

  it('surfaces invalid and expired codes to the authentication error handler', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: null, error: new Error('Token has expired or is invalid') })
    await expect(verifyEmailOtp(auth, 'member@example.com', '000000')).rejects.toThrow('expired or is invalid')
  })

  it('does not hide provider rate limits while resending', async () => {
    auth.signInWithOtp.mockResolvedValueOnce({ error: new Error('over_email_send_rate_limit') })
    await expect(resendEmailOtp(auth, 'member@example.com')).rejects.toThrow('over_email_send_rate_limit')
  })
})
