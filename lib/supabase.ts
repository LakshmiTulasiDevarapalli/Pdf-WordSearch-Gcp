import { createClient } from "@supabase/supabase-js"

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,  // ✅ stops silent token refresh — session expires after JWT expiry time
    persistSession: true,     // keeps session in localStorage so page reloads still work within the window
  },
})