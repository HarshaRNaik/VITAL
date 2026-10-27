import { useEffect, useState } from 'react'

export default function useCountdown(seconds, resetKey) {
  const [countdown, setCountdown] = useState(() => ({ seconds, resetKey, timeLeft: seconds }))
  const timeLeft = countdown.seconds === seconds && countdown.resetKey === resetKey
    ? countdown.timeLeft
    : seconds

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((current) => {
        const remaining = current.seconds === seconds && current.resetKey === resetKey
          ? current.timeLeft
          : seconds
        return { seconds, resetKey, timeLeft: remaining > 0 ? remaining - 1 : 0 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [seconds, resetKey])

  return timeLeft
}
