import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestEmailOtp, resendEmailOtp, verifyEmailOtp } from './email-otp'

describe('Supabase email OTP operations', () => {
  let auth

  beforeEach(() => {
    auth = {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' }, session: { access_token: 'mock-token' } }, error: null }),
    }
  })

  it('requests a code for a normalized email and allows first-time registration', async () => {
    await requestEmailOtp(auth, '  New.User@Example.com  ')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'new.user@example.com',
      options: { shouldCreateUser: true },
    })
  })

  it('resends through Supabase email OTP with the same signup and login flow', async () => {
    await resendEmailOtp(auth, 'member@example.com')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'member@example.com',
      options: { shouldCreateUser: true },
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
