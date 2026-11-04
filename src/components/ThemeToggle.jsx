import { useTheme } from '../context/useTheme'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className={`theme-toggle min-h-11 rounded-xl border px-3 text-xs font-semibold ${className}`}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'light'}
      onClick={toggleTheme}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span className="ml-2">{theme === 'dark' ? 'Light' : 'Dark'} theme</span>
    </button>
  )
}
