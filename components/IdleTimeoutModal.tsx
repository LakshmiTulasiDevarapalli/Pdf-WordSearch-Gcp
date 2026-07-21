"use client"

import { AlertCircle } from "lucide-react"

interface IdleTimeoutModalProps {
  secondsLeft: number
  onContinue: () => void
  onLogout: () => void
}

export function IdleTimeoutModal({ secondsLeft, onContinue, onLogout }: IdleTimeoutModalProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-timeout-title"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(15,20,40,0.55)", backdropFilter: "blur(4px)",
        padding: "16px",
      }}
    >
      <div style={{
        width: "100%", maxWidth: "380px", borderRadius: "20px", overflow: "hidden",
        background: "#fff", boxShadow: "0 24px 80px rgba(26,46,110,0.35)",
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ height: "3px", background: "linear-gradient(90deg,#1a2e6e,#c9a84c,#f5d06e,#c9a84c,#4c1d95)" }} />

        <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "14px",
            background: "linear-gradient(135deg,#1a2e6e,#4c1d95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <AlertCircle style={{ width: "22px", height: "22px", color: "#fbbf24" }} />
          </div>

          <h2 id="idle-timeout-title" style={{
            fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "22px",
            color: "#1a2e6e", marginBottom: "8px",
          }}>
            Still there?
          </h2>

          <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.5 }}>
            You've been inactive for a while. For security, you'll be signed out in
          </p>

          <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "32px", color: "#b91c1c", margin: "8px 0 20px" }}>
            {Math.max(Math.round(secondsLeft), 0)}s
          </p>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onLogout}
              style={{
                flex: 1, padding: "12px", borderRadius: "12px",
                border: "1.5px solid rgba(0,0,0,0.1)", background: "#fff",
                color: "#6b7280", fontWeight: 600, fontSize: "13px",
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Sign out
            </button>
            <button
              onClick={onContinue}
              style={{
                flex: 1, padding: "12px", borderRadius: "12px", border: "none",
                background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", color: "#fff",
                fontWeight: 700, fontSize: "13px", fontFamily: "inherit", cursor: "pointer",
                boxShadow: "0 8px 24px rgba(26,46,110,0.32)",
              }}
            >
              Stay signed in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}