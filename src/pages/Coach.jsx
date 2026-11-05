import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { coachApi } from '../services/coach'

function Plan({ response }) {
  if (!response?.plan) return null
  const { plan } = response
  return <section className="mt-3 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.04] p-4" aria-label="Generated plan">
    <h3 className="font-bold text-cyan-100">{plan.title}</h3>
    <p className="mt-1 text-xs text-gray-400">{plan.duration}{plan.difficulty ? ` · ${plan.difficulty}` : ''}</p>
    {plan.description && <p className="mt-2 text-sm text-gray-300">{plan.description}</p>}
    {response.intent === 'workout' && plan.trainingDays.map((day) => <div key={day.day} className="mt-4">
      <h4 className="text-sm font-semibold">{day.day}</h4>
      <ul className="mt-2 space-y-2">{day.exercises.map((exercise, index) => <li key={`${exercise.name}-${index}`} className="rounded-lg bg-black/20 p-2 text-sm"><span className="font-medium">{exercise.name}</span><span className="block text-xs text-gray-400">{exercise.sets} sets × {exercise.reps} · Rest {exercise.restDuration}</span></li>)}</ul>
    </div>)}
    {response.intent === 'nutrition' && <>
      <p className="mt-3 text-sm">{plan.dailyCalories} kcal/day · Protein {plan.macros.protein}g · Carbs {plan.macros.carbohydrates}g · Fat {plan.macros.fats}g</p>
      <div className="mt-3 space-y-3">{plan.meals.map((meal, index) => <div key={`${meal.name}-${index}`}><h4 className="text-sm font-semibold">{meal.name}</h4><ul className="text-sm text-gray-300">{meal.foods.map((food, foodIndex) => <li key={`${food.item}-${foodIndex}`}>• {food.item}: {food.quantity}</li>)}</ul></div>)}</div>
      <p className="mt-3 text-xs text-gray-500">Nutrition values are estimates. Review portions and suitability for your needs.</p>
    </>}
  </section>
}

export default function Coach() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(event) {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return
    setInput(''); setFeedback(''); setLoading(true)
    setMessages((items) => [...items, { role: 'user', content: message }])
    try {
      const history = messages.filter((item) => item.role === 'user' || item.role === 'coach').map((item) => ({ role: item.role, content: item.content }))
      const response = await coachApi.generate(message, history)
      setMessages((items) => [...items, { role: 'coach', content: response.reply, response }])
      if (response.intent === 'workout' || response.intent === 'nutrition') {
        const plans = response.intent === 'workout' ? coachApi.workoutPlans : coachApi.nutritionPlans
        const destination = response.intent === 'workout' ? 'Workout' : 'Nutrition'
        try {
          const isModification = /\b(modif\w*|chang\w*|adjust\w*|updat\w*|revis\w*|increase\w*|decrease\w*)\b/i.test(message)
          const existing = isModification ? await plans.list() : []
          if (existing[0]) {
            await plans.update(existing[0].id, response.plan)
            setFeedback(`Your saved plan was updated. Find it in ${destination}.`)
          } else {
            await plans.save(response.plan)
            setFeedback(`Your plan was saved. Find it in ${destination}.`)
          }
        } catch (saveError) {
          setFeedback(`The plan was generated, but could not be saved: ${saveError.message || 'Please try again.'}`)
        }
      }
    } catch (error) {
      setMessages((items) => [...items, { role: 'coach', content: error.message || 'The coach could not respond. Please try again.' }])
      setFeedback('Your request was not completed. Check the message and try again.')
    } finally { setLoading(false) }
  }

  return <div className="page-enter mx-auto max-w-4xl space-y-5 pb-6">
    <header className="hero-panel p-6 sm:p-8"><p className="font-game text-xs text-xp">PERSONAL COACH</p><h1 className="mt-3 text-3xl font-extrabold">AI Coach</h1><p className="mt-2 text-sm text-gray-300">Ask for training ideas, nutrition guidance, or a plan shaped around your saved profile.</p></header>
    {!user ? <section className="system-panel rounded-2xl p-6"><p>Sign in to chat with Coach and save private plans.</p><Link className="btn mt-4 inline-flex" to="/login">Sign in</Link></section> : <>
      <section aria-label="Coach conversation" className="system-panel min-h-80 space-y-4 rounded-2xl p-4 sm:p-6">
        {messages.length === 0 && <div className="text-sm text-gray-400"><p>Try asking:</p><ul className="mt-2 list-inside list-disc space-y-1"><li>Create a beginner workout plan for six days per week.</li><li>Create a vegetarian diet plan for muscle gain.</li><li>Modify my workout because I only have dumbbells.</li></ul></div>}
        {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`rounded-xl p-3 ${message.role === 'user' ? 'ml-6 bg-cyan-200/[0.08]' : 'mr-2 bg-white/[0.03]'}`}><p className="text-[10px] uppercase tracking-widest text-gray-500">{message.role === 'user' ? 'You' : 'Coach'}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{message.content}</p>{message.response && <Plan response={message.response} />}</article>)}
        {loading && <p role="status" className="text-sm text-cyan-100">Coach is preparing a response…</p>}<div ref={end} />
      </section>
      {feedback && <p role={feedback.includes('could not') ? 'alert' : 'status'} className={`text-sm ${feedback.includes('could not') ? 'text-red-300' : 'text-cyan-100'}`}>{feedback}</p>}
      <form onSubmit={send} className="system-panel flex flex-col gap-3 rounded-2xl p-3 sm:flex-row"><label className="sr-only" htmlFor="coach-message">Message the AI Coach</label><textarea id="coach-message" rows="2" maxLength="5000" value={input} onChange={(event) => setInput(event.target.value)} placeholder="What would you like help with?" className="input min-h-12 flex-1 resize-y" /><button className="btn min-h-12 sm:min-w-32" disabled={loading || !input.trim()}>{loading ? 'Thinking…' : 'Send'}</button></form>
      <p className="text-xs text-gray-500">Generated plans are estimates. Your profile information is used to personalize this request.</p>
    </>}
  </div>
}
