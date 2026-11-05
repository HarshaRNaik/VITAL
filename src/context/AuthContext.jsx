import { useEffect, useRef, useState } from 'react'
import { AuthContext } from './auth-context'
import { hasSupabaseConfig, supabase } from '../services/supabase'
import { authErrorMessage } from './auth-errors'
import {
  requestEmailOtp as sendLoginEmailOtp,
  resendEmailOtp as resendLoginEmailOtp,
  requestSignupEmailOtp as sendSignupEmailOtp,
  resendSignupEmailOtp as resendSignupEmailOtpCode,
  verifyEmailOtp as verifyEmailOtpCode,
} from '../services/email-otp'
import { getAuthRedirectUrl } from '../services/auth-redirect'

const initialGame = { totalXP: 50, streak: 0, lastActive: null, counts: { register: 1 }, badges: ['welcome'] }

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || user.user_metadata?.full_name || '',
    goal: user.user_metadata?.goal || '',
    photoUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(hasSupabaseConfig ? 'loading' : 'ready')
  const [recovery, setRecovery] = useState(false)
  const authEventReceived = useRef(false)
  const latestEventHadSession = useRef(false)

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event !== 'INITIAL_SESSION') {
        authEventReceived.current = true
        latestEventHadSession.current = Boolean(session)
      }
      setUser(publicUser(session?.user))
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setStatus('ready')
      if (import.meta.env.DEV) {
        console.info('Supabase auth state changed.', {
          event,
          sessionEstablished: Boolean(session),
          userIdPresent: Boolean(session?.user?.id),
        })
      }
    })

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (active && !authEventReceived.current) setUser(publicUser(data.session?.user))
        if (import.meta.env.DEV) {
          console.info('Supabase session restoration completed.', {
            sessionEstablished: Boolean(data.session),
            userIdPresent: Boolean(data.session?.user?.id),
            supersededByAuthEvent: authEventReceived.current,
          })
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('Supabase session restoration failed.', {
            message: error?.message || 'Unknown error',
            code: error?.code || error?.name || null,
            status: error?.status || null,
            sessionEstablished: latestEventHadSession.current,
          })
        }
        if (active && !authEventReceived.current) setUser(null)
      })
      .finally(() => {
        if (active && !authEventReceived.current) setStatus('ready')
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function register(data) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const { data: result, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: {
          data: { name: data.name.trim(), goal: data.goal },
          emailRedirectTo: getAuthRedirectUrl('/login'),
        },
      })
      if (error) throw error
      if (!result.user) throw new Error('Supabase did not return a registered user. Please try again.')
      if (Array.isArray(result.user.identities) && result.user.identities.length === 0) {
        return 'An account may already exist for this email. Try signing in or resetting your password.'
      }
      if (!result.session) return 'Check your email to confirm your account, then log in.'
      const signedInUser = publicUser(result.user)
      if (!signedInUser.emailVerified) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) throw signOutError
        setUser(null)
        setStatus('ready')
        return 'Verify your email before using your account. Check your inbox for the confirmation link.'
      }
      setUser(signedInUser)
      setStatus('ready')
      return { user: signedInUser, game: initialGame }
    } catch (error) {
      return authErrorMessage(error)
    }
  }

  async function login(email, password) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      if (data.user?.email && !data.user.email_confirmed_at && !data.user.confirmed_at) {
        await supabase.auth.signOut({ scope: 'local' })
        setUser(null)
        return 'Verify your email before signing in. You can resend the confirmation email from the signup page.'
      }
      setUser(publicUser(data.user))
      setStatus('ready')
      return null
    } catch (error) {
      return authErrorMessage(error)
    }
  }

  async function requestEmailOtp(email) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      await sendLoginEmailOtp(supabase.auth, email)
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function resendEmailOtp(email) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      await resendLoginEmailOtp(supabase.auth, email)
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function requestSignupOtp(email, profile) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      await sendSignupEmailOtp(supabase.auth, email, profile)
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function resendSignupOtp(email, profile) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      await resendSignupEmailOtpCode(supabase.auth, email, profile)
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function verifyEmailOtp(email, token) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const data = await verifyEmailOtpCode(supabase.auth, email, token)
      setUser(publicUser(data.user))
      setStatus('ready')
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function loginWithGoogle(nextPath = '/') {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const safeNext = typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/'
      const redirectTo = new URL(getAuthRedirectUrl('/login'))
      redirectTo.searchParams.set('next', safeNext)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo.toString(), queryParams: { prompt: 'select_account' } },
      })
      if (error) throw error
      return null
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Google OAuth initiation failed.', {
          message: error?.message || 'Unknown error',
          code: error?.code || null,
          status: error?.status || null,
          sessionEstablished: Boolean(user),
        })
      }
      return authErrorMessage(error)
    }
  }

  async function resetPassword(email) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('/login?mode=recovery'),
      })
      if (error) throw error
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function resendVerification(email) {
    try {
      if (!supabase) throw new Error('Supabase is not configured. Add the required VITE_SUPABASE environment variables.')
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: getAuthRedirectUrl('/login') } })
      if (error) throw error
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function updatePassword(password) {
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setRecovery(false)
      return null
    } catch (error) { return authErrorMessage(error) }
  }

  async function logout() {
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      return null
    } catch (error) {
      return authErrorMessage(error)
    }
  }

  return <AuthContext.Provider value={{ user, status, recovery, register, login, requestEmailOtp, resendEmailOtp, requestSignupOtp, resendSignupOtp, verifyEmailOtp, loginWithGoogle, resetPassword, resendVerification, updatePassword, logout }}>{children}</AuthContext.Provider>
}
