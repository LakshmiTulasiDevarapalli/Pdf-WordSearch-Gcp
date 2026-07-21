// app/api/admin/delete-user/route.ts
// DELETE /api/admin/delete-user
// Deletes a user from auth.users (cascades to public.users automatically)

import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase-admin"
import { requireAdmin } from "@/lib/verify-admin"

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: "User id is required." }, { status: 400 })
    }

    // Prevent an admin from deleting their own account through this endpoint
    if (id === auth.userId) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 })
    }

    // Delete from auth.users only — the on_auth_user_created trigger cascade
    // will automatically remove the row from public.users as well.
    // Do NOT delete from public.users manually first, or the cascade will fail.
    const { error } = await getAdminClient().auth.admin.deleteUser(id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}