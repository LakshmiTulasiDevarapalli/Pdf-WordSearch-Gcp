"use client"
// components/AddUserModal.tsx

import { useState, useEffect } from "react"
import { Eye, EyeOff, Copy, Check, X } from "lucide-react"

interface UserData {
  id: string
  full_name: string
  email: string
  role: string
  department: string
  phone: string
}

interface AddUserModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editUser?: UserData | null // if provided, switches to edit mode
}

const PASSWORD_HINT = "Min 12 chars · uppercase · lowercase · number · special character"
const ROLES = ["Admin", "Viewer"]
const DEPARTMENTS = ["Compliance", "IT"]

export default function AddUserModal({ open, onClose, onSuccess, editUser }: AddUserModalProps) {
  const isEdit = !!editUser

  const [form, setForm] = useState({
    full_name: "", email: "", role: "Viewer", department: "", phone: "",
  })
  const [passwordMode, setPasswordMode] = useState<"auto" | "custom">("auto")
  const [customPassword, setCustomPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when editing
  useEffect(() => {
    if (editUser) {
      setForm({
        full_name: editUser.full_name ?? "",
        email: editUser.email ?? "",
        role: editUser.role ?? "Viewer",
        department: editUser.department ?? "",
        phone: editUser.phone ?? "",
      })
    } else {
      setForm({ full_name: "", email: "", role: "Viewer", department: "", phone: "" })
    }
    setError(null)
    setCustomPassword("")
    setGeneratedPassword(null)
    setPasswordMode("auto")
  }, [editUser, open])

  if (!open) return null

  // Phone formatter — keeps +1 prefix, formats as +1 XXX XXX XXXX
  const handlePhoneChange = (val: string) => {
    if (!val.startsWith("+1")) val = "+1"
    const digits = val.slice(2).replace(/\D/g, "").slice(0, 10)
    let formatted = "+1"
    if (digits.length > 0) formatted += " " + digits.slice(0, 3)
    if (digits.length > 3) formatted += " " + digits.slice(3, 6)
    if (digits.length > 6) formatted += " " + digits.slice(6, 10)
    setForm(f => ({ ...f, phone: formatted }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isEdit && editUser) {
      // Edit mode — update via server-side API route (uses service role key to bypass RLS)
      const res = await fetch("/api/admin/update-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editUser.id,
          full_name: form.full_name,
          role: form.role,
          department: form.department,
          phone: form.phone,
        }),
      })

      const data = await res.json()
      setLoading(false)
      if (!res.ok) { setError(data.error ?? "Failed to update user."); return }
      onSuccess()
      handleClose()
      return
    }

    // Create mode — call API route with service role key
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        passwordMode,
        password: passwordMode === "custom" ? customPassword : undefined,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? "Something went wrong."); return }

    if (data.generatedPassword) {
      setGeneratedPassword(data.generatedPassword)
    } else {
      onSuccess()
      handleClose()
    }
  }

  const handleCopy = () => {
    if (!generatedPassword) return
    navigator.clipboard.writeText(generatedPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setForm({ full_name: "", email: "", role: "Viewer", department: "", phone: "" })
    setPasswordMode("auto")
    setCustomPassword("")
    setGeneratedPassword(null)
    setError(null)
    onClose()
  }

  const input = "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
  const inputStyle = { background: "#f8f7ff", border: "1px solid rgba(201,168,76,0.28)", color: "#1f2937" }

  // ── Step 2: Show generated password (create mode only) ───
  if (generatedPassword) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl p-8 shadow-2xl"
          style={{ background: "#fff", border: "1px solid rgba(201,168,76,0.35)" }}>
          <h2 className="text-xl font-bold mb-1" style={{ color: "#1a2e6e" }}>User Created!</h2>
          <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
            Share these credentials with <strong>{form.email}</strong>. The password is shown only once.
          </p>
          <div className="rounded-xl p-4 mb-4" style={{ background: "#f8f7ff", border: "1px solid rgba(201,168,76,0.28)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#92400e" }}>Generated Password</p>
            <div className="flex items-center justify-between gap-3">
              <code className="text-sm font-mono font-bold tracking-widest" style={{ color: "#1a2e6e" }}>
                {generatedPassword}
              </code>
              <button onClick={handleCopy} className="shrink-0 rounded-lg p-2 transition-colors hover:bg-amber-50">
                {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" style={{ color: "#c9a84c" }} />}
              </button>
            </div>
          </div>
          <button onClick={() => { onSuccess(); handleClose() }}
            className="w-full rounded-xl px-6 py-3 text-sm font-semibold"
            style={{ background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", color: "#fff" }}>
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl shadow-2xl"
        style={{ background: "#fff", border: "1px solid rgba(201,168,76,0.35)" }}>

        {/* Title bar */}
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <h2 className="text-xl font-bold" style={{ color: "#1a2e6e" }}>
            {isEdit ? "Edit User" : "Add New User"}
          </h2>
          <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
            <X className="size-5 text-gray-500" />
          </button>
        </div>
        <hr style={{ borderColor: "rgba(201,168,76,0.2)" }} />

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {/* Full Name + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>Full Name *</label>
              <input className={input} style={inputStyle} required
                value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Jane Doe" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>Email *</label>
              <input type="email" className={input}
                style={{ ...inputStyle, ...(isEdit ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
                required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="jane@company.com"
                disabled={isEdit}
              />
              {isEdit && (
                <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>Email cannot be changed after creation</p>
              )}
            </div>
          </div>

          {/* Role + Department */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>Role *</label>
              <select className={input} style={inputStyle} required
                value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>Department</label>
              <select className={input} style={inputStyle}
                value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                <option value="">Select department</option>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>Phone</label>
            <input className={input} style={inputStyle} type="tel"
              value={form.phone || "+1"}
              onChange={e => handlePhoneChange(e.target.value)}
              onKeyDown={e => {
                const el = e.currentTarget
                if ((e.key === "Backspace" || e.key === "Delete") && el.selectionStart !== null && el.selectionStart <= 2) {
                  e.preventDefault()
                }
              }}
              placeholder="+1 555 000 0000" />
            <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>+1 prefix is fixed · 10 digits required</p>
          </div>

          {/* Password section — create mode only */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: "#374151" }}>Password</label>
              <div className="flex gap-3 mb-3">
                {(["auto", "custom"] as const).map(mode => (
                  <button key={mode} type="button"
                    onClick={() => setPasswordMode(mode)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold border transition-all"
                    style={passwordMode === mode
                      ? { background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", color: "#fff", border: "transparent" }
                      : { background: "#f8f7ff", color: "#6b7280", border: "1px solid rgba(201,168,76,0.28)" }}>
                    {mode === "auto" ? "🎲 Auto-generate" : "🔑 Choose my own"}
                  </button>
                ))}
              </div>

              {passwordMode === "custom" && (
                <div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={input + " pr-12"} style={inputStyle}
                      value={customPassword} onChange={e => setCustomPassword(e.target.value)}
                      placeholder="Enter a strong password" required
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-3 flex items-center">
                      {showPassword ? <EyeOff className="size-4 text-gray-400" /> : <Eye className="size-4 text-gray-400" />}
                    </button>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "#9ca3af" }}>{PASSWORD_HINT}</p>
                  <PasswordStrength password={customPassword} />
                </div>
              )}

              {passwordMode === "auto" && (
                <p className="text-xs" style={{ color: "#9ca3af" }}>
                  A secure 14-character password will be generated and shown once after creation.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="flex-1 rounded-xl py-3 text-sm font-semibold border transition-all hover:bg-gray-50"
              style={{ color: "#6b7280", border: "1px solid #e5e7eb" }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all"
              style={{ background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Update User" : "Create User")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Simple strength bar
function PasswordStrength({ password }: { password: string }) {
  let score = 0
  if (password.length >= 12) score++
  if (/\d/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[A-Z]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  const label = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"][score]
  const color = ["", "#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#059669"][score]

  if (!password) return null

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all"
            style={{ background: i < score ? color : "#e5e7eb" }} />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color }}>{label}</p>
    </div>
  )
}
