import { useEffect, useRef, useState } from 'react'
import Field from '../components/Field'
import { meals, settingsApi } from '../services/api'
import { useAuth } from '../context/auth-context'
import { useGame } from '../context/game-context'
import { DAILY_CALORIE_TARGET, MEAL_TYPES } from '../data/constants'
import { today } from '../utils/helpers'
import { Link } from 'react-router-dom'
import { coachApi } from '../services/coach'

const empty = () => ({
  name: '',
  type: 'Breakfast',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  date: today(),
  nutritionEstimated: false,
})

function validate(f) {
  const e = {}

  if (!f.name.trim()) e.name = 'Required'
  if (!(Number(f.calories) > 0)) {
    e.calories = 'Must be above 0'
  }

  ;['protein', 'carbs', 'fat'].forEach((k) => {
    if (f[k] !== '' && Number(f[k]) < 0) {
      e[k] = 'Cannot be negative'
    }
  })

  if (!f.date) e.date = 'Required'

  return e
}

export default function Diet() {
  const { user } = useAuth()
  const { applyGame } = useGame()
  const mealRequestId = useRef(null)

  const [list, setList] = useState([])
  const [form, setForm] = useState(empty())
  const [editId, setEditId] = useState(null)
  const [errors, setErrors] = useState({})
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [targets, setTargets] = useState({
    calories: DAILY_CALORIE_TARGET,
    protein: null,
    carbs: null,
    fat: null,
  })
  const [targetsUserId, setTargetsUserId] = useState(null)
  const [plans, setPlans] = useState([])

  const set = (e) => {
    mealRequestId.current = null
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function load() {
    const all = await meals.list()

    setList(
      all.sort((a, b) =>
        b.date.localeCompare(a.date)
      )
    )
  }

  useEffect(() => {
    meals.list()
      .then((all) => setList(all.sort((a, b) => b.date.localeCompare(a.date))))
      .catch((error) => {
        console.error('Failed to load meal history:', error)
        setFeedback('Could not load meal history. Please refresh to try again.')
      })
  }, [])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    settingsApi.get()
      .then(({ settings }) => {
        if (active) {
          setTargetsUserId(user.id)
          setTargets({
            calories: settings.dailyCalorieTarget || DAILY_CALORIE_TARGET,
            protein: settings.proteinTargetGrams,
            carbs: settings.carbsTargetGrams,
            fat: settings.fatTargetGrams,
          })
        }
      })
      .catch((error) => console.error('Failed to load nutrition targets:', error))
    return () => { active = false }
  }, [user])

  useEffect(() => {
    if (!user) { setPlans([]); return undefined }
    let active = true
    coachApi.nutritionPlans.list().then((items) => { if (active) setPlans(items) }).catch((error) => {
      console.error('Failed to load saved nutrition plans:', error)
      if (active) setFeedback('Saved nutrition plans could not be loaded. Apply the coach plan database migration, then refresh.')
    })
    return () => { active = false }
  }, [user])

  async function removePlan(id) {
    try { await coachApi.nutritionPlans.remove(id); setPlans((items) => items.filter((plan) => plan.id !== id)) }
    catch (error) { setFeedback(error.message || 'Could not remove this plan.') }
  }

  async function submit(e) {
    e.preventDefault()
    setFeedback('')

    const er = validate(form)

    setErrors(er)

    if (Object.keys(er).length) return

    const item = {
      ...form,
      calories: +form.calories,
      protein: +form.protein || 0,
      carbs: +form.carbs || 0,
      fat: +form.fat || 0,
      ...(!editId ? { requestId: mealRequestId.current || (mealRequestId.current = crypto.randomUUID()) } : {}),
    }

    setSaving(true)
    try {
      if (editId) {
        await meals.update(editId, item)
        setEditId(null)
        setFeedback('Meal updated.')
      } else {
        const result = await meals.add(item)
        mealRequestId.current = null
        applyGame(result.game, result.duplicate ? undefined : 'meal')
        setFeedback('Meal logged. +10 XP')
      }
      setForm(empty())
      setErrors({})
      await load()
    } catch (error) {
      console.error('Failed to save meal:', error)
      setFeedback(error.code === 'AUTH_REQUIRED' || error.code === 'SUPABASE_NOT_CONFIGURED'
        ? error.message
        : 'Could not save this meal. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this meal from your history?')) return
    try {
      await meals.remove(id)
      setFeedback('Meal deleted.')
      await load()
    } catch (error) {
      console.error('Failed to delete meal:', error)
      setFeedback(error.code === 'AUTH_REQUIRED' || error.code === 'SUPABASE_NOT_CONFIGURED'
        ? error.message
        : 'Could not delete this meal. Please try again.')
    }
  }

  const todayMeals = list.filter((meal) => meal.date === today())
  const totalCalories = todayMeals.reduce(
    (total, meal) =>
      total + Number(meal.calories || 0),
    0
  )

  const totalProtein = todayMeals.reduce(
    (total, meal) =>
      total + Number(meal.protein || 0),
    0
  )

  const totalCarbs = todayMeals.reduce(
    (total, meal) =>
      total + Number(meal.carbs || 0),
    0
  )

  const totalFat = todayMeals.reduce(
    (total, meal) =>
      total + Number(meal.fat || 0),
    0
  )
  const activeTargets = user && targetsUserId === user.id
    ? targets
    : { calories: DAILY_CALORIE_TARGET, protein: null, carbs: null, fat: null }

  function mealIcon(type) {
    switch (type) {
      case 'Breakfast':
        return 'ðŸŒ…'
      case 'Lunch':
        return 'â˜€ï¸'
      case 'Dinner':
        return 'ðŸŒ™'
      case 'Snack':
        return 'ðŸŽ'
      default:
        return 'ðŸ½ï¸'
    }
  }

  return (
    <div className="page-enter space-y-5 pb-6">

      {user && <section className="card"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-xp">SAVED PLANS</p><h2 className="mt-2 text-xl font-bold">AI nutrition plans</h2></div><Link to="/coach" className="btn min-h-10">Ask AI Coach</Link></div>
        {plans.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{plans.map((plan) => { const daily = plan.days?.[0] || {}; return <li key={plan.id} className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold">{plan.title}</h3><p className="mt-1 text-xs text-gray-400">{plan.dietary_notes} · {daily.calories || '—'} kcal/day</p><p className="mt-2 text-xs text-gray-300">Protein {daily.macros?.protein ?? '—'}g · Carbs {daily.macros?.carbohydrates ?? '—'}g · Fat {daily.macros?.fats ?? '—'}g</p><div className="mt-3 space-y-2">{(daily.meals || []).map((meal, index) => <div key={`${meal.name}-${index}`}><p className="text-sm font-medium">{meal.name}</p><p className="text-xs text-gray-400">{meal.foods?.map((food) => `${food.item} (${food.quantity})`).join(' · ')}</p></div>)}</div><div className="mt-3 flex justify-between"><Link to="/coach" className="text-xs text-cyan-100 underline">Modify with Coach</Link><button className="text-xs text-red-300" onClick={() => removePlan(plan.id)}>Delete</button></div></li> })}</ul> : <p className="mt-3 text-sm text-gray-400">No saved AI plans yet.</p>}
      </section>}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-xp/20 via-white/5 to-transparent p-5">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-xp">
            NUTRITION
          </p>

          <h1 className="mt-2 text-2xl md:text-3xl font-bold">
            Fuel your body. ðŸ¥—
          </h1>

          <p className="mt-1 max-w-xl text-sm text-gray-400">
            Log your meals and keep track of your daily
            nutrition.
          </p>
        </div>

        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-xp/10 blur-3xl" />
      </div>

      {/* Nutrition statistics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">
                Calories
              </p>

              <p className="mt-1 text-2xl font-bold">
                {totalCalories}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  kcal
                </span>
              </p>
            </div>

            <span className="text-xl">ðŸ”¥</span>
          </div>

          <div className="progress-track mt-3" role="progressbar" aria-label="Daily calorie target" aria-valuemin="0" aria-valuemax={activeTargets.calories} aria-valuenow={totalCalories}>
            <div className="progress-fill" style={{ width: `${Math.min((totalCalories / activeTargets.calories) * 100, 100)}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-gray-500">{totalCalories.toLocaleString()} / {activeTargets.calories.toLocaleString()} kcal today</p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">
                Protein
              </p>

              <p className="mt-1 text-2xl font-bold">
                {totalProtein}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  g
                </span>
              </p>
            </div>

            <span className="text-xl">ðŸ¥©</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">{activeTargets.protein === null ? 'Today' : `${totalProtein} / ${activeTargets.protein} g target`}</p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">
                Carbs
              </p>

              <p className="mt-1 text-2xl font-bold">
                {totalCarbs}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  g
                </span>
              </p>
            </div>

            <span className="text-xl">ðŸš</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">{activeTargets.carbs === null ? 'Today' : `${totalCarbs} / ${activeTargets.carbs} g target`}</p>
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">
                Fat
              </p>

              <p className="mt-1 text-2xl font-bold">
                {totalFat}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  g
                </span>
              </p>
            </div>

            <span className="text-xl">ðŸ¥‘</span>
          </div>

          <p className="mt-2 text-[11px] text-gray-500">{activeTargets.fat === null ? 'Today' : `${totalFat} / ${activeTargets.fat} g target`}</p>
        </div>
      </div>

      {/* Main section */}
      <div className="grid lg:grid-cols-2 gap-5">

        {/* Log meal */}
        <form onSubmit={submit} className="card">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                {editId ? 'EDIT MEAL' : 'LOG FUEL'}
              </h2>

              <p className="mt-1 text-xs text-gray-500">{editId ? 'Update your meal information' : 'Record what you have eaten Â· daily totals update from todayâ€™s entries'}</p>
            </div>

            <span className="text-xl">
              {editId ? 'âœï¸' : 'ðŸ¥—'}
            </span>
          </div>

          <Field
            label="Meal name"
            name="name"
            value={form.name}
            onChange={set}
            error={errors.name}
          />

          <Field
            label="Meal type"
            name="type"
            options={MEAL_TYPES}
            value={form.type}
            onChange={set}
          />

          <Field
            label="Calories (kcal)"
            name="calories"
            type="number"
            value={form.calories}
            onChange={set}
            error={errors.calories}
          />

          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Protein (g)"
              name="protein"
              type="number"
              value={form.protein}
              onChange={set}
              error={errors.protein}
            />

            <Field
              label="Carbs (g)"
              name="carbs"
              type="number"
              value={form.carbs}
              onChange={set}
              error={errors.carbs}
            />

            <Field
              label="Fat (g)"
              name="fat"
              type="number"
              value={form.fat}
              onChange={set}
              error={errors.fat}
            />
          </div>

          <Field
            label="Date"
            name="date"
            type="date"
            value={form.date}
            onChange={set}
            error={errors.date}
          />

          {form.nutritionEstimated && <p className="mb-3 rounded-lg border border-xp/15 bg-xp/5 p-3 text-xs text-gray-300">These nutrition values are estimates. Review them before logging.</p>}
          {feedback && <p role="status" className={`mb-3 text-sm ${feedback.startsWith('Could not') ? 'text-red-300' : 'text-good'}`}>{feedback}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn min-h-11 flex-1" disabled={saving}>
              {saving ? 'Savingâ€¦' : editId ? 'Save changes' : 'Add meal (+10 XP)'}
            </button>

            {editId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  mealRequestId.current = null
                  setEditId(null)
                  setForm(empty())
                  setErrors({})
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Meal history */}
        <div className="card">

          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-game text-sm text-xp">
                MEAL HISTORY
              </h2>

              <p className="mt-1 text-xs text-gray-500">Your recorded meals Â· daily nutrition totals above show today only</p>
            </div>

            <span className="text-xl">ðŸ“‹</span>
          </div>

          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <div className="text-4xl">ðŸ¥—</div>

              <p className="mt-3 font-semibold">
                No meals yet
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Log your first meal to start tracking
                your nutrition.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {list.map((m) => (
                <li
                  key={m.id}
                  className="group rounded-xl border border-white/5 bg-white/[0.03] p-3 transition-all hover:border-white/10 hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-3">

                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-xp/10 text-lg">
                      {mealIcon(m.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {m.name}
                      </p>

                      <p className="mt-0.5 text-xs text-gray-500">
                        {m.type} Â· {m.date}
                      </p>

                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                        <span>
                          ðŸ”¥ {m.calories} kcal{m.nutritionEstimated ? ' Â· estimate' : ''}
                        </span>

                        <span>
                          P {m.protein}g
                        </span>

                        <span>
                          C {m.carbs}g
                        </span>

                        <span>
                          F {m.fat}g
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        className="btn-ghost px-2"
                        onClick={() => {
                          mealRequestId.current = null
                          setForm(m)
                          setEditId(m.id)
                          setErrors({})
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="btn-ghost min-h-10 px-2 text-red-400"
                        onClick={() => remove(m.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </div>
  )
}
