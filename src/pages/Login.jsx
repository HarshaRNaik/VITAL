import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Field from '../components/Field'
import { useAuth } from '../context/auth-context'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const set = (e) => setF({ ...f, [e.target.name]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (!f.email || !f.password) return setError('Enter your email and password')
    setError('')
    setSubmitting(true)
    try {
      const err = await login(f.email, f.password)
      if (err) return setError(err)
      nav('/')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <h1 className="font-game text-xp text-xl mb-1">VITAL</h1>
        <p className="text-gray-400 text-sm mb-4">Welcome back, player</p>
        <Field label="Email" name="email" type="email" value={f.email} onChange={set} />
        <Field label="Password" name="password" type="password" value={f.password} onChange={set} />
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button className="btn w-full" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
        <p className="text-sm text-gray-400 mt-3">
          New here? <Link to="/register" className="text-xp">Create an account</Link>
        </p>
      </form>
    </div>
  )
}