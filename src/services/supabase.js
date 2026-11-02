import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (search.has('code') || hash.has('error') || search.has('error')) {
    console.info('Supabase OAuth callback detected.', {
      path: window.location.pathname,
      authorizationCodePresent: search.has('code') || hash.has('code'),
      error: search.get('error') || hash.get('error') || null,
      errorCode: search.get('error_code') || hash.get('error_code') || null,
      errorDescription: search.get('error_description') || hash.get('error_description') || null,
    })
  }
}

export const hasSupabaseConfig = Boolean(url && anonKey)
export const supabase = hasSupabaseConfig
  ? createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  })
  : null

export class SupabaseConfigError extends Error {
  constructor(message = 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.') {
    super(message)
    this.name = 'SupabaseConfigError'
    this.code = 'SUPABASE_NOT_CONFIGURED'
  }
}

export function requireSupabase() {
  if (!supabase) throw new SupabaseConfigError()
  return supabase
}

export async function getSignedInUser() {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session?.user || null
}

export async function requireSignedInUser() {
  const user = await getSignedInUser()
  if (!user) {
    const error = new Error('Sign in or create an account to save private data.')
    error.code = 'AUTH_REQUIRED'
    throw error
  }
  return user
}
