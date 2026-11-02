import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import BackButton from '../components/BackButton'
import GoogleMark from '../components/GoogleMark'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'
import { GOALS } from '../data/constants'

export default function Register() {
  const { register, loginWithGoogle, resendVerification } = useAuth()
  const { applyGame } = useGame()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', goal: GOALS[2] })
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const set = (e) => setF((current) => ({ ...current, [e.target.name]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.name.trim()) er.name = 'Name is required'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = 'Enter a valid email'
    if (f.password.length < 12) er.password = 'At least 12 characters'
    if (f.confirm !== f.password) er.confirm = 'Passwords do not match'
    setErrors(er); setNotice('')
    if (Object.keys(er).length) return
    setSubmitting(true)
    try {
      const result = await register(f)
      if (typeof result === 'string') { setNotice(result); return }
      applyGame(result.game, 'register', result.user.id)
      nav('/')
    } finally { setSubmitting(false) }
  }

  async function googleSignUp() {
    setSubmitting(true); setErrors({}); setNotice('')
    const error = await loginWithGoogle('/')
    if (error) { setErrors({ email: error }); setSubmitting(false) }
  }

  async function resendEmail() {
    setSubmitting(true)
    const error = await resendVerification(f.email)
    setNotice(error || 'If this address has a pending signup, a verification email has been sent.')
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <BackButton />
        <h1 className="font-game text-xp text-xl mb-1">VITAL</h1>
        <p className="text-gray-400 text-sm mb-4">Create your account and start earning XP</p>
        <Field label="Name" name="name" autoComplete="name" value={f.name} onChange={set} error={errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={f.email} onChange={set} error={errors.email} />
        <div className="relative"><Field label="Password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set} error={errors.password} /><button type="button" className="btn-ghost absolute right-1 top-7 min-h-10 px-2 text-xs" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
        <Field label="Confirm password" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={f.confirm} onChange={set} error={errors.confirm} />
        <Field label="Your starting goal" name="goal" options={GOALS} value={f.goal} onChange={set} />
        {errors.email && <p role="alert" className="text-red-400 text-sm mb-2">{errors.email}</p>}
        {notice && <div role="status" className="text-emerald-300 text-sm mb-2">{notice}{notice.toLowerCase().includes('check your email') && <button type="button" className="ml-2 underline" disabled={submitting || !f.email} onClick={resendEmail}>Resend email</button>}</div>}
        <button className="btn w-full mt-2" disabled={submitting}>{submitting ? 'Please wait…' : 'Start my journey'}</button>
        <button type="button" className="btn-ghost mt-3 min-h-12 w-full justify-center gap-3 border border-white/15" disabled={submitting} onClick={googleSignUp}><GoogleMark />Continue with Google</button>
        <Link to="/login?mode=email" className="btn-ghost mt-2 flex min-h-11 w-full items-center justify-center text-sm">Use a one-time email code instead</Link>
        <p className="text-sm text-gray-400 mt-3">Already have an account? <Link to="/login" className="text-xp">Log in</Link></p>
      </form>
    </div>
  )
}
