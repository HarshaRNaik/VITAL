function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export async function requestEmailOtp(auth, email) {
  const { error } = await auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

export async function resendEmailOtp(auth, email) {
  return requestEmailOtp(auth, email)
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
