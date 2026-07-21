"use client"
import React from "react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileSearch, Plus, Trash2, Pencil, Loader2, AlertTriangle, X, Check, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { supabase } from "@/lib/supabase"
import AddUserModal from "@/components/AddUserModal"

interface User {
  id: string
  full_name: string
  email: string
  role: string
  department: string
  phone: string
  created_at: string
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  // Pagination + search state
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Auth + role gate — matches the pattern used in app/dashboard/page.tsx.
  // Blocks rendering (and the users fetch below) until we've confirmed
  // there's a real session AND the caller is an admin. Without this, a
  // stale bookmark or a non-admin account could briefly see/render the
  // full user list before anything redirected them away.
  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }
      const { data: userData } = await supabase
        .from("users").select("role").eq("email", user.email).single()
      if ((userData?.role ?? "").toLowerCase() !== "admin") {
        router.replace("/dashboard")
        return
      }
      setAuthChecked(true)
    }
    checkAccess()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false })
    if (error) setError(error.message)
    else setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { if (authChecked) fetchUsers() }, [authChecked])

  // Reset to page 1 whenever search or pageSize changes
  useEffect(() => { setCurrentPage(1) }, [search, pageSize])

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError("Your session has expired. Please sign in again.")
        setDeleting(false)
        return
      }
      const res = await fetch("/api/admin/delete-user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || "Failed to delete user.")
      else { setSuccess("User deleted."); fetchUsers() }
    } catch (err) {
      setError("Unexpected error deleting user.")
    }
    setDeleteConfirmId(null)
    setDeleting(false)
  }

  // Filtered + paginated data
  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.role ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginated = filtered.slice(pageStart, pageEnd)

  const goTo = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))

  const getPageNumbers = () => {
    const pages: (number | "…")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push("…")
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i)
      if (safePage < totalPages - 2) pages.push("…")
      pages.push(totalPages)
    }
    return pages
  }

  if (!authChecked) return null

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif", background: "#ffffff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');
        .royal-title { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; }
        .royal-gradient-text { background: linear-gradient(135deg, #1a2e6e 0%, #4c1d95 60%, #1a2e6e 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .header-bar { border-bottom: 1px solid rgba(201,168,76,0.2); background: rgba(255,255,255,0.92); backdrop-filter: blur(20px); }
        .royal-card { background: #fff; border: 1px solid rgba(201,168,76,0.3); border-radius: 16px; box-shadow: 0 4px 24px rgba(26,46,110,0.07); }
        .btn-primary { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; border: none; border-radius: 10px; padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { box-shadow: 0 4px 18px rgba(26,46,110,0.35); transform: translateY(-1px); }
        .btn-royal { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; box-shadow: 0 4px 20px rgba(26,46,110,0.3); transition: all 0.2s; position: relative; overflow: hidden; }
        .btn-royal:hover { box-shadow: 0 8px 30px rgba(26,46,110,0.45); transform: translateY(-1px); }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; }
        .badge-admin { background: rgba(26,46,110,0.1); color: #1a2e6e; }
        .badge-editor { background: rgba(76,29,149,0.1); color: #4c1d95; }
        .badge-viewer { background: #f3f4f6; color: #6b7280; }
        .delete-accordion { overflow: hidden; max-height: 0; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; }
        .delete-accordion.open { max-height: 80px; opacity: 1; }
        .search-input { background: #f8f7ff; border: 1px solid rgba(201,168,76,0.35); border-radius: 0.6rem; padding: 0.5rem 0.75rem 0.5rem 2.25rem; color: #1f2937; font-size: 0.875rem; outline: none; width: 220px; transition: border-color 0.2s; }
        .search-input:focus { border-color: #4c1d95; }
        .select-input { background: #f8f7ff; border: 1px solid rgba(201,168,76,0.35); border-radius: 0.6rem; padding: 0.5rem 0.75rem; color: #1f2937; font-size: 0.875rem; outline: none; cursor: pointer; transition: border-color 0.2s; }
        .select-input:focus { border-color: #4c1d95; }
        .pagination-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding: 0.875rem 1.5rem; border-top: 1px solid rgba(201,168,76,0.15); }
        .page-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 2rem; height: 2rem; padding: 0 0.4rem; border-radius: 0.5rem; border: 1px solid rgba(201,168,76,0.3); background: #f8f7ff; color: #374151; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; font-size: 13px; }
        .page-btn:hover:not(:disabled):not(.active) { border-color: #4c1d95; color: #4c1d95; background: rgba(76,29,149,0.05); }
        .page-btn.active { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; border-color: transparent; box-shadow: 0 2px 8px rgba(26,46,110,0.25); }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .page-btn.ellipsis { border-color: transparent; background: transparent; cursor: default; color: #9ca3af; }
      `}</style>

      {/* Header */}
      <header className="header-bar sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div style={{ padding:"8px", borderRadius:"12px", background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow:"0 3px 12px rgba(26,46,110,0.28)" }}>
              <FileSearch style={{ width:"17px", height:"17px", color:"#fbbf24" }}/>
            </div>
            <div className="flex flex-col">
              <span style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontSize:"19px", background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:"1.1" }}>AICS</span>
              <span style={{ fontSize:"8.5px", fontWeight:700, letterSpacing:"0.2em", color:"#92400e", textTransform:"uppercase" }}>PDF Search Engine</span>
            </div>
          </Link>
          <Link href="/dashboard" className="btn-royal flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontSize:"28px", fontWeight:400, background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>User Management</h1>
            <p style={{ fontSize:"13px", color:"#9ca3af", marginTop:"3px", fontFamily:"'DM Sans',sans-serif" }}>Add, edit, and manage users stored in Supabase</p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => { setShowAddModal(true); setError(""); setSuccess("") }}>
            <Plus className="size-4" /> Add User
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#059669" }}>
            {success}
          </div>
        )}

        {/* Users Table */}
        <div className="royal-card overflow-hidden">

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid rgba(201,168,76,0.15)" }}>
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "#9ca3af" }} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Name, email, role…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rows</label>
              <select className="select-input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>

            <div className="ml-auto flex items-end">
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                {loading ? "Loading…" : (
                  <><span style={{ fontWeight: 600, color: "#374151" }}>{filtered.length}</span> user{filtered.length !== 1 ? "s" : ""}</>
                )}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16" style={{ color: "#9ca3af" }}>
              <Loader2 className="size-6 animate-spin mr-2" /> Loading users...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color: "#9ca3af" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: "rgba(76,29,149,0.06)" }}>
                <Plus className="size-5" style={{ color: "#4c1d95" }} />
              </div>
              <p className="text-sm font-medium">{search ? "No users match your search" : "No users yet"}</p>
              <p className="text-xs mt-1">{search ? "Try a different keyword" : "Click \"Add User\" to get started"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {["Name", "Email", "Role", "Department", "Phone", "Added", ""].map(h => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((u, i) => (
                      <React.Fragment key={u.id}>
                        <tr
                          style={{
                            borderBottom: deleteConfirmId === u.id ? "none" : (i < paginated.length - 1 ? "1px solid #f9fafb" : "none"),
                            background: deleteConfirmId === u.id ? "rgba(239,68,68,0.03)" : "transparent",
                            transition: "background 0.2s"
                          }}
                          onMouseEnter={e => { if (deleteConfirmId !== u.id) e.currentTarget.style.background = "#fafafa" }}
                          onMouseLeave={e => { if (deleteConfirmId !== u.id) e.currentTarget.style.background = "transparent" }}
                        >
                          <td className="px-6 py-4 text-sm font-medium" style={{ color: "#111827" }}>{u.full_name}</td>
                          <td className="px-6 py-4 text-sm" style={{ color: "#6b7280" }}>{u.email}</td>
                          <td className="px-6 py-4"><span className={`badge badge-${u.role?.toLowerCase()}`}>{u.role}</span></td>
                          <td className="px-6 py-4 text-sm" style={{ color: "#6b7280" }}>{u.department || "—"}</td>
                          <td className="px-6 py-4 text-sm" style={{ color: "#6b7280" }}>{u.phone || "—"}</td>
                          <td className="px-6 py-4 text-xs" style={{ color: "#9ca3af" }}>
                            {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setEditUser(u); setError(""); setSuccess(""); setDeleteConfirmId(null) }}
                                className="p-1.5 rounded-lg transition-colors" style={{ color: "#4c1d95" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(76,29,149,0.08)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")} title="Edit">
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                onClick={() => { setDeleteConfirmId(deleteConfirmId === u.id ? null : u.id); setError(""); setSuccess("") }}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: deleteConfirmId === u.id ? "#fff" : "#ef4444", background: deleteConfirmId === u.id ? "#ef4444" : "transparent" }}
                                onMouseEnter={e => { if (deleteConfirmId !== u.id) e.currentTarget.style.background = "rgba(239,68,68,0.08)" }}
                                onMouseLeave={e => { if (deleteConfirmId !== u.id) e.currentTarget.style.background = "transparent" }} title="Delete">
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Delete Confirmation Row */}
                        <tr key={`${u.id}-confirm`} style={{ borderBottom: deleteConfirmId === u.id && i < paginated.length - 1 ? "1px solid #f9fafb" : "none" }}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div className={`delete-accordion ${deleteConfirmId === u.id ? "open" : ""}`}>
                              <div className="flex items-center justify-between px-6 py-3"
                                style={{ background: "rgba(239,68,68,0.05)", borderTop: "1px dashed rgba(239,68,68,0.2)", borderBottom: "1px dashed rgba(239,68,68,0.2)" }}>
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="size-4" style={{ color: "#ef4444" }} />
                                  <span className="text-sm font-medium" style={{ color: "#374151" }}>
                                    Are you sure you want to delete <strong>{u.full_name}</strong>? This action cannot be undone.
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 ml-4 shrink-0">
                                  <button onClick={() => setDeleteConfirmId(null)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                    style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "#e5e7eb")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "#f3f4f6")}>
                                    <X className="size-3" /> Cancel
                                  </button>
                                  <button onClick={() => handleDelete(u.id)} disabled={deleting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                    style={{ background: "#ef4444", color: "#fff", border: "1px solid #dc2626", opacity: deleting ? 0.7 : 1 }}
                                    onMouseEnter={e => { if (!deleting) e.currentTarget.style.background = "#dc2626" }}
                                    onMouseLeave={e => { if (!deleting) e.currentTarget.style.background = "#ef4444" }}>
                                    {deleting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                    Confirm Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="pagination-bar">
                <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  Showing{" "}
                  <span style={{ fontWeight: 600, color: "#374151" }}>{pageStart + 1}–{Math.min(pageEnd, filtered.length)}</span>
                  {" "}of{" "}
                  <span style={{ fontWeight: 600, color: "#374151" }}>{filtered.length}</span>
                  {" "}users
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <button className="page-btn" onClick={() => goTo(1)} disabled={safePage === 1} title="First page"><ChevronsLeft className="size-3.5" /></button>
                  <button className="page-btn" onClick={() => goTo(safePage - 1)} disabled={safePage === 1} title="Previous page"><ChevronLeft className="size-3.5" /></button>
                  {getPageNumbers().map((p, i) =>
                    p === "…"
                      ? <button key={`e-${i}`} className="page-btn ellipsis" disabled>…</button>
                      : <button key={p} className={`page-btn${p === safePage ? " active" : ""}`} onClick={() => goTo(p as number)}>{p}</button>
                  )}
                  <button className="page-btn" onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} title="Next page"><ChevronRight className="size-3.5" /></button>
                  <button className="page-btn" onClick={() => goTo(totalPages)} disabled={safePage === totalPages} title="Last page"><ChevronsRight className="size-3.5" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <AddUserModal open={showAddModal} onClose={() => setShowAddModal(false)}
        onSuccess={() => { setShowAddModal(false); setSuccess("User created successfully."); fetchUsers() }} />
      <AddUserModal open={!!editUser} editUser={editUser} onClose={() => setEditUser(null)}
        onSuccess={() => { setEditUser(null); setSuccess("User updated successfully."); fetchUsers() }} />
    </div>
  )
}