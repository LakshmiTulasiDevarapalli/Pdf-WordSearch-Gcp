// app/api/admin/update-user/route.ts
// PATCH /api/admin/update-user
// Updates a user's profile fields using the service role key (bypasses RLS)

import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase-admin"
import { requireAdmin } from "@/lib/verify-admin"

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { id, full_name, role, department, phone } = body

    if (!id) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 })
    }

    // Prevent an admin from demoting themselves out of the admin role via this endpoint
    if (id === auth.userId && role && role.toLowerCase() !== "admin") {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 })
    }

    // 1. Update public.users
    const { error: publicError } = await getAdminClient()
      .from("users")
      .update({
        full_name,
        role,
        department: department ?? null,
        phone: phone ?? null,
      })
      .eq("id", id)

    if (publicError) {
      return NextResponse.json({ error: publicError.message }, { status: 400 })
    }

    // 2. Sync auth.users user_metadata so both tables stay in sync
    const { error: authError } = await getAdminClient().auth.admin.updateUserById(id, {
      user_metadata: {
        full_name,
        role,
        department: department ?? null,
        phone: phone ?? null,
      },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}