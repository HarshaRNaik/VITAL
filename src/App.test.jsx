import { readFileSync } from 'node:fs'
import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const landingAuth = vi.hoisted(() => ({ user: null }))

vi.mock('./context/auth-context', () => ({
  useAuth: () => ({ user: landingAuth.user }),
}))

vi.mock('./components/Layout', async () => {
  const router = await import('react-router-dom')
  const react = await import('react')
  return {
    default: () => react.createElement('div', { 'data-layout': 'application' }, react.createElement(router.Outlet)),
  }
})

vi.mock('./components/ProtectedRoute', async () => {
  const react = await import('react')
  return {
    default: ({ children }) => react.createElement('div', { 'data-protected': 'true' }, children),
  }
})

vi.mock('./pages/Login', () => ({ default: () => 'LOGIN_PAGE' }))
vi.mock('./pages/Register', () => ({ default: () => 'REGISTER_PAGE' }))
vi.mock('./pages/Hub', () => ({ default: () => 'DASHBOARD_PAGE' }))
vi.mock('./pages/Workout', () => ({ default: () => 'WORKOUT_PAGE' }))
vi.mock('./pages/GymWorkout', () => ({ default: () => 'GYM_WORKOUT_PAGE' }))
vi.mock('./pages/Diet', () => ({ default: () => 'DIET_PAGE' }))
vi.mock('./pages/Fitness', () => ({ default: () => 'FITNESS_PAGE' }))
vi.mock('./pages/WorkoutPlayer', () => ({ default: () => 'WORKOUT_PLAYER_PAGE' }))
vi.mock('./pages/Analytics', () => ({ default: () => 'ANALYTICS_PAGE' }))
vi.mock('./pages/Profile', () => ({ default: () => 'PROFILE_PAGE' }))
vi.mock('./pages/Achievements', () => ({ default: () => 'ACHIEVEMENTS_PAGE' }))

function renderPath(path) {
  return new Promise((resolve, reject) => {
    let markup = ''
    const stream = renderToPipeableStream(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
      {
        onAllReady() {
          const output = new Writable({
            write(chunk, _encoding, callback) {
              markup += chunk.toString()
              callback()
            },
          })
          output.on('error', reject)
          output.on('finish', () => resolve(markup))
          stream.pipe(output)
        },
        onShellError: reject,
        onError: reject,
      },
    )
  })
}

beforeEach(() => {
  landingAuth.user = null
})

describe('VITAL public and application routes', () => {
  it('renders the public landing page at root with account and dashboard links', async () => {
    const markup = await renderPath('/')

    expect(markup).toContain('TRAIN SMARTER.')
    expect(markup).toContain('LIVE STRONGER.')
    expect(markup).toContain('href="/register"')
    expect(markup).toContain('href="/login"')
    expect(markup).toContain('href="#features"')
    expect(markup).toContain('href="#workouts"')
    expect(markup).toContain('href="#nutrition"')
    expect(markup).toContain('href="#analytics"')
    expect(markup).toContain('href="/fitness"')
    expect(markup).toContain('href="/diet"')
    expect(markup).toContain('href="/analytics"')
    expect(markup).toContain('href="/achievements"')
    expect(markup).toContain('ILLUSTRATIVE · NOT A USER RECORD')
    expect(markup).toContain('src="/exercises/barbell-back-squat.gif"')
    expect(markup).not.toContain('DASHBOARD_PAGE')
  })

  it('offers signed-in visitors a dashboard destination', async () => {
    landingAuth.user = { id: 'user-1' }
    const markup = await renderPath('/')

    expect(markup).toContain('GO TO DASHBOARD')
    expect(markup).toContain('href="/dashboard"')
  })

  it('retains the account, dashboard, and existing product routes', async () => {
    const routes = [
      ['/login', 'LOGIN_PAGE'],
      ['/register', 'REGISTER_PAGE'],
      ['/dashboard', 'DASHBOARD_PAGE'],
      ['/workout', 'WORKOUT_PAGE'],
      ['/workout/gym', 'GYM_WORKOUT_PAGE'],
      ['/diet', 'DIET_PAGE'],
      ['/fitness', 'FITNESS_PAGE'],
      ['/fitness/workout', 'WORKOUT_PLAYER_PAGE'],
      ['/analytics', 'ANALYTICS_PAGE'],
      ['/profile', 'PROFILE_PAGE'],
      ['/achievements', 'ACHIEVEMENTS_PAGE'],
    ]

    for (const [path, content] of routes) {
      const markup = await renderPath(path)
      expect(markup, path).toContain(content)
      if (path === '/dashboard') expect(markup).toContain('data-protected="true"')
    }
  })

  it('provides a descriptive page title and search/social description', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

    expect(html).toContain('<title>VITAL Fitness — Your private fitness workspace</title>')
    expect(html).toContain('name="description"')
    expect(html).toContain('property="og:description"')
  })
})
