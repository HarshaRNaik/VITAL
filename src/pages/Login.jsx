import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Field from '../components/Field'
import BackButton from '../components/BackButton'
import GoogleMark from '../components/GoogleMark'
import { useAuth } from '../context/auth-context'
import { authErrorMessage } from '../context/auth-errors'

const resendDelaySeconds = 60

export default function Login() {
  const { login, loginWithGoogle, requestEmailOtp, resendEmailOtp, verifyEmailOtp, resetPassword, updatePassword, user, status, recovery } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const callbackParams = useMemo(() => new URLSearchParams(location.hash.slice(1)), [location.hash])
  const callbackError = searchParams.get('error_description') || searchParams.get('error')
    || callbackParams.get('error_description') || callbackParams.get('error')
  const callbackErrorCode = searchParams.get('error_code') || callbackParams.get('error_code')
  const safeCallbackDetails = useMemo(() => Object.fromEntries(
    [...new URLSearchParams(`${location.search.slice(1)}&${location.hash.slice(1)}`)].filter(([key]) =>
      ['error', 'error_code', 'error_description', 'provider', 'type'].includes(key.toLowerCase()),
    ),
  ), [location.hash, location.search])
  const [f, setF] = useState({ email: '', password: '' })
  const [error, setError] = useState(() => (callbackError
    ? authErrorMessage({ message: callbackError, code: callbackErrorCode })
    : ''))
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [authMode, setAuthMode] = useState(searchParams.get('mode') === 'email' ? 'email' : 'choose')
  const [otp, setOtp] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)
  const isRecovery = recovery || searchParams.get('mode') === 'recovery'
  const nextPath = location.state?.from || searchParams.get('next') || '/'
  const safeNext = typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/'
  const set = (e) => setF((current) => ({ ...current, [e.target.name]: e.target.value }))

  useEffect(() => {
    if (status === 'ready' && user && !isRecovery) nav(safeNext, { replace: true })
  }, [status, user, isRecovery, nav, safeNext])

  useEffect(() => {
    if (!callbackError || !import.meta.env.DEV) return
    console.error('Google OAuth callback failed.', {
      error: callbackError,
      code: callbackErrorCode || null,
      status: searchParams.get('status') || callbackParams.get('status') || null,
      callback: `${location.pathname}${Object.keys(safeCallbackDetails).length ? `?${new URLSearchParams(safeCallbackDetails)}` : ''}`,
      sessionEstablished: Boolean(status === 'ready' && user),
      profileCreationFailed: /database error saving new user|profile/i.test(callbackError),
    })
  }, [callbackError, callbackErrorCode, callbackParams, location.pathname, safeCallbackDetails, searchParams, status, user])

  useEffect(() => {
    if (resendSeconds <= 0) return undefined
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  async function submit(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (isRecovery) {
      if (f.password.length < 12) return setError('Use at least 12 characters for your new password.')
      setSubmitting(true)
      try {
        const err = await updatePassword(f.password)
        if (err) return setError(err)
        setNotice('Your password has been updated.')
        nav('/', { replace: true })
      } finally { setSubmitting(false) }
      return
    }
    if (forgot) {
      if (!/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address.')
      setSubmitting(true)
      try {
        const err = await resetPassword(f.email)
        if (err) return setError(err)
        setNotice('If an account exists for that address, a password reset link has been sent.')
      } finally { setSubmitting(false) }
      return
    }
    if (authMode === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address.')
      setSubmitting(true)
      try {
        const err = await requestEmailOtp(f.email)
        if (err) return setError(err)
        setOtp('')
        setAuthMode('otp')
        setResendSeconds(resendDelaySeconds)
        setNotice(`We sent a six-digit sign-in code to ${f.email.trim()}.`)
      } finally { setSubmitting(false) }
      return
    }
    if (authMode === 'otp') {
      if (!/^\d{6}$/.test(otp)) return setError('Enter the six-digit code from your email.')
      setSubmitting(true)
      try {
        const err = await verifyEmailOtp(f.email, otp)
        if (err) return setError(err)
        nav(safeNext, { replace: true })
      } finally { setSubmitting(false) }
      return
    }
    if (!f.email || !f.password) return setError('Enter your email and password.')
    setSubmitting(true)
    try {
      const err = await login(f.email, f.password)
      if (err) return setError(err)
      nav(safeNext, { replace: true })
    } finally { setSubmitting(false) }
  }

  async function googleSignIn() {
    setError(''); setNotice(''); setSubmitting(true)
    const err = await loginWithGoogle(safeNext)
    if (err) { setError(err); setSubmitting(false) }
  }

  async function resendCode() {
    if (resendSeconds || submitting) return
    setError(''); setNotice(''); setSubmitting(true)
    try {
      const err = await resendEmailOtp(f.email)
      if (err) return setError(err)
      setOtp('')
      setResendSeconds(resendDelaySeconds)
      setNotice(`A new six-digit code was sent to ${f.email.trim()}. Use the latest code.`)
    } finally { setSubmitting(false) }
  }

  function changeMethod(mode) {
    setAuthMode(mode); setForgot(false); setOtp(''); setError(''); setNotice('')
  }

  const heading = isRecovery ? 'Choose a new password'
    : forgot ? 'Reset your password'
      : authMode === 'otp' ? 'Check your email'
        : authMode === 'email' ? 'Continue with email'
          : authMode === 'password' ? 'Welcome back, player'
            : 'Welcome to VITAL'

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <BackButton />
        <h1 className="font-game text-xp text-xl mb-1">VITAL</h1>
        <p className="text-gray-400 text-sm mb-4">{heading}</p>

        {isRecovery && <div className="relative"><Field label="New password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set} /><button type="button" className="btn-ghost absolute right-1 top-7 min-h-10 px-2 text-xs" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>}

        {!isRecovery && (authMode === 'email' || authMode === 'otp' || authMode === 'password' || forgot) && <Field label="Email" name="email" type="email" autoComplete="email" value={f.email} onChange={set} readOnly={authMode === 'otp' && !forgot} />}

        {authMode === 'otp' && !isRecovery && !forgot && <>
          <label className="mb-3 block">
            <span className="text-sm text-gray-300">Six-digit code</span>
            <input
              aria-label="Six-digit email code"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input text-center text-xl tracking-[0.45em]"
              placeholder="••••••"
              disabled={submitting}
              autoFocus
            />
          </label>
          <div className="mb-3 flex items-center justify-between text-sm text-gray-400">
            <button type="button" className="text-xp underline" disabled={submitting} onClick={() => changeMethod('email')}>Change email</button>
            <button type="button" className="text-xp underline disabled:text-gray-600" disabled={submitting || resendSeconds > 0} onClick={resendCode}>
              {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
            </button>
          </div>
        </>}

        {authMode === 'password' && !isRecovery && !forgot && <div className="relative"><Field label="Password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={f.password} onChange={set} /><button type="button" className="btn-ghost absolute right-1 top-7 min-h-10 px-2 text-xs" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>}

        {error && <p role="alert" className="text-red-400 text-sm mb-2">{error}</p>}
        {notice && <p role="status" className="text-emerald-300 text-sm mb-2">{notice}</p>}

        {isRecovery || forgot || authMode === 'email' || authMode === 'otp' || authMode === 'password'
          ? <button className="btn w-full" disabled={submitting}>{submitting ? 'Please wait…' : isRecovery ? 'Update password' : forgot ? 'Send reset link' : authMode === 'email' ? 'Send six-digit code' : authMode === 'otp' ? 'Verify code' : 'Log in'}</button>
          : <>
            <button type="button" onClick={googleSignIn} disabled={submitting} className="btn-ghost min-h-12 w-full justify-center gap-3 border border-white/15" aria-label="Continue with Google"><GoogleMark />Continue with Google</button>
            <div className="my-4 flex items-center gap-3 text-xs text-gray-500"><span className="h-px flex-1 bg-white/10" />OR<span className="h-px flex-1 bg-white/10" /></div>
            <button type="button" className="btn w-full" disabled={submitting} onClick={() => changeMethod('email')}>Continue with Email</button>
            <button type="button" className="btn-ghost mt-2 min-h-11 w-full justify-center text-sm" disabled={submitting} onClick={() => changeMethod('password')}>Use password instead</button>
          </>}

        {!isRecovery && !forgot && authMode === 'password' && <p className="mt-3 text-sm text-gray-400">Forgot password? <button type="button" className="text-xp underline" onClick={() => { setForgot(true); setError(''); setNotice('') }}>Reset it</button></p>}
        {!isRecovery && !forgot && authMode === 'email' && <button type="button" className="btn-ghost mt-3 min-h-10 w-full justify-center text-sm" onClick={() => changeMethod('choose')}>Back to sign-in options</button>}
        {!isRecovery && !forgot && authMode === 'otp' && <button type="button" className="btn-ghost mt-3 min-h-10 w-full justify-center text-sm" onClick={() => changeMethod('choose')}>Back to sign-in options</button>}
        {!isRecovery && forgot && <p className="mt-3 text-sm text-gray-400">Remember your password? <button type="button" className="text-xp underline" onClick={() => { setForgot(false); setAuthMode('password'); setNotice(''); setError('') }}>Back to login</button></p>}
        {!isRecovery && authMode === 'choose' && <p className="text-sm text-gray-400 mt-3">New here? <Link to="/register" className="text-xp">Create an account</Link></p>}
        {!isRecovery && authMode !== 'choose' && authMode !== 'otp' && !forgot && <p className="text-sm text-gray-400 mt-3">Already have an account? <button type="button" className="text-xp underline" onClick={() => changeMethod(authMode === 'password' ? 'email' : 'password')}>{authMode === 'password' ? 'Use email code' : 'Use password'}</button></p>}
      </form>
    </div>
  )
}
