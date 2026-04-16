// app/api/admin/update-user/route.ts
// PATCH /api/admin/update-user
// Updates a user's profile fields using the service role key (bypasses RLS)

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, full_name, role, department, phone } = body

    if (!id) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({
        full_name,
        role,
        department: department ?? null,
        phone: phone ?? null,
      })
      .eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
