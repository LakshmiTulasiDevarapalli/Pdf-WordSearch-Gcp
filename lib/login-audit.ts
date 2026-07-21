import { supabase } from "@/lib/supabase"

export async function recordAuditEvent(
  action: "LOGIN" | "LOGOUT" | "LOGOUT_IDLE_TIMEOUT",
  email: string
) {
  try {
    let ip_address = "unknown"
    try {
      const res = await fetch("https://api.ipify.org?format=json")
      if (res.ok) {
        const data = await res.json()
        ip_address = data.ip ?? "unknown"
      }
    } catch { /* fallback */ }

    await supabase.from("login_audit").insert({
      email,
      action,
      ip_address,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    })
  } catch (err) {
    console.error("[login-audit]", err)
  }
}