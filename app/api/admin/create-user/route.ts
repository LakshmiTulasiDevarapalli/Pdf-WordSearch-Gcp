// app/api/admin/create-user/route.ts
// POST /api/admin/create-user
// Call this from your Users admin page when adding a new user

import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase-admin"
import { requireAdmin } from "@/lib/verify-admin"

// Password validation rules
const PASSWORD_RULES = {
  minLength: 12,
  requireNumber: /\d/,
  requireLower: /[a-z]/,
  requireUpper: /[A-Z]/,
  requireSpecial: /[^a-zA-Z0-9]/,
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < PASSWORD_RULES.minLength)
    return { valid: false, error: "Password must be at least 12 characters." }
  if (!PASSWORD_RULES.requireNumber.test(password))
    return { valid: false, error: "Password must contain at least one number." }
  if (!PASSWORD_RULES.requireLower.test(password))
    return { valid: false, error: "Password must contain at least one lowercase letter." }
  if (!PASSWORD_RULES.requireUpper.test(password))
    return { valid: false, error: "Password must contain at least one uppercase letter." }
  if (!PASSWORD_RULES.requireSpecial.test(password))
    return { valid: false, error: "Password must contain at least one special character." }
  return { valid: true }
}

/** Generates a secure random password meeting all rules */
export function generatePassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower   = "abcdefghjkmnpqrstuvwxyz"
  const numbers = "23456789"
  const special = "!@#$%^&*-_=+"

  const all = upper + lower + numbers + special

  // Guarantee at least one of each required type
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
    special[Math.floor(Math.random() * special.length)],
  ]

  // Fill the rest randomly
  while (required.length < 14) {
    required.push(all[Math.floor(Math.random() * all.length)])
  }

  // Shuffle
  return required.sort(() => Math.random() - 0.5).join("")
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { full_name, email, role, department, phone, passwordMode, password } = body

    if (!full_name || !email || !role) {
      return NextResponse.json({ error: "full_name, email, and role are required." }, { status: 400 })
    }

    // Determine the password to use
    let finalPassword: string
    if (passwordMode === "auto") {
      finalPassword = generatePassword()
    } else {
      // "custom" mode — validate the user-supplied password
      const check = validatePassword(password ?? "")
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 })
      }
      finalPassword = password
    }

    // Create the user in auth.users via Admin API
    // The trigger `on_auth_user_created` will automatically insert into public.users
    const { data, error } = await getAdminClient().auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true, // skip confirmation email — user is created by admin
      user_metadata: {
        full_name,
        role,
        department: department ?? null,
        phone: phone ?? null,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Update public.users with extra fields the trigger may not have set
    await getAdminClient()
      .from("users")
      .update({ department: department ?? null, phone: phone ?? null })
      .eq("id", data.user.id)

    return NextResponse.json({
      success: true,
      userId: data.user.id,
      // Only return the password on auto-generate so the admin can share it
      ...(passwordMode === "auto" ? { generatedPassword: finalPassword } : {}),
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}