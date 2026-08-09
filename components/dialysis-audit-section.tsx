"use client"

import type React from "react"
import { useState } from "react"
import { Download, Upload, CheckCircle2, AlertCircle, Stethoscope } from "lucide-react"

interface DialysisChecklistItem {
  label: string
  status: "present" | "missing"
  effectiveDate?: string
  noteText?: string
}

interface DialysisAuditGroup {
  type: "av-graft" | "perma-cath"
  totalItems: number
  presentCount: number
  missingCount: number
  items: DialysisChecklistItem[]
}

interface DialysisAuditResult {
  residentName: string
  location: string
  admissionDate: string
  groups: DialysisAuditGroup[]
  hasBothAccessTypes?: boolean
}

function SCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.92)",
      border: "1px solid rgba(201,168,76,0.28)",
      borderRadius: "18px",
      boxShadow: "0 4px 32px rgba(26,46,110,0.07), 0 1px 0 rgba(201,168,76,0.35) inset",
      backdropFilter: "blur(20px)",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  )
}

function SCardHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ padding: "20px 24px 0" }}>
      <h3 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "18px", color: "#111827", marginBottom: desc ? "4px" : 0, lineHeight: 1.2 }}>{title}</h3>
      {desc && <p style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>{desc}</p>}
      <div style={{ height: "1px", background: "linear-gradient(90deg,rgba(26,46,110,0.1),rgba(201,168,76,0.3),transparent)", marginTop: "14px" }} />
    </div>
  )
}

