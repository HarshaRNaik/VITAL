import { useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import Field from '../components/Field'
import { meals, workouts, metrics } from '../services/api'
import { MEAL_TYPES, WORKOUT_TYPES } from '../data/constants'
import { daysAgo, sum } from '../utils/helpers'
import { useTheme } from '../context/useTheme'

const CHART_THEME = {
  dark: {
    series: ['#67e8f9', '#a78bfa', '#fb923c', '#60a5fa'],
    grid: '#ffffff20',
    axis: '#a6b1c5',
    tooltipBackground: '#151e26',
    tooltipBorder: '#ffffff30',
    tooltipText: '#f8fafc',
  },
  light: {
    series: ['#c62828', '#a91f1f', '#9a3412', '#6b3fa0'],
    grid: '#e5e5e5',
    axis: '#666666',
    tooltipBackground: '#ffffff',
    tooltipBorder: '#e5e5e5',
    tooltipText: '#202124',
  },
}

export default function Analytics() {
  const { theme } = useTheme()
  const chart = CHART_THEME[theme]
  const [m, setM] = useState([])
  const [w, setW] = useState([])
  const [b, setB] = useState([])
  const [period, setPeriod] = useState('7')
  const [mealType, setMealType] = useState('All')
  const [exType, setExType] = useState('All')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([meals.list(), workouts.list(), metrics.list()])
      .then(([mealList, workoutList, metricList]) => {
        if (!active) return
        setM(mealList); setW(workoutList); setB(metricList)
      })
      .catch((error) => {
        console.error('Failed to load analytics history:', error)
        if (active) setLoadError('Could not load your analytics history. Please refresh to try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const inRange = (d) => period === 'all' || d >= daysAgo(Number(period) - 1)
  const fm = m.filter((x) => inRange(x.date) && (mealType === 'All' || x.type === mealType))
  const fw = w.filter((x) => inRange(x.date) && (exType === 'All' || x.type === exType))
  const fb = b.filter((x) => inRange(x.date)).sort((x, y) => x.date.localeCompare(y.date))

  const dates = [...new Set([...fm.map((x) => x.date), ...fw.map((x) => x.date)])].sort()
  const rangeDates = period === 'all'
    ? dates
    : Array.from({ length: Number(period) }, (_, index) => daysAgo(Number(period) - index - 1))
  const daily = rangeDates.map((d) => ({
    date: d.slice(5),
    Eaten: sum(fm.filter((x) => x.date === d), 'calories'),
    Burned: sum(fw.filter((x) => x.date === d), 'calories'),
    Workouts: fw.filter((x) => x.date === d).length,
    Minutes: sum(fw.filter((x) => x.date === d), 'duration'),
  }))

  const macros = [
    { name: 'Protein', value: sum(fm, 'protein') },
    { name: 'Carbs', value: sum(fm, 'carbs') },
    { name: 'Fat', value: sum(fm, 'fat') },
  ]
  const hasMacros = macros.some((x) => x.value > 0)

  const byType = WORKOUT_TYPES.map((t) => ({ type: t, Workouts: fw.filter((x) => x.type === t).length }))
    .filter((x) => x.Workouts > 0)

  const loggedMealDays = new Set(fm.map((x) => x.date)).size
  const avgCalories = loggedMealDays ? Math.round(sum(fm, 'calories') / loggedMealDays) : null
  const weightChange = fb.length >= 2 ? (fb.at(-1).weight - fb[0].weight).toFixed(1) : '—'

  const empty = <div className="empty-state min-h-36"><span className="text-3xl">📈</span><p className="mt-2 text-sm font-semibold text-white">More activity will bring this chart to life</p><p className="mt-1 text-xs text-gray-500">Log meals, workouts, or weight in Fitness to build your history.</p></div>

  return (
    <div className="page-enter space-y-5 pb-6">
      <header className="hero-panel p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-xp">Your training data</p>
        <h1 className="mt-2 text-3xl font-extrabold">Progress, made visible.</h1>
        <p className="mt-2 text-sm text-gray-300">Explore activity you've actually logged. No estimates or invented trends.</p>
      </header>
      <div className="card grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Time period" value={period} onChange={(e) => setPeriod(e.target.value)} options={['7', '30', 'all']} />
        <Field label="Meal type" value={mealType} onChange={(e) => setMealType(e.target.value)} options={['All', ...MEAL_TYPES]} />
        <Field label="Exercise type" value={exType} onChange={(e) => setExType(e.target.value)} options={['All', ...WORKOUT_TYPES]} />
      </div>

      {loading && <p className="text-sm text-gray-400" role="status">Loading your recorded history…</p>}
      {loadError && <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200" role="alert">{loadError}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-xs text-gray-400">Average calories on logged days</p><p className="mt-2 text-3xl font-extrabold">{avgCalories === null ? '—' : avgCalories.toLocaleString()}<span className="ml-1 text-xs font-medium text-gray-500">{avgCalories === null ? 'no meal data' : 'kcal'}</span></p></div>
        <div className="card"><p className="text-xs text-gray-400">Workouts in selection</p><p className="mt-2 text-3xl font-extrabold">{fw.length}</p></div>
        <div className="card"><p className="text-xs text-gray-400">Recorded weight change</p><p className="mt-2 text-3xl font-extrabold">{weightChange}<span className="ml-1 text-xs font-medium text-gray-500">kg</span></p></div>
      </div>

      <div className="card">
        <div className="mb-4"><h2 className="font-game text-xs text-xp">DAILY CALORIE ACTIVITY</h2><p className="mt-2 text-xs text-gray-500">Recorded intake and workout calories for each day</p></div>
        {fm.length === 0 && fw.length === 0 ? empty : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="date" stroke={chart.axis} tickLine={false} axisLine={false} />
              <YAxis stroke={chart.axis} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: chart.tooltipBackground, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, color: chart.tooltipText }} />
              <Legend />
              <Bar dataKey="Eaten" fill={chart.series[0]} radius={[5, 5, 0, 0]} />
              <Bar dataKey="Burned" fill={chart.series[2]} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-game text-xs text-xp">WORKOUT CONSISTENCY</h2>
          <p className="mb-3 mt-2 text-xs text-gray-500">Sessions and training minutes from your logs</p>
          {fw.length === 0 ? empty : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" stroke={chart.axis} tickLine={false} axisLine={false} />
                <YAxis yAxisId="sessions" stroke={chart.axis} allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis yAxisId="minutes" orientation="right" stroke={chart.axis} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: chart.tooltipBackground, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, color: chart.tooltipText }} />
                <Legend />
                <Bar yAxisId="sessions" dataKey="Workouts" fill={chart.series[0]} radius={[5, 5, 0, 0]} />
                <Bar yAxisId="minutes" dataKey="Minutes" fill={chart.series[3]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h2 className="font-game text-xs text-xp">WEIGHT TREND</h2>
          <p className="mb-3 mt-2 text-xs text-gray-500">Only measurements you have recorded are shown</p>
          {fb.length < 2 ? empty : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={fb.map((x) => ({ date: x.date.slice(5), Weight: x.weight }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="date" stroke={chart.axis} tickLine={false} axisLine={false} />
                <YAxis stroke={chart.axis} domain={['auto', 'auto']} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: chart.tooltipBackground, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 12, color: chart.tooltipText }} />
                <Line type="monotone" dataKey="Weight" stroke={chart.series[2]} strokeWidth={3} dot={{ fill: chart.series[2], r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <h2 className="font-game text-xs text-xp">MACRO SPLIT</h2>
          <p className="mb-3 mt-2 text-xs text-gray-500">Nutrition totals from the selected meals</p>
          {!hasMacros ? empty : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={macros} dataKey="value" nameKey="name" outerRadius={90} label>
                  {macros.map((_, idx) => <Cell key={idx} fill={chart.series[idx % chart.series.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: chart.tooltipBackground, border: `1px solid ${chart.tooltipBorder}`, color: chart.tooltipText }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-game text-xs text-xp">WORKOUTS BY TYPE</h2>
        <p className="mb-3 mt-2 text-xs text-gray-500">Session counts from the selected period</p>
        {byType.length === 0 ? empty : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis dataKey="type" stroke={chart.axis} />
              <YAxis stroke={chart.axis} allowDecimals={false} />
              <Tooltip contentStyle={{ background: chart.tooltipBackground, border: `1px solid ${chart.tooltipBorder}`, color: chart.tooltipText }} />
              <Bar dataKey="Workouts" fill={chart.series[1]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
