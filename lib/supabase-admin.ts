// lib/supabase-admin.ts
// Used SERVER-SIDE ONLY (API routes / Server Actions)
// Never import this in client components!

import { createClient } from "@supabase/supabase-js"

// Function instead of constant — only runs when called at runtime, not at build time
export function getAdminClient() {
  const url            = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Keep backward compat alias if your API routes use supabaseAdmin
export { getAdminClient as supabaseAdmin }