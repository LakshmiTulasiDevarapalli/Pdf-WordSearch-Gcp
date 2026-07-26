"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  FileSearch, Upload, Download, Pencil, Trash2, FileText, Loader2,
  Check, X, AlertTriangle, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

interface FileRecord {
  id: string
  file_name: string
  storage_path: string
  file_size: number
  content_type: string | null
  uploaded_by: string
  created_at: string
  updated_at: string
}

// Must match the bucket id created in supabase/migrations/20260725_create_uploaded_files.sql
const BUCKET = "uploaded-files"
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export default function FilesPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userEmail, setUserEmail] = useState("")

  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Search + pagination state
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError("")
    const { data, error } = await supabase
      .from("uploaded_files")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setFiles(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }
      setUserEmail(user.email || "")

      const { data: userData } = await supabase
        .from("users").select("role").eq("email", user.email).single()
      const admin = (userData?.role ?? "").toLowerCase() === "admin"
      setIsAdmin(admin)
      setAuthChecked(true)

      if (!admin) { router.replace("/dashboard"); return }
      fetchFiles()
    }
    init()
  }, [router, fetchFiles])

  // Reset to page 1 whenever search or pageSize changes
  useEffect(() => { setCurrentPage(1) }, [search, pageSize])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPendingFile(e.target.files?.[0] || null)
    setError("")
  }

  const handleUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setError("")
    setSuccess("")
    try {
      // Randomize the storage path so two people uploading "notes.pdf" never collide;
      // the human-readable name is kept separately in file_name.
      const storagePath = `${crypto.randomUUID()}-${pendingFile.name}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, pendingFile, { upsert: false })
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from("uploaded_files").insert({
        file_name: pendingFile.name,
        storage_path: storagePath,
        file_size: pendingFile.size,
        content_type: pendingFile.type || null,
        uploaded_by: userEmail,
      })
      if (insertError) {
        // Roll back the storage object if the DB insert failed, so we don't
        // leave an orphaned file with no record pointing to it.
        await supabase.storage.from(BUCKET).remove([storagePath])
        throw insertError
      }

      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      setShowUploadModal(false)
      setSuccess("File uploaded successfully.")
      await fetchFiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const closeUploadModal = () => {
    if (uploading) return
    setShowUploadModal(false)
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    setError("")
  }

  const handleDownload = async (record: FileRecord) => {
    setError("")
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(record.storage_path, 60)
    if (error || !data?.signedUrl) {
      setError(error?.message || "Could not generate a download link")
      return
    }
    window.open(data.signedUrl, "_blank")
  }

  const startRename = (record: FileRecord) => {
    setEditingId(record.id)
    setEditingName(record.file_name)
    setDeleteConfirmId(null)
    setError("")
    setSuccess("")
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditingName("")
  }

  const saveRename = async (record: FileRecord) => {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === record.file_name) {
      cancelRename()
      return
    }
    const { error } = await supabase
      .from("uploaded_files")
      .update({ file_name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", record.id)
    if (error) {
      setError(error.message)
      return
    }
    setFiles((prev) => prev.map((f) => (f.id === record.id ? { ...f, file_name: trimmed } : f)))
    setSuccess("File renamed successfully.")
    cancelRename()
  }

  const handleDelete = async (record: FileRecord) => {
    setDeleting(true)
    setError("")
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([record.storage_path])
      if (storageError) throw storageError

      const { error: deleteError } = await supabase.from("uploaded_files").delete().eq("id", record.id)
      if (deleteError) throw deleteError

      setFiles((prev) => prev.filter((f) => f.id !== record.id))
      setSuccess("File deleted.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleteConfirmId(null)
      setDeleting(false)
    }
  }

  // Filtered + paginated data
  const filtered = files.filter((f) =>
    !search ||
    f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.uploaded_by ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (f.content_type ?? "").toLowerCase().includes(search.toLowerCase())
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

  if (!authChecked || !isAdmin) return null

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
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn-royal { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; box-shadow: 0 4px 20px rgba(26,46,110,0.3); transition: all 0.2s; position: relative; overflow: hidden; }
        .btn-royal:hover { box-shadow: 0 8px 30px rgba(26,46,110,0.45); transform: translateY(-1px); }
        .delete-accordion { overflow: hidden; max-height: 0; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; }
        .delete-accordion.open { max-height: 80px; opacity: 1; }
        .search-input { background: #f8f7ff; border: 1px solid rgba(201,168,76,0.35); border-radius: 0.6rem; padding: 0.5rem 0.75rem 0.5rem 2.25rem; color: #1f2937; font-size: 0.875rem; outline: none; width: 220px; transition: border-color 0.2s; }
        .search-input:focus { border-color: #4c1d95; }
        .select-input { background: #f8f7ff; border: 1px solid rgba(201,168,76,0.35); border-radius: 0.6rem; padding: 0.5rem 0.75rem; color: #1f2937; font-size: 0.875rem; outline: none; cursor: pointer; transition: border-color 0.2s; }
        .select-input:focus { border-color: #4c1d95; }
        .pagination-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding: 0.875rem 1.5rem; border-top: 1px solid rgba(201,168,76,0.15); }
        .page-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 2rem; height: 2rem; padding: 0 0.4rem; border-radius: 0.5rem; border: 1px solid rgba(201,168,76,0.3); background: #f8f7ff; color: #374151; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; font-size: 13px; }
        .page-btn:hover:not(:disabled):not(.active) { border-color: #4c1d95; color: #4c1d95; background: rgba(76,29,149,0.05); }
        .page-btn.active { background: linear-gradient(135deg, #1a2e6e, #4c1d95); color: #fff; border-color: transparent; box-shadow: 0 2px 8px rgba(26,46,110,0.25); }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .page-btn.ellipsis { border-color: transparent; background: transparent; cursor: default; color: #9ca3af; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
        .modal-panel { background: #fff; border: 1px solid rgba(201,168,76,0.3); border-radius: 16px; box-shadow: 0 20px 60px rgba(26,46,110,0.25); width: 100%; max-width: 440px; }
        .file-drop { border: 1.5px dashed rgba(201,168,76,0.4); border-radius: 12px; background: #f8f7ff; padding: 28px 16px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
        .file-drop:hover { border-color: #4c1d95; background: rgba(76,29,149,0.04); }
        .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-secondary:hover { background: #e5e7eb; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Header */}
      <header className="header-bar sticky top-0 z-20">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div style={{ padding: "8px", borderRadius: "12px", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow: "0 3px 12px rgba(26,46,110,0.28)" }}>
              <FileSearch style={{ width: "17px", height: "17px", color: "#fbbf24" }} />
            </div>
            <div className="flex flex-col">
              <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "19px", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: "1.1" }}>AICS</span>
              <span style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.2em", color: "#92400e", textTransform: "uppercase" }}>PDF Search Engine</span>
            </div>
          </Link>
          <Link href="/dashboard" className="btn-royal flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Page Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "28px", fontWeight: 400, background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Files</h1>
            <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "3px", fontFamily: "'DM Sans',sans-serif" }}>Upload, rename, and remove shared files</p>
          </div>

          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={() => { setShowUploadModal(true); setError(""); setSuccess("") }}
          >
            <Upload className="size-4" />
            Upload File
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

        {/* Files Table */}
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
                  placeholder="File name, uploader, type…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em" }}>Rows</label>
              <select className="select-input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>

            <div className="ml-auto flex items-end">
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                {loading ? "Loading…" : (
                  <><span style={{ fontWeight: 600, color: "#374151" }}>{filtered.length}</span> file{filtered.length !== 1 ? "s" : ""}</>
                )}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16" style={{ color: "#9ca3af" }}>
              <Loader2 className="size-6 animate-spin mr-2" /> Loading files...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color: "#9ca3af" }}>
              <p className="text-sm font-medium">{search ? "No files match your search" : "No files uploaded yet"}</p>
              <p className="text-xs mt-1">{search ? "Try a different keyword" : "Choose a file above and click \"Upload File\" to get started"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {["File Name", "Size", "Uploaded By", "Uploaded At", ""].map((h) => (
                        <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((record, i) => (
                      <React.Fragment key={record.id}>
                        <tr
                          style={{
                            borderBottom: deleteConfirmId === record.id ? "none" : (i < paginated.length - 1 ? "1px solid #f9fafb" : "none"),
                            background: deleteConfirmId === record.id ? "rgba(239,68,68,0.03)" : "transparent",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => { if (deleteConfirmId !== record.id) e.currentTarget.style.background = "#fafafa" }}
                          onMouseLeave={(e) => { if (deleteConfirmId !== record.id) e.currentTarget.style.background = "transparent" }}
                        >
                          <td className="px-6 py-4 text-sm font-medium" style={{ color: "#111827" }}>
                            <div className="flex items-center gap-2">
                              <FileText className="size-4 shrink-0" style={{ color: "#4c1d95" }} />
                              {editingId === record.id ? (
                                <input
                                  autoFocus
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveRename(record)
                                    if (e.key === "Escape") cancelRename()
                                  }}
                                  style={{ fontSize: "13px", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(201,168,76,0.4)", fontFamily: "'DM Sans',sans-serif" }}
                                />
                              ) : (
                                <span>{record.file_name}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm" style={{ color: "#6b7280" }}>{formatBytes(record.file_size)}</td>
                          <td className="px-6 py-4 text-sm" style={{ color: "#6b7280" }}>{record.uploaded_by}</td>
                          <td className="px-6 py-4 text-xs" style={{ color: "#9ca3af" }}>
                            {new Date(record.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {editingId === record.id ? (
                                <>
                                  <button onClick={() => saveRename(record)}
                                    className="p-1.5 rounded-lg transition-colors" style={{ color: "#16a34a" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(22,163,74,0.08)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} title="Save name">
                                    <Check className="size-3.5" />
                                  </button>
                                  <button onClick={cancelRename}
                                    className="p-1.5 rounded-lg transition-colors" style={{ color: "#6b7280" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(107,114,128,0.08)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} title="Cancel rename">
                                    <X className="size-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => handleDownload(record)}
                                    className="p-1.5 rounded-lg transition-colors" style={{ color: "#1a2e6e" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(26,46,110,0.08)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} title="Download">
                                    <Download className="size-3.5" />
                                  </button>
                                  <button onClick={() => startRename(record)}
                                    className="p-1.5 rounded-lg transition-colors" style={{ color: "#4c1d95" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(76,29,149,0.08)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} title="Rename">
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => { setDeleteConfirmId(deleteConfirmId === record.id ? null : record.id); setError(""); setSuccess("") }}
                                    className="p-1.5 rounded-lg transition-colors"
                                    style={{ color: deleteConfirmId === record.id ? "#fff" : "#ef4444", background: deleteConfirmId === record.id ? "#ef4444" : "transparent" }}
                                    onMouseEnter={(e) => { if (deleteConfirmId !== record.id) e.currentTarget.style.background = "rgba(239,68,68,0.08)" }}
                                    onMouseLeave={(e) => { if (deleteConfirmId !== record.id) e.currentTarget.style.background = "transparent" }} title="Delete">
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Delete Confirmation Row */}
                        <tr key={`${record.id}-confirm`} style={{ borderBottom: deleteConfirmId === record.id && i < paginated.length - 1 ? "1px solid #f9fafb" : "none" }}>
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div className={`delete-accordion ${deleteConfirmId === record.id ? "open" : ""}`}>
                              <div className="flex items-center justify-between px-6 py-3"
                                style={{ background: "rgba(239,68,68,0.05)", borderTop: "1px dashed rgba(239,68,68,0.2)", borderBottom: "1px dashed rgba(239,68,68,0.2)" }}>
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="size-4" style={{ color: "#ef4444" }} />
                                  <span className="text-sm font-medium" style={{ color: "#374151" }}>
                                    Are you sure you want to delete <strong>{record.file_name}</strong>? This action cannot be undone.
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 ml-4 shrink-0">
                                  <button onClick={() => setDeleteConfirmId(null)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                    style={{ background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e7eb")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "#f3f4f6")}>
                                    <X className="size-3" /> Cancel
                                  </button>
                                  <button onClick={() => handleDelete(record)} disabled={deleting}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                    style={{ background: "#ef4444", color: "#fff", border: "1px solid #dc2626", opacity: deleting ? 0.7 : 1 }}
                                    onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = "#dc2626" }}
                                    onMouseLeave={(e) => { if (!deleting) e.currentTarget.style.background = "#ef4444" }}>
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
                  {" "}files
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={closeUploadModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(201,168,76,0.15)" }}>
              <h2 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "20px", color: "#111827" }}>Upload File</h2>
              <button
                onClick={closeUploadModal}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "#6b7280" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(107,114,128,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-6 py-5">
              <label
                htmlFor="upload-file-input"
                className="file-drop flex flex-col items-center gap-2"
              >
                <Upload className="size-5" style={{ color: "#4c1d95" }} />
                <span className="text-sm font-medium" style={{ color: "#374151" }}>
                  {pendingFile ? pendingFile.name : "Click to choose a file"}
                </span>
                <span className="text-xs" style={{ color: "#9ca3af" }}>
                  {pendingFile ? formatBytes(pendingFile.size) : "Any file type is supported"}
                </span>
              </label>
              <input
                id="upload-file-input"
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                disabled={uploading}
                className="sr-only"
              />

              {error && (
                <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}>
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid rgba(201,168,76,0.15)" }}>
              <button type="button" className="btn-secondary" onClick={closeUploadModal} disabled={uploading}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={handleUpload}
                disabled={!pendingFile || uploading}
              >
                {uploading
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Upload className="size-4" />}
                {uploading ? "Uploading…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}