// lib/session-check.ts
//
// Server-side check: is this user's session still within the 30-minute
// idle window, according to the user_sessions table (not localStorage,
// which the client could tamper with or simply not have written to).

import { getAdminClient } from "@/lib/supabase-admin"

const IDLE_LIMIT_MS = 30 * 60 * 1000

export async function isSessionFresh(userId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from("user_sessions")
    .select("last_activity_at")
    .eq("user_id", userId)
    .maybeSingle()

  // No heartbeat row yet (e.g. very first request right after login) —
  // treat as fresh rather than locking the user out immediately.
  if (error || !data) return true

  const last = new Date(data.last_activity_at).getTime()
  return Date.now() - last < IDLE_LIMIT_MS
}