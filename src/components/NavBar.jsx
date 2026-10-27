import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/auth-context'

const links = [
  { to: '/', label: 'System', icon: '⌂' },
  { to: '/fitness', label: 'Training', icon: '◇' },
  { to: '/diet', label: 'Nutrition', icon: '◈' },
  { to: '/analytics', label: 'Analytics', icon: '▥' },
  { to: '/assistant', label: 'Coach', icon: '⌁' },
  { to: '/profile', label: 'Status', icon: '◉' },
]

export default function NavBar() {
  const { user, logout } = useAuth()
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    setLogoutError('')
    const error = await logout()
    if (error) setLogoutError(error)
  }

  return (
    <nav aria-label="Main navigation" className="fixed bottom-0 inset-x-0 z-20 flex justify-around border-t border-cyan-200/10 bg-[#070d18]/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-xl md:sticky md:top-0 md:min-h-screen md:w-64 md:flex-none md:flex-col md:justify-start md:gap-2 md:border-r md:border-t-0 md:p-5">
      <div className="mb-8 hidden border-b border-cyan-100/10 pb-5 md:block">
        <p className="font-game text-xp text-lg">VITAL<span className="text-violet-300"> /</span> SYS</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-gray-500">Player interface · online</p>
      </div>
      <div className="flex w-full justify-around gap-1 overflow-x-auto md:flex-col md:justify-start md:gap-2">
        {[...links, ...(!user ? [{ to: '/login', label: 'Sign in', icon: '↗' }] : [])].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `${l.to === '/login' ? 'hidden md:flex' : 'flex'} system-nav-link min-h-12 min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-transparent px-1 text-[9px] transition-colors md:min-h-11 md:flex-initial md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm ${
                isActive ? 'font-bold' : 'text-gray-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'
              }`
            }
          >
            <span aria-hidden="true" className="text-base md:text-sm">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </div>
      {user && (
        <div className="mt-auto hidden border-t border-cyan-100/10 pt-4 text-sm text-gray-400 md:block">
          <Link to="/profile" className="mb-3 flex min-w-0 items-center gap-3 rounded-lg p-2 hover:bg-white/[0.04]">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-200/20 bg-cyan-200/5 text-cyan-100">◉</span>
            <span className="min-w-0"><span className="block text-[10px] uppercase tracking-wider text-gray-500">Player</span><span className="block truncate font-semibold text-gray-200">{user.name || user.email}</span></span>
          </Link>
          {logoutError && <p role="alert" className="mb-2 text-red-400">{logoutError}</p>}
          <button onClick={handleLogout} className="btn-ghost min-h-11 w-full text-xs">Log out</button>
        </div>
      )}
    </nav>
  )
}