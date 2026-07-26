"use client"

import { useState, useRef, useEffect } from "react"
import { Settings, Users, ChevronRight, ClipboardList, FolderOpen } from "lucide-react"
import Link from "next/link"

export function SettingsDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const menuItems = [
    { href: "/dashboard/users",       icon: Users,          label: "Users" },
    { href: "/dashboard/files",       icon: FolderOpen,     label: "Files" },
    { href: "/dashboard/login-audit", icon: ClipboardList,  label: "Login Audit" },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-royal-sm flex items-center gap-1.5 rounded-xl px-3 py-2.5"
        aria-label="Settings"
        style={{
          background: "linear-gradient(135deg, #1a2e6e, #4c1d95)",
          color: "#fff",
          boxShadow: "0 2px 12px rgba(26,46,110,0.2)",
          transition: "all 0.2s",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Settings className="size-5" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-52 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.97)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(201,168,76,0.35)",
            boxShadow: "0 8px 40px rgba(26,46,110,0.15)",
            zIndex: 9999,
          }}
        >
          <div
            className="px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded-t-xl"
            style={{ color: "#9ca3af", borderBottom: "1px solid rgba(201,168,76,0.15)" }}
          >
            Settings
          </div>

          {menuItems.map(({ href, icon: Icon, label }, idx) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
              style={{
                color: "#1a2e6e",
                borderRadius: idx === menuItems.length - 1 ? "0 0 0.75rem 0.75rem" : undefined,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(201,168,76,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" style={{ color: "#4c1d95" }} />
                {label}
              </span>
              <ChevronRight className="size-3.5 opacity-50" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}