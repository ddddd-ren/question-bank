"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { Clock } from "lucide-react"

interface PracticeTimerProps {
  isRunning: boolean
  onTimeUpdate?: (seconds: number) => void
}

export function PracticeTimer({ isRunning, onTimeUpdate }: PracticeTimerProps) {
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(onTimeUpdate)
  const wasRunningRef = useRef(false)
  
  useEffect(() => {
    callbackRef.current = onTimeUpdate
  }, [onTimeUpdate])

  useEffect(() => {
    if (isRunning && !wasRunningRef.current) {
      setSeconds(0)
    }
    wasRunningRef.current = isRunning

    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds(prev => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning])

  useEffect(() => {
    callbackRef.current?.(seconds)
  }, [seconds])

  const formatTime = useCallback((s: number) => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span className="font-mono">{formatTime(seconds)}</span>
    </div>
  )
}
