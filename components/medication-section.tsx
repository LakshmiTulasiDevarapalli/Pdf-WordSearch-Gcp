"use client"

import type React from "react"
import { useState } from "react"
import { Download, Upload, CheckCircle2, AlertCircle, FileText } from "lucide-react"

interface MedicationGroup {
  duplicateNoteText: string
  entries: { effectiveDate: string; noteText: string }[]
}

interface MedicationResult {
  residentName: string
  location: string
  admissionDate: string
  groups: MedicationGroup[]
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

export function MedicationSection() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<MedicationResult[]>([])
  const [processStatus, setProcessStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      setResults([])
      setProcessStatus("idle")
      setErrorMessage("")
    }
  }

  const handleProcess = async () => {
    if (!uploadedFile) return
    setIsProcessing(true)
    setProcessStatus("idle")
    setErrorMessage("")

    try {
      // Parse PDF in-memory
      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url
      ).toString()

      const arrayBuffer = await uploadedFile.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let extractedText = ""
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const tc = await page.getTextContent()
        extractedText += tc.items.map((item: any) => item.str).join(" ") + "\n"
      }

      // Send to medication API
      const response = await fetch("/api/medication-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedText,
          numPages: pdf.numPages,
          fileName: uploadedFile.name,
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
      const response = await fetch("/api/medication-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, fileName: uploadedFile?.name || "medication" }),
      })
      if (!response.ok) throw new Error("Export failed")
      const blob = await response.blob()
      const fileName = `${(uploadedFile?.name || "medication").replace(".pdf", "")}-eMAR-${Date.now()}.docx`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch {
      alert("Export failed. Please try again.")
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Upload + Process */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Upload Card */}
        <SCard>
          <SCardHeader
            title="Upload PDF File"
            desc="Upload the same PDF as Progress Notes. Only residents with 'Type: Default PN Type for eMAR' appearing more than once will be extracted."
          />
          <div style={{ padding: "16px 24px 20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>PDF File</label>
            <div style={{ position: "relative" }}>
              <input
                id="med-file-upload" type="file" accept=".pdf"
                onChange={handleFileUpload} disabled={isProcessing}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", zIndex: 2, width: "100%", height: "100%" }}
              />
              <div style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "12px 16px", borderRadius: "12px",
                border: uploadedFile ? "1.5px solid rgba(201,168,76,0.5)" : "1.5px dashed rgba(201,168,76,0.35)",
                background: uploadedFile ? "rgba(201,168,76,0.05)" : "rgba(26,46,110,0.02)",
                cursor: "pointer", transition: "all .2s",
              }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: uploadedFile ? "linear-gradient(135deg,#1a2e6e,#4c1d95)" : "rgba(26,46,110,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {uploadedFile
                    ? <CheckCircle2 style={{ width: "18px", height: "18px", color: "#fbbf24" }} />
                    : <Upload style={{ width: "18px", height: "18px", color: "#1a2e6e" }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {uploadedFile ? (
                    <>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a2e6e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uploadedFile.name}</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to process</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>Click to choose a PDF file</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>Same format as Progress Notes PDF</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </SCard>

        {/* Process Action Card */}
        <SCard>
          <div style={{ padding: "16px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "2px" }}>
                {uploadedFile ? "✓ File ready" : "No file selected"}
              </div>
              <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                Finds duplicate eMAR entries
              </div>
              {processStatus === "error" && errorMessage && (
                <div style={{ fontSize: "11px", color: "#dc2626", marginTop: "4px" }}>{errorMessage}</div>
              )}
            </div>
            <button
              type="button" onClick={handleProcess}
              disabled={!uploadedFile || isProcessing}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                padding: "12px 20px", borderRadius: "12px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#1a2e6e,#4c1d95)",
                color: "#fff", fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: "0 4px 16px rgba(26,46,110,0.28)",
                transition: "all .2s", opacity: (!uploadedFile || isProcessing) ? 0.55 : 1,
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
                <><FileText style={{ width: "14px", height: "14px" }} /> Analyse eMAR</>
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
              <h3 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "18px", color: "#111827", marginBottom: "4px" }}>eMAR Results</h3>
              <p style={{ fontSize: "13px", color: "#9ca3af" }}>
                Found <strong style={{ color: "#1a2e6e" }}>{results.length}</strong> resident{results.length !== 1 ? "s" : ""} · {results.reduce((s,r)=>s+r.groups.length,0)} repeated medication{results.reduce((s,r)=>s+r.groups.length,0)!==1?"s":""}
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
                    {result.groups.length} medication{result.groups.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a2e6e", fontFamily: "'DM Sans',sans-serif" }}>{result.residentName}</span>
                  {result.location && result.location !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}>· {result.location}</span>}
                  {result.admissionDate && result.admissionDate !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}>· Adm: {result.admissionDate}</span>}
                </div>
                {/* Each medication group */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result.groups.map((group, gi) => (
                    <div key={gi} style={{ borderRadius: "10px", border: "1px solid rgba(201,168,76,0.2)", overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {result.groups.length > 1 ? "Medication " + (gi+1) + ": " : "Repeated Medication: "}
                        </span>
                        <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{group.duplicateNoteText}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 12px" }}>
                        {group.entries.map((entry, ei) => (
                          <div key={ei} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "rgba(26,46,110,0.7)", borderRadius: "4px", padding: "1px 6px", flexShrink: 0 }}>#{ei+1}</span>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", fontFamily: "'DM Sans',sans-serif" }}>Effective: {entry.effectiveDate}</span>
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
              <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "16px", color: "#374151", marginBottom: "4px" }}>No duplicate eMAR entries found</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "13px", color: "#9ca3af" }}>No residents had 'Default PN Type for eMAR' appearing more than once.</p>
            </div>
          </div>
        </SCard>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}