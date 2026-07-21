"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"

const IDLE_LIMIT_MS = 30 * 60 * 1000 // 30 minutes of inactivity
const WARNING_BEFORE_MS = 60 * 1000  // show "still there?" prompt 60s before logout
const HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000 // don't write to the DB more than once a minute
const STORAGE_KEY = "aics_last_activity" // local fallback/fast-path only

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const

/**
 * Tracks user activity and drives an idle-timeout flow:
 *  - resets a 30-minute timer on any real activity
 *  - shows a warning with a countdown for the last 60s
 *  - calls onTimeout() if the user never responds
 *
 * Activity is recorded in two places:
 *  - localStorage, for a fast, synchronous "was this tab already stale on load" check
 *  - the `user_sessions` table (throttled to ~once/minute), which is the source of
 *    truth every server-side API route checks. localStorage alone can be cleared,
 *    edited, or simply doesn't exist on another device/browser — the DB row can't
 *    be bypassed that way.
 */
export function useIdleTimeout(onTimeout: () => void) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_BEFORE_MS / 1000)

  const warningShownRef = useRef(false)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const lastHeartbeatAt = useRef(0)

  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  const clearTimers = () => {
    clearTimeout(warningTimer.current)
    clearTimeout(logoutTimer.current)
    clearInterval(countdownInterval.current)
  }

  const recordActivity = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } catch {}

    // Throttle the DB write - we don't need per-keystroke writes, just a
    // reasonably fresh heartbeat that a server-side check can trust.
    const now = Date.now()
    if (now - lastHeartbeatAt.current < HEARTBEAT_MIN_INTERVAL_MS) return
    lastHeartbeatAt.current = now

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("user_sessions")
        .upsert({ user_id: user.id, last_activity_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error("[idle-timeout] heartbeat failed:", error.message)
        })
    })
  }

  const scheduleTimers = useCallback(() => {
    clearTimers()
    warningShownRef.current = false
    setShowWarning(false)
    setSecondsLeft(WARNING_BEFORE_MS / 1000)

    warningTimer.current = setTimeout(() => {
      warningShownRef.current = true
      setShowWarning(true)
      let remaining = WARNING_BEFORE_MS / 1000
      countdownInterval.current = setInterval(() => {
        remaining -= 1
        setSecondsLeft(Math.max(remaining, 0))
      }, 1000)
    }, IDLE_LIMIT_MS - WARNING_BEFORE_MS)

    logoutTimer.current = setTimeout(() => {
      onTimeoutRef.current()
    }, IDLE_LIMIT_MS)
  }, [])

  const handleActivity = useCallback(() => {
    if (warningShownRef.current) return
    recordActivity()
    scheduleTimers()
  }, [scheduleTimers])

  const continueSession = useCallback(() => {
    recordActivity()
    scheduleTimers()
  }, [scheduleTimers])

  // Fast synchronous check using localStorage, for an instant first check
  // before the async DB check resolves. Not authoritative on its own.
  const isStaleOnMountLocal = () => {
    try {
      const last = localStorage.getItem(STORAGE_KEY)
      if (!last) return false
      return Date.now() - Number(last) > IDLE_LIMIT_MS
    } catch {
      return false
    }
  }

  // Authoritative check: asks the DB (via the user's own RLS-scoped read)
  // whether their last recorded activity, from ANY tab/device, is stale.
  const isStaleOnMountRemote = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false // no session at all - let the normal auth check handle it

      const { data, error } = await supabase
        .from("user_sessions")
        .select("last_activity_at")
        .eq("user_id", user.id)
        .maybeSingle()

      if (error || !data) return false // no heartbeat yet - treat as fresh (first login)

      return Date.now() - new Date(data.last_activity_at).getTime() > IDLE_LIMIT_MS
    } catch {
      return false
    }
  }

  useEffect(() => {
    recordActivity()
    scheduleTimers()
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }))
    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity))
    }
  }, [handleActivity, scheduleTimers])

  return { showWarning, secondsLeft, continueSession, isStaleOnMountLocal, isStaleOnMountRemote }
}