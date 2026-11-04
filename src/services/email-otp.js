import { getAuthRedirectUrl } from './auth-redirect'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function requestOtp(auth, email, options) {
  const { error } = await auth.signInWithOtp({
    email: normalizeEmail(email),
    options: {
      ...options,
      emailRedirectTo: getAuthRedirectUrl('/login'),
    },
  })
  if (error) throw error
}

export async function requestEmailOtp(auth, email) {
  return requestOtp(auth, email, { shouldCreateUser: false })
}

export async function resendEmailOtp(auth, email) {
  return requestEmailOtp(auth, email)
}

export async function requestSignupEmailOtp(auth, email, profile) {
  return requestOtp(auth, email, {
    shouldCreateUser: true,
    data: { name: String(profile?.name || '').trim(), goal: String(profile?.goal || '').trim() },
  })
}

export async function resendSignupEmailOtp(auth, email, profile) {
  return requestSignupEmailOtp(auth, email, profile)
}

export async function verifyEmailOtp(auth, email, token) {
  const { data, error } = await auth.verifyOtp({
    email: normalizeEmail(email),
    token: String(token || '').trim(),
    type: 'email',
  })
  if (error) throw error
  return data
}