function FileDropInput({
  id, file, onChange, disabled, label, hint,
}: {
  id: string
  file: File | null
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
  label: string
  hint: string
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id} type="file" accept=".pdf"
        onChange={onChange} disabled={disabled}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2, width: "100%", height: "100%" }}
      />
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "12px 16px", borderRadius: "12px",
        border: file ? "1.5px solid rgba(201,168,76,0.5)" : "1.5px dashed rgba(201,168,76,0.35)",
        background: file ? "rgba(201,168,76,0.05)" : "rgba(26,46,110,0.02)",
        cursor: "pointer", transition: "all .2s",
      }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: file ? "linear-gradient(135deg,#1a2e6e,#4c1d95)" : "rgba(26,46,110,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {file
            ? <CheckCircle2 style={{ width: "18px", height: "18px", color: "#fbbf24" }} />
            : <Upload style={{ width: "18px", height: "18px", color: "#1a2e6e" }} />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {file ? (
            <>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a2e6e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to process</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>{label}</div>
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>{hint}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface DialysisAuditSectionProps {
  userRole?: string | null
}

export function DialysisAuditSection({ userRole }: DialysisAuditSectionProps) {
  const [dialysisFile, setDialysisFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<DialysisAuditResult[]>([])
  const [processStatus, setProcessStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleDialysisFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setDialysisFile(file)
      setResults([])
      setProcessStatus("idle")
      setErrorMessage("")
    }
  }

  const extractPdfText = async (file: File) => {
    const pdfjsLib = await import("pdfjs-dist")
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url
    ).toString()

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    let extractedText = ""
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const tc = await page.getTextContent()
      extractedText += tc.items.map((item: any) => item.str).join(" ") + "\n"
    }
    return { extractedText, numPages: pdf.numPages }
  }

  const handleProcess = async () => {
    if (!dialysisFile) return
    setIsProcessing(true)
    setProcessStatus("idle")
    setErrorMessage("")

    try {
      // Parse the PDF in-memory
      const dialysis = await extractPdfText(dialysisFile)

      // Send extracted text to the dialysis audit API
      const response = await fetch("/api/dialysis-audit-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dialysisText: dialysis.extractedText,
          dialysisNumPages: dialysis.numPages,
          dialysisFileName: dialysisFile.name,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Processing failed")
      }

      const data = await response.json()
      setResults(data.results || [])
      setProcessStatus("success")
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to process file")
      setProcessStatus("error")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExport = async () => {
    if (results.length === 0) return
    try {
      const response = await fetch("/api/dialysis-audit-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results,
          fileName: dialysisFile?.name || "dialysis-audit",
        }),
      })
      if (!response.ok) throw new Error("Export failed")
      const blob = await response.blob()
      const fileName = `${(dialysisFile?.name || "dialysis-audit").replace(".pdf", "")}-Dialysis-Audit-${Date.now()}.docx`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch {
      alert("Export failed. Please try again.")
    }
  }

  const fileReady = !!dialysisFile

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Upload + Process */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Upload Card */}
        <SCard>
          <SCardHeader
            title="Upload Dialysis File"
            desc="Upload the resident's dialysis treatment record PDF to review dialysis compliance."
          />
          <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Dialysis PDF File
              </label>
              <FileDropInput
                id="dialysis-upload"
                file={dialysisFile}
                onChange={handleDialysisFileUpload}
                disabled={isProcessing}
                label="Click to choose the dialysis PDF file"
                hint="Resident dialysis treatment / session record"
              />
            </div>
          </div>
        </SCard>

        {/* Process Action Card */}
        <SCard>
          <div style={{ padding: "16px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "2px" }}>
                {fileReady ? "✓ File ready" : "No file selected"}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                Reviews dialysis audit compliance
              </div>
              {processStatus === "error" && errorMessage && (
                <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px" }}>{errorMessage}</div>
              )}
            </div>
            <button
              type="button" onClick={handleProcess}
              disabled={!fileReady || isProcessing}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                padding: "12px 20px", borderRadius: "12px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#1a2e6e,#4c1d95)",
                color: "#fff", fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: "0 4px 16px rgba(26,46,110,0.28)",
                transition: "all .2s", opacity: (!fileReady || isProcessing) ? 0.55 : 1,
              }}
            >
              {isProcessing ? (
                <>
                  <svg style={{ width: "14px", height: "14px", animation: "spin .75s linear infinite" }} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Processing…
                </>
              ) : (
                <><Stethoscope style={{ width: "14px", height: "14px" }} /> Analyse Dialysis Audit</>
              )}
            </button>
          </div>
        </SCard>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <SCard>
          <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "18px", color: "#111827", marginBottom: "4px" }}>Dialysis Audit Results</h3>
              <p style={{ fontSize: "13px", color: "#9ca3af" }}>
                Found <strong style={{ color: "#1a2e6e" }}>{results.length}</strong> resident{results.length !== 1 ? "s" : ""} flagged for dialysis review · {results.reduce((s,r)=>s+r.groups.reduce((gs,g)=>gs+g.missingCount,0),0)} missing checklist item{results.reduce((s,r)=>s+r.groups.reduce((gs,g)=>gs+g.missingCount,0),0)!==1?"s":""}
              </p>
            </div>
            <button
              type="button" onClick={handleExport}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 18px", borderRadius: "11px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#1a2e6e,#4c1d95)",
                color: "#fff", fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: "0 4px 14px rgba(26,46,110,0.25)", transition: "all .2s", flexShrink: 0,
              }}
            >
              <Download style={{ width: "14px", height: "14px" }} /> Export to Word
            </button>
          </div>
          <div style={{ height: "1px", background: "linear-gradient(90deg,rgba(26,46,110,0.1),rgba(201,168,76,0.3),transparent)", margin: "14px 24px 0" }} />
          <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {results.map((result, idx) => (
              <div key={idx} style={{ borderLeft: "2px solid rgba(201,168,76,0.4)", borderRadius: "0 12px 12px 0", padding: "14px 16px", background: "rgba(26,46,110,0.02)" }}>
                {/* Resident header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", borderRadius: "6px", padding: "2px 8px" }}>
                    {result.groups.reduce((s,g)=>s+g.missingCount,0)} missing
                  </span>
                  {result.hasBothAccessTypes && (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", background: "linear-gradient(135deg,#fbbf24,#f59e0b)", borderRadius: "6px", padding: "2px 8px" }}>
                      ⚠ Has Both AV Graft &amp; Perma Cath
                    </span>
                  )}
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a2e6e", fontFamily: "'DM Sans',sans-serif" }}>{result.residentName}</span>
                  {result.location && result.location !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}>· {result.location}</span>}
                  {result.admissionDate && result.admissionDate !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}>· Status: {result.admissionDate}</span>}
                </div>
                {result.hasBothAccessTypes && (
                  <div style={{ fontSize: "11px", color: "#92400e", marginBottom: "10px", fontStyle: "italic" }}>
                    This resident has both AV Graft/Fistula and Perma Cath orders on record — only the Perma Cath checklist is shown below.
                  </div>
                )}
                {/* Each compliance issue group */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result.groups.map((group, gi) => (
                    <div key={gi} style={{ borderRadius: "10px", border: "1px solid rgba(201,168,76,0.2)", overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {group.type === "perma-cath" ? "Dialysis Perma Cath: " : "Dialysis AV Graft: "}
                        </span>
                        <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>
                          {group.presentCount} of {group.totalItems} items present, {group.missingCount} missing
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px 12px" }}>
                        {group.items.map((item, ii) => (
                          <div key={ii} style={{
                            display: "flex", alignItems: "flex-start", gap: "10px",
                            padding: "6px 8px", borderRadius: "8px",
                            background: "rgba(220,38,38,0.06)",
                          }}>
                            <span style={{
                              fontSize: "9px", fontWeight: 700, color: "#fff", borderRadius: "4px",
                              padding: "2px 6px", flexShrink: 0, marginTop: "1px",
                              background: "#dc2626",
                              textTransform: "uppercase", letterSpacing: "0.03em",
                            }}>
                              Missing
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "#b91c1c", fontFamily: "'DM Sans',sans-serif" }}>
                                {item.label}
                              </span>
                              <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'DM Sans',sans-serif", fontStyle: "italic" }}>No matching order found</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SCard>
      )}

      {/* No results */}
      {processStatus === "success" && results.length === 0 && (
        <SCard>
          <div style={{ padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(26,46,110,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AlertCircle style={{ width: "24px", height: "24px", color: "#9ca3af" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "16px", color: "#374151", marginBottom: "4px" }}>No missing dialysis checklist items found</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "13px", color: "#9ca3af" }}>Every AV Graft / Perma Cath resident in this file has a fully complete checklist, or no dialysis orders were found.</p>
            </div>
          </div>
        </SCard>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}