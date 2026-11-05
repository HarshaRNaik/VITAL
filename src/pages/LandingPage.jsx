import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

const navigation = [
  { href: '#home', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#workouts', label: 'Workouts' },
  { href: '#nutrition', label: 'Nutrition' },
  { href: '#analytics', label: 'Analytics' },
]

const features = [
  { icon: '↗', title: 'Workouts that fit', text: 'Browse guided routines, exercise instructions, and strength sessions; log the workouts you complete.', href: '/fitness', label: 'Explore workouts' },
  { icon: '◉', title: 'Everyday nutrition', text: 'Keep meal entries and nutrition details together in your personal history.', href: '/diet', label: 'Explore nutrition' },
  { icon: '⌁', title: 'Progress you can review', text: 'See saved workouts, nutrition entries, and measurements in your dashboard and analytics.', href: '/analytics', label: 'Explore analytics' },
  { icon: '✦', title: 'Milestones that motivate', text: 'Track your XP, streaks, and achievements as you build a consistent routine.', href: '/achievements', label: 'View achievements' },
]

const workoutTypes = [
  { name: 'Strength', detail: 'Build your session around available equipment.', icon: '⬡' },
  { name: 'Cardio', detail: 'Add movement to your training routine.', icon: '↗' },
  { name: 'HIIT', detail: 'Try guided interval circuits.', icon: '⌁' },
  { name: 'Yoga', detail: 'Make room for mobility and recovery.', icon: '◉' },
  { name: 'Bodyweight', detail: 'Explore routines that need little or no equipment.', icon: '◇' },
]

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

export default function LandingPage() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const sections = document.querySelectorAll('.landing-reveal')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      sections.forEach((section) => section.classList.add('is-visible'))
      return undefined
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="landing-page min-h-screen">
      <a className="landing-skip-link" href="#main-content">Skip to content</a>

      <header className="landing-header">
        <div className="landing-wrap landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="VITAL Fitness home" onClick={closeMenu}>
            <span className="landing-brand-mark" aria-hidden="true">V</span>
            <span className="leading-tight">VITAL<span className="block text-[10px] font-semibold tracking-[0.24em] text-gray-400">FITNESS</span></span>
          </Link>

          <nav id="landing-navigation" aria-label="Public navigation" className={`landing-navigation ${menuOpen ? 'is-open' : ''}`}>
            {navigation.map((item) => (
              <a key={item.href} className="landing-nav-link" href={item.href} onClick={closeMenu}>{item.label}</a>
            ))}
            <div className="landing-mobile-actions">
              <Link to="/login" className="landing-nav-link" onClick={closeMenu}>Login</Link>
              <Link to={user ? '/dashboard' : '/register'} className="btn min-h-11 justify-center px-4" onClick={closeMenu}>
                {user ? 'Dashboard' : 'Get started'} <Arrow />
              </Link>
            </div>
          </nav>

          <div className="landing-header-actions">
            <Link to="/login" className="landing-sign-in min-h-11 px-3 py-2 text-sm font-semibold">Login</Link>
            {user && <Link to="/dashboard" className="landing-sign-in min-h-11 px-3 py-2 text-sm font-semibold">Dashboard</Link>}
            <Link to="/register" className="btn min-h-11 px-4 text-sm">Get started <Arrow /></Link>
          </div>

          <button
            type="button"
            className="landing-menu-button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-controls="landing-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
        </div>
      </header>

      <main id="main-content">
        <section id="home" className="landing-wrap landing-hero grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-24" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span aria-hidden="true" />TRAIN WITH INTENTION</p>
            <h1 id="landing-title" className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
              TRAIN SMARTER.<br /><span className="landing-highlight">LIVE STRONGER.</span>
            </h1>
            <p className="mt-4 text-lg font-semibold text-white sm:text-xl">Your fitness journey, powered by intelligence.</p>
            <p className="mt-4 max-w-xl text-base leading-7 text-gray-300 sm:text-lg">
              VITAL FITNESS brings workouts, nutrition logging, and progress tracking together in one private fitness workspace.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to={user ? '/dashboard' : '/register'} className="btn min-h-12 px-5">{user ? 'GO TO DASHBOARD' : 'START YOUR JOURNEY'} <Arrow /></Link>
              <a href="#features" className="btn-ghost min-h-12 px-5">EXPLORE FEATURES</a>
            </div>
            <p className="mt-5 text-xs leading-5 text-gray-500">Your private records stay connected to your account. Preview content below is illustrative.</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl landing-hero-visual">
            <p className="landing-preview-label">PRODUCT PREVIEW · ILLUSTRATIVE</p>
            <div className="landing-preview">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="landing-preview-kicker">VITAL / YOUR WORKSPACE</p>
                  <p className="mt-1 text-sm font-semibold text-white">One place for your routine</p>
                </div>
                <span className="landing-preview-orb">V</span>
              </div>
              <div className="grid gap-3 p-4 sm:p-5">
                <div className="landing-preview-row">
                  <span className="landing-preview-index">01</span>
                  <span className="min-w-0 flex-1"><span className="landing-preview-kicker">TRAINING</span><span className="mt-1 block truncate text-sm font-semibold text-white">Browse · follow · log</span></span>
                  <span className="landing-preview-arrow" aria-hidden="true">↗</span>
                </div>
                <div className="landing-preview-row">
                  <span className="landing-preview-index landing-preview-index-warm">02</span>
                  <span className="min-w-0 flex-1"><span className="landing-preview-kicker">NUTRITION</span><span className="mt-1 block truncate text-sm font-semibold text-white">Meals in your history</span></span>
                  <span className="landing-preview-arrow" aria-hidden="true">↗</span>
                </div>
                <div className="landing-preview-chart">
                  <div className="flex items-center justify-between">
                    <span className="landing-preview-kicker">YOUR ACTIVITY</span>
                    <span className="text-[10px] text-gray-500">Illustrative only</span>
                  </div>
                  <svg viewBox="0 0 420 104" role="presentation" className="mt-4 h-24 w-full">
                    <path d="M1 82H419M1 52H419M1 22H419" fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="3 7" />
                    <path d="M2 80C39 78 46 61 78 65S123 77 154 52 199 58 228 45 279 51 310 30 365 38 418 11" fill="none" stroke="url(#landing-line)" strokeWidth="3" strokeLinecap="round" />
                    <defs><linearGradient id="landing-line" x1="0" x2="1"><stop stopColor="#67e8f9" /><stop offset="1" stopColor="#a3e635" /></linearGradient></defs>
                  </svg>
                  <div className="landing-preview-legend"><span />Illustrative trend · no account data</div>
                </div>
              </div>
              <div className="landing-preview-foot">Your records. Your pace. Your account.</div>
            </div>
            <div className="landing-hero-image">
              <img src="/exercises/barbell-back-squat.gif" alt="Exercise demonstration: barbell back squat" width="72" height="72" loading="eager" />
              <span><strong>Move with purpose</strong><small>Explore guided exercise demonstrations</small></span>
            </div>
            <div className="landing-decoration landing-decoration-one" aria-hidden="true" />
            <div className="landing-decoration landing-decoration-two" aria-hidden="true" />
          </div>
        </section>

        <section id="features" className="landing-wrap landing-feature-section py-14 sm:py-20" aria-labelledby="features-title">
          <div className="landing-reveal max-w-2xl">
            <p className="landing-eyebrow">A stronger routine, one place</p>
            <h2 id="features-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tools that help you show up for yourself.</h2>
            <p className="mt-4 max-w-xl text-gray-400">Explore the features available in VITAL and choose the ones that fit your routine.</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="landing-feature-card landing-reveal">
                <span aria-hidden="true" className="landing-feature-icon">{feature.icon}</span>
                <h3 className="mt-5 text-xl font-bold leading-snug">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-gray-400">{feature.text}</p>
                <Link to={feature.href} className="landing-text-link mt-5 inline-flex min-h-11 items-center gap-2 font-semibold">{feature.label} <Arrow /></Link>
              </article>
            ))}
          </div>
        </section>

        <section id="workouts" className="landing-wrap py-12 sm:py-20" aria-labelledby="workouts-title">
          <div className="landing-reveal grid items-end gap-5 md:grid-cols-[1fr_auto]">
            <div>
              <p className="landing-eyebrow">Find your next move</p>
              <h2 id="workouts-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Training for different ways to move.</h2>
              <p className="mt-4 max-w-2xl text-gray-400">Explore guided plans and exercise instructions in the VITAL workout library.</p>
            </div>
            <Link to="/fitness" className="landing-text-link inline-flex min-h-11 items-center gap-2 font-semibold">Browse workouts <Arrow /></Link>
          </div>
          <div className="landing-workout-showcase mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="landing-exercise-visual landing-reveal">
              <img src="/exercises/dumbbell-goblet-squat.gif" alt="Exercise demonstration: dumbbell goblet squat" width="84" height="84" loading="lazy" />
              <div><p className="landing-preview-kicker">FROM THE EXERCISE LIBRARY</p><h3 className="mt-2 text-xl font-bold">Move with good form.</h3><p className="mt-2 text-sm text-gray-300">View available instructions and demonstrations alongside guided training.</p></div>
            </div>
            <div className="landing-workout-types">
              {workoutTypes.map((workout, index) => (
                <Link to="/fitness" className="landing-workout-type" key={workout.name}>
                  <span className={`landing-workout-type-icon landing-workout-type-${index}`} aria-hidden="true">{workout.icon}</span>
                  <span><strong>{workout.name}</strong><small>{workout.detail}</small></span>
                  <span className="landing-preview-arrow" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="nutrition" className="landing-wrap py-12 sm:py-20" aria-labelledby="nutrition-title">
          <div className="landing-nutrition-panel landing-reveal grid items-center gap-7 p-6 sm:p-9 lg:grid-cols-[0.8fr_1.2fr] lg:p-12">
            <div>
              <p className="landing-eyebrow">Make space for nourishment</p>
              <h2 id="nutrition-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Keep the meals that fuel you in view.</h2>
              <p className="mt-4 leading-7 text-gray-300">Log meals and their nutrition details in your personal history. Add familiar options—from idli and dal to paneer, eggs, curd, roti, rice, vegetables, and fruit.</p>
              <Link to="/diet" className="landing-text-link mt-5 inline-flex min-h-11 items-center gap-2 font-semibold">Open nutrition log <Arrow /></Link>
            </div>
            <div className="landing-nutrition-preview">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="landing-preview-kicker">DAILY NUTRITION</p><h3 className="mt-1 text-lg font-bold">A sample day</h3></div>
                <span className="landing-demo-badge">ILLUSTRATIVE · NOT A USER RECORD</span>
              </div>
              <div className="landing-macro-grid">
                <div><small>Calories</small><strong>1,850 <i>/ 2,100</i></strong><span className="landing-macro-track"><i className="landing-macro-calories" /></span></div>
                <div><small>Protein</small><strong>92 <i>g</i></strong><span className="landing-macro-track"><i className="landing-macro-protein" /></span></div>
                <div><small>Carbohydrates</small><strong>210 <i>g</i></strong><span className="landing-macro-track"><i className="landing-macro-carbs" /></span></div>
                <div><small>Fats</small><strong>61 <i>g</i></strong><span className="landing-macro-track"><i className="landing-macro-fat" /></span></div>
              </div>
              <div className="landing-meals">
                <span><b>Breakfast</b><i>Idli · sambar · fruit</i></span>
                <span><b>Lunch</b><i>Rice · dal · vegetables</i></span>
                <span><b>Dinner</b><i>Roti · paneer · curd</i></span>
                <span><b>Snacks</b><i>Eggs · seasonal fruit</i></span>
              </div>
            </div>
          </div>
        </section>

        <section id="analytics" className="landing-wrap py-12 sm:py-20" aria-labelledby="analytics-title">
          <div className="landing-reveal grid items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <p className="landing-eyebrow">Progress, made personal</p>
              <h2 id="analytics-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">See the story your consistency creates.</h2>
              <p className="mt-4 max-w-xl leading-7 text-gray-400">Review your saved workout history, nutrition logs, measurements, goals, and earned milestones from the dashboard and analytics screens.</p>
              <ul className="landing-analytics-list">
                <li>Workout history and consistency</li><li>Logged meal and nutrition details</li><li>Measurements and goals</li><li>XP, streaks, and achievements</li>
              </ul>
              <Link to="/analytics" className="btn-ghost mt-5 min-h-12 px-5">EXPLORE ANALYTICS <Arrow /></Link>
            </div>
            <div className="landing-analytics-card" aria-label="Illustrative activity timeline, not account data">
              <div className="flex items-center justify-between"><div><p className="landing-preview-kicker">YOUR PROGRESS</p><h3 className="mt-1 font-bold">Activity over time</h3></div><span className="landing-demo-badge">ILLUSTRATIVE</span></div>
              <div className="landing-analytics-chart" aria-hidden="true">
                {[38, 64, 46, 77, 54, 86, 62, 92, 70, 100, 79, 88].map((height, index) => <span key={index} style={{ '--bar-height': `${height}%` }} />)}
              </div>
              <div className="landing-chart-caption"><span>Past activity</span><span>Illustrative bars · no sample values</span></div>
            </div>
          </div>
        </section>

        <section className="landing-wrap py-12 sm:py-20" aria-labelledby="how-title">
          <div className="landing-reveal max-w-2xl">
            <p className="landing-eyebrow">A simple place to begin</p>
            <h2 id="how-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your routine, one step at a time.</h2>
          </div>
          <div className="landing-steps mt-8 grid gap-4 md:grid-cols-3">
            <article className="landing-step landing-reveal"><span>01</span><h3>Create your profile</h3><p>Set up an account and choose a starting fitness goal.</p></article>
            <article className="landing-step landing-reveal"><span>02</span><h3>Choose your activities</h3><p>Explore workouts and log the meals that work for you.</p></article>
            <article className="landing-step landing-reveal"><span>03</span><h3>Review your progress</h3><p>Return to your saved history, goals, and milestones as your routine grows.</p></article>
          </div>
        </section>

        <section className="landing-wrap pb-16 pt-8 sm:pb-24" aria-labelledby="landing-cta-title">
          <div className="landing-cta landing-reveal flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-9">
            <div><p className="landing-eyebrow">Start where you are</p><h2 id="landing-cta-title" className="mt-2 text-2xl font-bold sm:text-3xl">YOUR FITNESS JOURNEY STARTS HERE.</h2><p className="mt-2 text-gray-300">Build consistency. Train intelligently. Make progress.</p></div>
            <Link to={user ? '/dashboard' : '/register'} className="btn min-h-12 px-5">{user ? 'GO TO DASHBOARD' : 'GET STARTED'} <Arrow /></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap landing-footer-content">
          <div><Link to="/" className="landing-brand" onClick={closeMenu}><span className="landing-brand-mark" aria-hidden="true">V</span><span>VITAL FITNESS</span></Link><p className="mt-3 max-w-sm text-sm">A private fitness workspace for workouts, nutrition logs, and progress.</p></div>
          <div className="landing-footer-links"><a href="#features">Features</a><a href="#workouts">Workouts</a><a href="#nutrition">Nutrition</a><a href="#analytics">Analytics</a><Link to="/login">Login</Link><Link to="/register">Register</Link>{user && <Link to="/dashboard">Dashboard</Link>}</div>
          <span className="text-xs text-gray-500">© {new Date().getFullYear()} VITAL Fitness</span>
        </div>
      </footer>
    </div>
  )
}
