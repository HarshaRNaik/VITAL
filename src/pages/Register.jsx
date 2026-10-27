import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'
import { GOALS } from '../data/constants'

export default function Register() {
  const { register } = useAuth()
  const { applyGame } = useGame()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', goal: GOALS[2] })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const set = (e) => setF({ ...f, [e.target.name]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.name.trim()) er.name = 'Name is required'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = 'Enter a valid email'
    if (f.password.length < 12) er.password = 'At least 12 characters'
    if (f.confirm !== f.password) er.confirm = 'Passwords do not match'
    setErrors(er)
    if (Object.keys(er).length) return
    setSubmitting(true)
    try {
      const result = await register(f)
      if (typeof result === 'string') return setErrors({ email: result })
      applyGame(result.game, 'register', result.user.id)
      nav('/')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="font-game text-xp text-xl mb-1">VITAL</h1>
        <p className="text-gray-400 text-sm mb-4">Create your account and start earning XP</p>
        <Field label="Name" name="name" value={f.name} onChange={set} error={errors.name} />
        <Field label="Email" name="email" type="email" value={f.email} onChange={set} error={errors.email} />
        <Field label="Password" name="password" type="password" value={f.password} onChange={set} error={errors.password} />
        <Field label="Confirm password" name="confirm" type="password" value={f.confirm} onChange={set} error={errors.confirm} />
        <Field label="Your starting goal" name="goal" options={GOALS} value={f.goal} onChange={set} />
        <button className="btn w-full mt-2" disabled={submitting}>{submitting ? 'Creating account…' : 'Start my journey'}</button>
        <p className="text-sm text-gray-400 mt-3">
          Already have an account? <Link to="/login" className="text-xp">Log in</Link>
        </p>
      </form>
    </div>
  )
}