import { useEffect, useState } from 'react'
import { AuthContext } from './auth-context'
import { hasSupabaseConfig, supabase } from '../services/supabase'

const initialGame = { totalXP: 50, streak: 0, lastActive: null, counts: { register: 1 }, badges: ['welcome'], chatToday: false }

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || '',
    goal: user.user_metadata?.goal || '',
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(hasSupabaseConfig ? 'loading' : 'ready')

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined

    let active = true
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (active) setUser(publicUser(data.session?.user))
      })
      .catch((error) => {
        console.error('Failed to restore Supabase session:', error)
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setStatus('ready')
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(publicUser(session?.user))
        setStatus('ready')
      }
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
        options: { data: { name: data.name.trim(), goal: data.goal } },
      })
      if (error) throw error
      if (!result.session) return 'Check your email to confirm your account, then log in.'
      const signedInUser = publicUser(result.user)
      setUser(signedInUser)
      setStatus('ready')
      return { user: signedInUser, game: initialGame }
    } catch (error) {
      return error.message || 'Unable to create your account. Please try again.'
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
      setUser(publicUser(data.user))
      setStatus('ready')
      return null
    } catch (error) {
      return error.message || 'Unable to log in. Please try again.'
    }
  }

  async function logout() {
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      return null
    } catch (error) {
      return error.message || 'Unable to log out. Please try again.'
    }
  }

  return <AuthContext.Provider value={{ user, status, register, login, logout }}>{children}</AuthContext.Provider>
}