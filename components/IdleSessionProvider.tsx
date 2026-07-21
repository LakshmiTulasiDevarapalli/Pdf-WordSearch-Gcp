"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { recordAuditEvent } from "@/lib/login-audit"
import { useIdleTimeout } from "@/hooks/useIdleTimeout"
import { IdleTimeoutModal } from "@/components/IdleTimeoutModal"

interface IdleSessionProviderProps {
  children: ReactNode
  /** Where to send the user after an idle logout. Defaults to "/login". */
  loginPath?: string
}

export function IdleSessionProvider({ children, loginPath = "/login" }: IdleSessionProviderProps) {
  const router = useRouter()
  const loggedOutRef = useRef(false)

  const logout = async (reason: "idle" | "stale") => {
    if (loggedOutRef.current) return
    loggedOutRef.current = true

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        await recordAuditEvent("LOGOUT_IDLE_TIMEOUT", user.email)
      }
    } catch {
      // don't block logout on audit-log failure
    }

    try {
      localStorage.removeItem("aics_last_activity")
    } catch {}

    await supabase.auth.signOut()
    router.push(`${loginPath}?reason=${reason}`)
  }

  const { showWarning, secondsLeft, continueSession, isStaleOnMountLocal, isStaleOnMountRemote } =
    useIdleTimeout(() => logout("idle"))

  useEffect(() => {
    // Instant check using localStorage (covers "this browser tab was already stale")
    if (isStaleOnMountLocal()) {
      logout("stale")
      return
    }
    // Authoritative check against the DB (covers idle activity from other
    // tabs/devices, or a stale session where localStorage was cleared/spoofed)
    isStaleOnMountRemote().then(stale => {
      if (stale) logout("stale")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {children}
      {showWarning && (
        <IdleTimeoutModal
          secondsLeft={secondsLeft}
          onContinue={continueSession}
          onLogout={() => logout("idle")}
        />
      )}
    </>
  )
}