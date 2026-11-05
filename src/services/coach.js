import { requireSignedInUser, requireSupabase } from './supabase'

async function accessToken() {
  const { data, error } = await requireSupabase().auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw Object.assign(new Error('Sign in to use your private AI Coach.'), { code: 'AUTH_REQUIRED' })
  return token
}

export const coachApi = {
  generate: async (message, history = []) => {
    await requireSignedInUser()
    const token = await accessToken()
    const response = await fetch('/api/coach/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, history: history.slice(-8).map(({ role, content }) => ({ role: role === 'user' ? 'user' : 'coach', content: content.slice(0, 1200) })) }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw Object.assign(new Error(body?.error?.message || 'The coach could not complete this request.'), { code: body?.error?.code })
    return body
  },
  workoutPlans: {
    list: async () => {
      await requireSignedInUser()
      const { data, error } = await requireSupabase().from('workout_programs').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    save: async (plan, draftId = crypto.randomUUID()) => {
      const user = await requireSignedInUser()
      const { data, error } = await requireSupabase().from('workout_programs').upsert({ user_id: user.id, draft_id: draftId, title: plan.title, description: plan.description, difficulty: plan.difficulty, days: plan.trainingDays }, { onConflict: 'user_id,draft_id' }).select('*').single()
      if (error) throw error
      return data
    },
    update: async (id, plan) => {
      await requireSignedInUser()
      const { data, error } = await requireSupabase().from('workout_programs').update({ title: plan.title, description: plan.description, difficulty: plan.difficulty, days: plan.trainingDays }).eq('id', id).select('*').single()
      if (error) throw error
      return data
    },
    remove: async (id) => {
      await requireSignedInUser()
      const { error } = await requireSupabase().from('workout_programs').delete().eq('id', id)
      if (error) throw error
    },
  },
  nutritionPlans: {
    list: async () => {
      await requireSignedInUser()
      const { data, error } = await requireSupabase().from('nutrition_plans').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    save: async (plan, draftId = crypto.randomUUID()) => {
      const user = await requireSignedInUser()
      const days = [{ day: 'Daily targets', calories: plan.dailyCalories, macros: plan.macros, meals: plan.meals }]
      const { data, error } = await requireSupabase().from('nutrition_plans').upsert({ user_id: user.id, draft_id: draftId, title: plan.title, description: plan.description, dietary_notes: plan.dietaryNotes, days }, { onConflict: 'user_id,draft_id' }).select('*').single()
      if (error) throw error
      return data
    },
    update: async (id, plan) => {
      await requireSignedInUser()
      const days = [{ day: 'Daily targets', calories: plan.dailyCalories, macros: plan.macros, meals: plan.meals }]
      const { data, error } = await requireSupabase().from('nutrition_plans').update({ title: plan.title, description: plan.description, dietary_notes: plan.dietaryNotes, days }).eq('id', id).select('*').single()
      if (error) throw error
      return data
    },
    remove: async (id) => {
      await requireSignedInUser()
      const { error } = await requireSupabase().from('nutrition_plans').delete().eq('id', id)
      if (error) throw error
    },
  },
}
