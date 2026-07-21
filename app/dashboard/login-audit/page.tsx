"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileSearch, ArrowLeft, LogIn, LogOut, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { supabase } from "@/lib/supabase"

type AuditRow = {
  id: string
  email: string
  action: "LOGIN" | "LOGOUT" | "LOGOUT_IDLE_TIMEOUT"
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function thirtyDaysAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export default function LoginAuditPage() {
  const router = useRouter()
  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [fromDate, setFromDate]   = useState(thirtyDaysAgo())
  const [toDate, setToDate]       = useState(today())
  const [search, setSearch]       = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize]   = useState(25)
  const [authChecked, setAuthChecked] = useState(false)

  const fetchAudit = async () => {
    setLoading(true)
    const from = new Date(fromDate + "T00:00:00")
    const to = new Date(toDate + "T23:59:59")

    const { data, error } = await supabase
      .from("login_audit")
      .select("*")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })

    if (error) console.error(error)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      const { data: userData } = await supabase
        .from("users").select("role").eq("email", user.email).single()
      if ((userData?.role ?? "").toLowerCase() !== "admin") {
        router.replace("/dashboard")
        return
      }
      setAuthChecked(true)
      fetchAudit()
    }
    init()
  }, [fromDate, toDate])

  // Reset to page 1 whenever search or pageSize changes
  useEffect(() => {
    setCurrentPage(1)
  }, [search, pageSize])

  const filtered = rows.filter(r =>
    !search ||
    r.email.toLowerCase().includes(search.toLowerCase()) ||
    (r.ip_address ?? "").includes(search)
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginated = filtered.slice(pageStart, pageEnd)

  const goTo = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))

  // Build visible page numbers (max 5 shown)
  const getPageNumbers = () => {
    const pages: (number | "…")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (safePage > 3) pages.push("…")
      for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) {
        pages.push(i)
      }
      if (safePage < totalPages - 2) pages.push("…")
      pages.push(totalPages)
    }
    return pages
  }

  if (!authChecked) return null

  return (
    <div className="min-h-screen" style={{ fontFamily: "'DM Sans', sans-serif", background: "#f8f7ff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');
        .royal-title { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; }
        .royal-gradient-text {
          background: linear-gradient(135deg, #1a2e6e 0%, #4c1d95 60%, #1a2e6e 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .header-bar { border-bottom: 1px solid rgba(201,168,76,0.2); background: rgba(255,255,255,0.97); backdrop-filter: blur(20px); }
        .audit-card { background: #fff; border: 1px solid rgba(201,168,76,0.3); border-radius: 1rem; box-shadow: 0 4px 24px rgba(26,46,110,0.07); }
        .date-input {
          background: #f8f7ff;
          border: 1px solid rgba(201,168,76,0.35);
          border-radius: 0.6rem;
          padding: 0.5rem 0.75rem;
          color: #1f2937;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .date-input:focus { border-color: #4c1d95; }
        .search-input {
          background: #f8f7ff;
          border: 1px solid rgba(201,168,76,0.35);
          border-radius: 0.6rem;
          padding: 0.5rem 0.75rem 0.5rem 2.25rem;
          color: #1f2937;
          font-size: 0.875rem;
          outline: none;
          width: 220px;
          transition: border-color 0.2s;
        }
        .search-input:focus { border-color: #4c1d95; }
        .select-input {
          background: #f8f7ff;
          border: 1px solid rgba(201,168,76,0.35);
          border-radius: 0.6rem;
          padding: 0.5rem 0.75rem;
          color: #1f2937;
          font-size: 0.875rem;
          outline: none;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .select-input:focus { border-color: #4c1d95; }
        .btn-royal { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; border: none; border-radius: 0.75rem; padding: 0.5rem 1.25rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; box-shadow: 0 2px 12px rgba(26,46,110,0.2); transition: all 0.2s; }
        .btn-royal:hover { box-shadow: 0 4px 18px rgba(26,46,110,0.35); transform: translateY(-1px); }
        .btn-royal:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .badge-login  { background: rgba(16,185,129,0.1); color: #065f46; border: 1px solid rgba(16,185,129,0.25); border-radius: 0.4rem; padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 0.3rem; }
        .badge-logout { background: rgba(239,68,68,0.08); color: #991b1b; border: 1px solid rgba(239,68,68,0.2); border-radius: 0.4rem; padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 0.3rem; }
        .badge-idle   { background: rgba(201,168,76,0.12); color: #92400e; border: 1px solid rgba(201,168,76,0.35); border-radius: 0.4rem; padding: 0.15rem 0.55rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 0.3rem; }
        .table-row:hover td { background: rgba(201,168,76,0.04); }
        .empty-state { text-align: center; padding: 3rem 1rem; color: #9ca3af; }
        .gold-bar { height: 3px; background: linear-gradient(90deg, #1a2e6e, #c9a84c, #f5d06e, #c9a84c, #4c1d95); border-radius: 2px; }

        /* Pagination */
        .pagination-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding: 0.875rem 1.25rem; border-top: 1px solid rgba(201,168,76,0.15); }
        .page-btn {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 2rem; height: 2rem; padding: 0 0.4rem;
          border-radius: 0.5rem;
          border: 1px solid rgba(201,168,76,0.3);
          background: #f8f7ff;
          color: #374151;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .page-btn:hover:not(:disabled):not(.active) { border-color: #4c1d95; color: #4c1d95; background: rgba(76,29,149,0.05); }
        .page-btn.active { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; border-color: transparent; box-shadow: 0 2px 8px rgba(26,46,110,0.25); }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .page-btn.ellipsis { border-color: transparent; background: transparent; cursor: default; color: #9ca3af; }

        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Header */}
      <header className="header-bar sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow: "0 4px 14px rgba(26,46,110,0.3)" }}>
                <FileSearch className="size-5 text-yellow-300" />
              </div>
              <span className="royal-title text-lg font-black tracking-wide royal-gradient-text hidden sm:block">AICS</span>
            </Link>
            <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "1.2rem" }}>/</span>
            <span className="text-sm font-semibold" style={{ color: "#4c1d95" }}>Login Audit</span>
          </div>
          <Link href="/dashboard" className="btn-royal">
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Page */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Title */}
        <div className="mb-6">
          <h1 className="royal-title text-3xl font-black royal-gradient-text mb-1">Login Audit</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            Track all login and logout events across your workspace
          </p>
        </div>

        <div className="audit-card overflow-hidden">
          <div className="gold-bar" />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid rgba(201,168,76,0.15)" }}>
            {/* From date */}
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>From</label>
              <input
                type="date"
                className="date-input"
                value={fromDate}
                max={toDate}
                onChange={e => { setFromDate(e.target.value); setCurrentPage(1) }}
              />
            </div>

            {/* To date */}
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>To</label>
              <input
                type="date"
                className="date-input"
                value={toDate}
                min={fromDate}
                max={today()}
                onChange={e => { setToDate(e.target.value); setCurrentPage(1) }}
              />
            </div>

            {/* Search */}
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "#9ca3af" }} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Email or IP address…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Rows per page */}
            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rows</label>
              <select
                className="select-input"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
            </div>

            {/* Refresh + row count */}
            <div className="flex items-end gap-3 ml-auto">
              <span style={{ fontSize: "0.8rem", color: "#9ca3af", alignSelf: "center" }}>
                {loading ? "Loading…" : `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`}
              </span>
              <button className="btn-royal" onClick={fetchAudit} disabled={loading}>
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "rgba(201,168,76,0.06)", borderBottom: "1px solid rgba(201,168,76,0.18)" }}>
                  {["Date & Time", "Email", "Action", "IP Address", "User Agent"].map(h => (
                    <th key={h} style={{ padding: "0.75rem 1.25rem", textAlign: "left", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(pageSize > 10 ? 10 : pageSize)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(201,168,76,0.1)" }}>
                      {[...Array(5)].map((_, j) => (
                        <td key={j} style={{ padding: "0.85rem 1.25rem" }}>
                          <div style={{ height: "1rem", borderRadius: "0.3rem", background: "linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.2s infinite", width: j === 4 ? "60%" : "80%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📋</div>
                        <div style={{ fontWeight: 600, color: "#374151" }}>No audit records found</div>
                        <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>Try adjusting the date range or search filter</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((row) => (
                    <tr key={row.id} className="table-row" style={{ borderBottom: "1px solid rgba(201,168,76,0.1)" }}>
                      <td style={{ padding: "0.85rem 1.25rem", color: "#374151", whiteSpace: "nowrap" }}>
                        {formatDate(row.created_at)}
                      </td>
                      <td style={{ padding: "0.85rem 1.25rem", color: "#1a2e6e", fontWeight: 500 }}>
                        {row.email}
                      </td>
                      <td style={{ padding: "0.85rem 1.25rem" }}>
                        {row.action === "LOGIN" ? (
                          <span className="badge-login">
                            <LogIn className="size-3" /> LOGIN
                          </span>
                        ) : row.action === "LOGOUT_IDLE_TIMEOUT" ? (
                          <span className="badge-idle">
                            <LogOut className="size-3" /> IDLE TIMEOUT
                          </span>
                        ) : (
                          <span className="badge-logout">
                            <LogOut className="size-3" /> LOGOUT
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.85rem 1.25rem", color: "#6b7280", fontFamily: "monospace", fontSize: "0.82rem" }}>
                        {row.ip_address ?? "—"}
                      </td>
                      <td style={{ padding: "0.85rem 1.25rem", color: "#9ca3af", fontSize: "0.78rem", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={row.user_agent ?? ""}>
                        {row.user_agent ? row.user_agent.split(" ").slice(0, 4).join(" ") + "…" : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {!loading && filtered.length > 0 && (
            <div className="pagination-bar">
              {/* Info */}
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                Showing{" "}
                <span style={{ fontWeight: 600, color: "#374151" }}>{pageStart + 1}–{Math.min(pageEnd, filtered.length)}</span>
                {" "}of{" "}
                <span style={{ fontWeight: 600, color: "#374151" }}>{filtered.length}</span>
                {" "}records
              </span>

              {/* Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                {/* First */}
                <button className="page-btn" onClick={() => goTo(1)} disabled={safePage === 1} title="First page">
                  <ChevronsLeft className="size-3.5" />
                </button>
                {/* Prev */}
                <button className="page-btn" onClick={() => goTo(safePage - 1)} disabled={safePage === 1} title="Previous page">
                  <ChevronLeft className="size-3.5" />
                </button>

                {/* Page numbers */}
                {getPageNumbers().map((p, i) =>
                  p === "…" ? (
                    <button key={`ellipsis-${i}`} className="page-btn ellipsis" disabled>…</button>
                  ) : (
                    <button
                      key={p}
                      className={`page-btn${p === safePage ? " active" : ""}`}
                      onClick={() => goTo(p as number)}
                    >
                      {p}
                    </button>
                  )
                )}

                {/* Next */}
                <button className="page-btn" onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} title="Next page">
                  <ChevronRight className="size-3.5" />
                </button>
                {/* Last */}
                <button className="page-btn" onClick={() => goTo(totalPages)} disabled={safePage === totalPages} title="Last page">
                  <ChevronsRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}