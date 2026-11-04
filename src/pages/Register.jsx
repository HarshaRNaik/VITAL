import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import BackButton from '../components/BackButton'
import GoogleMark from '../components/GoogleMark'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'
import { GOALS } from '../data/constants'
import ThemeToggle from '../components/ThemeToggle'

const resendDelaySeconds = 60

export default function Register() {
  const { register, loginWithGoogle, resendVerification, requestSignupOtp, resendSignupOtp, verifyEmailOtp } = useAuth()
  const { applyGame } = useGame()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', goal: GOALS[2] })
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [signupMode, setSignupMode] = useState('password')
  const [otpRequested, setOtpRequested] = useState(false)
  const [otp, setOtp] = useState('')
  const [resendSeconds, setResendSeconds] = useState(0)
  const set = (e) => setF((current) => ({ ...current, [e.target.name]: e.target.value }))

  useEffect(() => {
    if (resendSeconds <= 0) return undefined
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  function validateEmailSignup() {
    const nextErrors = {}
    if (!f.name.trim()) nextErrors.name = 'Name is required'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) nextErrors.email = 'Enter a valid email'
    return nextErrors
  }

  async function submitEmailCodeSignup() {
    const validationErrors = validateEmailSignup()
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors)
      return
    }

    setSubmitting(true)
    try {
      if (!otpRequested) {
        const error = await requestSignupOtp(f.email, { name: f.name, goal: f.goal })
        if (error) { setErrors({ form: error }); return }
        setOtp('')
        setOtpRequested(true)
        setResendSeconds(resendDelaySeconds)
        setNotice(`We sent an account code to ${f.email.trim()}. If this email already has an account, the code will sign you in instead of creating another one.`)
        return
      }

      if (!/^\d{6}$/.test(otp)) {
        setErrors({ otp: 'Enter the six-digit code from your email.' })
        return
      }
      const error = await verifyEmailOtp(f.email, otp)
      if (error) { setErrors({ form: error }); return }
      nav('/', { replace: true })
    } finally { setSubmitting(false) }
  }

  async function submitPasswordSignup() {
    const nextErrors = validateEmailSignup()
    if (f.password.length < 12) nextErrors.password = 'At least 12 characters'
    if (f.confirm !== f.password) nextErrors.confirm = 'Passwords do not match'
    setErrors(nextErrors); setNotice('')
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    try {
      const result = await register(f)
      if (typeof result === 'string') { setNotice(result); return }
      applyGame(result.game, 'register', result.user.id)
      nav('/')
    } finally { setSubmitting(false) }
  }

  async function submit(e) {
    e.preventDefault()
    setErrors({}); setNotice('')
    if (signupMode === 'otp') return submitEmailCodeSignup()
    return submitPasswordSignup()
  }

  async function resendEmailCode() {
    if (resendSeconds || submitting) return
    setErrors({}); setNotice(''); setSubmitting(true)
    try {
      const error = await resendSignupOtp(f.email, { name: f.name, goal: f.goal })
      if (error) { setErrors({ form: error }); return }
      setOtp('')
      setResendSeconds(resendDelaySeconds)
      setNotice(`A new code was sent to ${f.email.trim()}. Use the latest code.`)
    } finally { setSubmitting(false) }
  }

  async function googleSignUp() {
    setSubmitting(true); setErrors({}); setNotice('')
    const error = await loginWithGoogle('/')
    if (error) { setErrors({ form: error }); setSubmitting(false) }
  }

  async function resendEmail() {
    setSubmitting(true)
    const error = await resendVerification(f.email)
    setNotice(error || 'If this address has a pending signup, a verification email has been sent.')
    setSubmitting(false)
  }

  function changeSignupMode(mode) {
    setSignupMode(mode)
    setOtpRequested(false)
    setOtp('')
    setResendSeconds(0)
    setErrors({})
    setNotice('')
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <form onSubmit={submit} className="card w-full max-w-sm">
        <BackButton />
        <h1 className="font-game text-xp text-xl mb-1">VITAL</h1>
        <p className="text-gray-400 text-sm mb-4">{signupMode === 'otp' ? 'Create an account with an email code' : 'Create your account and start earning XP'}</p>
        <Field label="Name" name="name" autoComplete="name" value={f.name} onChange={set} error={errors.name} readOnly={otpRequested} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={f.email} onChange={set} error={errors.email} readOnly={otpRequested} />
        {signupMode === 'password' && <>
          <div className="relative"><Field label="Password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set} error={errors.password} /><button type="button" className="btn-ghost absolute right-1 top-7 min-h-10 px-2 text-xs" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
          <Field label="Confirm password" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={f.confirm} onChange={set} error={errors.confirm} />
        </>}
        <Field label="Your starting goal" name="goal" options={GOALS} value={f.goal} onChange={set} disabled={otpRequested} />

        {otpRequested && <>
          <label className="mb-3 block">
            <span className="text-sm text-gray-300">Six-digit account code</span>
            <input
              aria-label="Six-digit account code"
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
          {errors.otp && <p role="alert" className="text-red-400 text-sm mb-2">{errors.otp}</p>}
          <button type="button" className="btn-ghost mb-2 min-h-10 w-full justify-center text-sm disabled:text-gray-600" disabled={submitting || resendSeconds > 0} onClick={resendEmailCode}>
            {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend account code'}
          </button>
        </>}

        {errors.form && <p role="alert" className="text-red-400 text-sm mb-2">{errors.form}</p>}
        {notice && <div role="status" className="text-emerald-300 text-sm mb-2">{notice}{signupMode === 'password' && notice.toLowerCase().includes('check your email') && <button type="button" className="ml-2 underline" disabled={submitting || !f.email} onClick={resendEmail}>Resend email</button>}</div>}
        <button className="btn w-full mt-2" disabled={submitting}>{submitting ? 'Please wait…' : signupMode === 'otp' ? otpRequested ? 'Verify code and continue' : 'Send account code' : 'Start my journey'}</button>
        {!otpRequested && <>
          {signupMode === 'password' && <button type="button" className="btn-ghost mt-3 min-h-12 w-full justify-center gap-3 border border-white/15" disabled={submitting} onClick={googleSignUp}><GoogleMark />Continue with Google</button>}
          <button type="button" className="btn-ghost mt-2 flex min-h-11 w-full items-center justify-center text-sm" disabled={submitting} onClick={() => changeSignupMode(signupMode === 'password' ? 'otp' : 'password')}>
            {signupMode === 'password' ? 'Sign up with an email code instead' : 'Use password signup instead'}
          </button>
        </>}
        <p className="text-sm text-gray-400 mt-3">Already have an account? <Link to="/login" className="text-xp">Log in</Link></p>
      </form>
    </div>
  )
}
