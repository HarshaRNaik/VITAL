export function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('redirect_uri_mismatch')) return 'Google OAuth is misconfigured: the redirect URI in Google Cloud must exactly match the callback URI shown in Supabase.'
  if (message.includes('redirect url') && (message.includes('not allowed') || message.includes('not authorized'))) return 'This app URL is not allowed by Supabase Auth. Add the current /login URL to Supabase Auth → URL Configuration → Redirect URLs.'
  if (message.includes('code verifier') || message.includes('pkce') || message.includes('auth code and code verifier')) return 'The sign-in session could not be verified. Restart Google sign-in in this browser and make sure the app URL stays the same during the redirect.'
  if (message.includes('database error saving new user')) return 'Google authentication succeeded, but Supabase could not finish creating the account. Check the Supabase Auth user trigger and database logs.'
  if (message.includes('expired') || message.includes('invalid otp') || message.includes('invalid token') || message.includes('token is invalid') || message.includes('otp_invalid')) return 'That code is invalid or expired. Request a new code and enter the latest six-digit code.'
  if (message.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (message.includes('email not confirmed')) return 'Please verify your email before signing in. You can resend the verification email below.'
  if (message.includes('user already registered')) return 'An account may already exist for this email. Try signing in or resetting your password.'
  if (message.includes('identity is already linked') || message.includes('already registered')) return 'This Google account is already connected to another account. Sign in with the original method first.'
  if (message.includes('popup') || message.includes('cancel')) return 'Google sign-in was closed before it finished. Try again when you are ready.'
  if (message.includes('network') || message.includes('fetch')) return 'A network error interrupted sign-in. Check your connection and try again.'
  if (message.includes('rate limit') || message.includes('over_email_send_rate_limit')) return 'Too many attempts. Wait a moment before requesting another email.'
  return error?.message || 'Authentication could not be completed. Please try again.'
}
