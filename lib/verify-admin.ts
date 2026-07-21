// lib/verify-admin.ts
//
// Server-side check for admin-only API routes.
// 1. Validates the caller's Supabase access token (Authorization: Bearer <token>).
// 2. Checks the user_sessions table to confirm they haven't been idle >30 min
//    (this is enforced here even if a valid, non-expired JWT is presented —
//    a stale JWT alone is no longer enough).
// 3. Confirms their role in public.users is "admin".

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase-admin"
import { isSessionFresh } from "@/lib/session-check"

type AdminCheckResult =
  | { error: NextResponse }
  | { error?: undefined; userId: string; email: string; role: string }

export async function requireAdmin(req: NextRequest): Promise<AdminCheckResult> {
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) }
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userError } = await anon.auth.getUser(token)

  if (userError || !user || !user.email) {
    return { error: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) }
  }

  const fresh = await isSessionFresh(user.id)
  if (!fresh) {
    return { error: NextResponse.json({ error: "Session expired due to inactivity." }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await getAdminClient()
    .from("users")
    .select("role")
    .eq("email", user.email)
    .single()

  if (profileError || !profile || profile.role?.toLowerCase() !== "admin") {
    return { error: NextResponse.json({ error: "Admin access required." }, { status: 403 }) }
  }

  return { userId: user.id, email: user.email, role: profile.role }
}