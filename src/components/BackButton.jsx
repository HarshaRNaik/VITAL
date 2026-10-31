import { useNavigate } from 'react-router-dom'
import { getSafeBackTarget } from '../utils/navigation'

export default function BackButton() {
  const navigate = useNavigate()

  function goBack() {
    const target = getSafeBackTarget(window.history.state)
    navigate(target, target === '/' ? { replace: true } : undefined)
  }

  return (
    <button
      type="button"
      aria-label="Back to the previous page"
      onClick={goBack}
      className="btn-ghost mb-4 min-h-11 min-w-20 justify-center touch-manipulation"
    >
      <span aria-hidden="true">←</span>
      <span>Back</span>
    </button>
  )
}
