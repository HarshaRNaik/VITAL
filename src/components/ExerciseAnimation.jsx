import { useState } from 'react'

export default function ExerciseAnimation({ exercise, compact = false, priority = false }) {
  const [failedSrc, setFailedSrc] = useState('')
  const hasAnimation = exercise.animationSrc && failedSrc !== exercise.animationSrc

  return (
    <div className={`system-animation relative flex ${compact ? 'h-28 w-28 shrink-0' : 'h-52 w-full sm:h-64'} flex-col overflow-hidden rounded-xl border border-cyan-200/15 text-gray-300`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-3 z-10 border border-cyan-100/[0.06]" />
      <span className="system-kicker absolute left-4 top-3 z-10 text-[9px]">{hasAnimation ? 'Motion reference' : 'Visualizer · no demo asset'}</span>
      <div aria-hidden="true" className="pointer-events-none absolute left-2 top-2 z-10 h-3 w-3 border-l border-t border-cyan-200/60" />
      <div aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-10 h-3 w-3 border-r border-t border-cyan-200/60" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-2 left-2 z-10 h-3 w-3 border-b border-l border-cyan-200/60" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 z-10 h-3 w-3 border-b border-r border-cyan-200/60" />
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        {hasAnimation ? (
          <img
            key={exercise.animationSrc}
            src={exercise.animationSrc}
            alt={`${exercise.name} demonstration`}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            onError={() => {
              console.error(`Failed to load exercise demonstration: ${exercise.animationSrc}`)
              setFailedSrc(exercise.animationSrc)
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <span aria-hidden="true" className={`animate-pulse-glow flex items-center justify-center rounded-full border border-cyan-100/20 bg-cyan-100/[0.04] text-cyan-50 shadow-[0_0_40px_rgb(34_211_238_/_12%)] ${compact ? 'h-14 w-14 text-3xl' : 'h-28 w-28 text-6xl'}`}>{exercise.emoji || '◇'}</span>
            {!compact && <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/60">Follow the movement instructions</span>}
          </div>
        )}
      </div>
      <span className={`relative shrink-0 bg-black/40 text-center uppercase tracking-[0.18em] text-gray-300 ${compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-xs'}`}>{exercise.duration > 0 ? `${exercise.duration} seconds · controlled pace` : `${exercise.sets} sets · ${exercise.reps} reps`}</span>
    </div>
  )
}