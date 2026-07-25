"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Download, Upload, CheckCircle2, AlertCircle, HeartPulse, Users, ListFilter } from "lucide-react"

interface VitalExceptionEntry {
  dateTime: string
  value: string
  reason: string
}

interface VitalExceptionGroup {
  vitalType: string
  thresholdText: string
  entries: VitalExceptionEntry[]
}

interface VitalExceptionResult {
  residentName: string
  residentId: string
  location: string
  admissionDate: string
  groups: VitalExceptionGroup[]
}

// Pivoted view: same underlying entries, organized by exception type first
// instead of by resident first.
interface CategoryResidentEntries {
  residentName: string
  residentId: string
  location: string
  admissionDate: string
  entries: VitalExceptionEntry[]
}

interface ExceptionCategory {
  vitalType: string
  thresholdText: string
  residents: CategoryResidentEntries[]
}

function pivotByExceptionType(results: VitalExceptionResult[]): ExceptionCategory[] {
  const byType = new Map<string, ExceptionCategory>()

  for (const resident of results) {
    for (const group of resident.groups) {
      if (!byType.has(group.vitalType)) {
        byType.set(group.vitalType, {
          vitalType: group.vitalType,
          thresholdText: group.thresholdText,
          residents: [],
        })
      }
      byType.get(group.vitalType)!.residents.push({
        residentName: resident.residentName,
        residentId: resident.residentId,
        location: resident.location,
        admissionDate: resident.admissionDate,
        entries: group.entries,
      })
    }
  }

  // Most-flagged exception type first
  return [...byType.values()].sort((a, b) => {
    const totalA = a.residents.reduce((s, r) => s + r.entries.length, 0)
    const totalB = b.residents.reduce((s, r) => s + r.entries.length, 0)
    return totalB - totalA
  })
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

interface VitalExceptionReportSectionProps {
  userRole?: string | null
}

export function VitalExceptionReportSection({ userRole }: VitalExceptionReportSectionProps) {
  const [vitalsFile, setVitalsFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState("")
  const [results, setResults] = useState<VitalExceptionResult[]>([])
  const [groupBy, setGroupBy] = useState<"resident" | "category">("category")
  const categorized = useMemo(() => pivotByExceptionType(results), [results])
  const [processStatus, setProcessStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleVitalsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setVitalsFile(file)
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
    if (!vitalsFile) return
    setIsProcessing(true)
    setProcessStatus("idle")
    setErrorMessage("")

    try {
      // Parse the PDF in-memory
      const vitals = await extractPdfText(vitalsFile)

      // Send extracted text to the vital exception report API
      const response = await fetch("/api/vital-exception-report-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vitalsText: vitals.extractedText,
          vitalsNumPages: vitals.numPages,
          vitalsFileName: vitalsFile.name,
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
    if (results.length === 0 || isExporting) return
    setIsExporting(true)
    setExportError("")
    try {
      const response = await fetch("/api/vital-exception-report-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results,
          groupBy,
          fileName: vitalsFile?.name || "vital-exception-report",
        }),
      })
      if (!response.ok) {
        let detail = `HTTP ${response.status}`
        try {
          const err = await response.json()
          detail = err.details || err.error || detail
        } catch {
          // response wasn't JSON (e.g. a platform timeout page) — keep the status code
        }
        throw new Error(detail)
      }
      const blob = await response.blob()
      const fileName = `${(vitalsFile?.name || "vital-exception-report").replace(".pdf", "")}-Vital-Exception-Report-${Date.now()}.docx`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click()
      window.URL.revokeObjectURL(url); document.body.removeChild(a)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const fileReady = !!vitalsFile

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Upload + Process */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Upload Card */}
        <SCard>
          <SCardHeader
            title="Upload Vitals File"
            desc="Upload the Weights and Vitals Summary PDF to flag readings outside the expected range."
          />
          <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Vitals PDF File
              </label>
              <FileDropInput
                id="vitals-upload"
                file={vitalsFile}
                onChange={handleVitalsFileUpload}
                disabled={isProcessing}
                label="Click to choose the vitals PDF file"
                hint="Weights and Vitals Summary report"
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
                Flags Blood Pressure, Pulse, Respiration, O2 Sats, Blood Sugar and Temperature outside range
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
                <><HeartPulse style={{ width: "14px", height: "14px" }} /> Analyse Vital Exceptions</>
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
              <h3 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "18px", color: "#111827", marginBottom: "4px" }}>Vital Exception Results</h3>
              <p style={{ fontSize: "13px", color: "#9ca3af" }}>
                Found <strong style={{ color: "#1a2e6e" }}>{results.length}</strong> resident{results.length !== 1 ? "s" : ""} with vital exceptions · {results.reduce((s,r)=>s+r.groups.reduce((gs,g)=>gs+g.entries.length,0),0)} reading{results.reduce((s,r)=>s+r.groups.reduce((gs,g)=>gs+g.entries.length,0),0)!==1?"s":""} flagged
              </p>
              {results.reduce((s,r)=>s+r.groups.reduce((gs,g)=>gs+g.entries.length,0),0) > 2000 && (
                <p style={{ fontSize: "11px", color: "#b45309", marginTop: "2px" }}>
                  Large report — Word generation may take a minute or more.
                </p>
              )}
            </div>
            <button
              type="button" onClick={handleExport}
              disabled={isExporting}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "10px 18px", borderRadius: "11px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#1a2e6e,#4c1d95)",
                color: "#fff", fontSize: "13px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
                boxShadow: "0 4px 14px rgba(26,46,110,0.25)", transition: "all .2s", flexShrink: 0,
                opacity: isExporting ? 0.6 : 1,
              }}
            >
              {isExporting ? (
                <>
                  <svg style={{ width: "14px", height: "14px", animation: "spin .75s linear infinite" }} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Generating…
                </>
              ) : (
                <><Download style={{ width: "14px", height: "14px" }} /> Export to Word</>
              )}
            </button>
          </div>
          {exportError && (
            <div style={{ margin: "0 24px", padding: "10px 14px", borderRadius: "10px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", fontSize: "12px", color: "#dc2626" }}>
              {exportError}
            </div>
          )}

          {/* Group-by toggle */}
          <div style={{ padding: "14px 24px 0", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Group by</span>
            <div style={{ display: "inline-flex", borderRadius: "10px", border: "1px solid rgba(201,168,76,0.3)", overflow: "hidden" }}>
              <button
                type="button" onClick={() => setGroupBy("resident")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", border: "none", cursor: "pointer",
                  background: groupBy === "resident" ? "linear-gradient(135deg,#1a2e6e,#4c1d95)" : "transparent",
                  color: groupBy === "resident" ? "#fff" : "#374151",
                  fontSize: "12px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
                }}
              >
                <Users style={{ width: "12px", height: "12px" }} /> Resident
              </button>
              <button
                type="button" onClick={() => setGroupBy("category")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", border: "none", cursor: "pointer",
                  background: groupBy === "category" ? "linear-gradient(135deg,#1a2e6e,#4c1d95)" : "transparent",
                  color: groupBy === "category" ? "#fff" : "#374151",
                  fontSize: "12px", fontWeight: 700, fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
                }}
              >
                <ListFilter style={{ width: "12px", height: "12px" }} /> Exception Type
              </button>
            </div>
          </div>

          <div style={{ height: "1px", background: "linear-gradient(90deg,rgba(26,46,110,0.1),rgba(201,168,76,0.3),transparent)", margin: "14px 24px 0" }} />

          {groupBy === "resident" ? (
          <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {results.map((result, idx) => (
              <div key={idx} style={{ borderLeft: "2px solid rgba(201,168,76,0.4)", borderRadius: "0 12px 12px 0", padding: "14px 16px", background: "rgba(26,46,110,0.02)" }}>
                {/* Resident header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", borderRadius: "6px", padding: "2px 8px" }}>
                    {result.groups.length} vital{result.groups.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a2e6e", fontFamily: "'DM Sans',sans-serif" }}>{result.residentName}</span>
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>· ID: {result.residentId}</span>
                  {result.location && result.location !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}>· {result.location}</span>}
                  {result.admissionDate && <span style={{ fontSize: "11px", color: "#6b7280" }}>· DOA: {result.admissionDate}</span>}
                </div>
                {/* Each flagged vital type */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result.groups.map((group, gi) => (
                    <div key={gi} style={{ borderRadius: "10px", border: "1px solid rgba(201,168,76,0.2)", overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {group.vitalType}:{" "}
                        </span>
                        <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif" }}>{group.thresholdText}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 12px" }}>
                        {group.entries.map((entry, ei) => (
                          <div key={ei} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "rgba(26,46,110,0.7)", borderRadius: "4px", padding: "1px 6px", flexShrink: 0, marginTop: "1px" }}>#{ei+1}</span>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", fontFamily: "'DM Sans',sans-serif" }}>{entry.dateTime} — {entry.value}</span>
                              <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>{entry.reason}</span>
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
          ) : (
          <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {categorized.map((category, ci) => {
              const totalEntries = category.residents.reduce((s, r) => s + r.entries.length, 0)
              return (
                <div key={ci} style={{ borderLeft: "2px solid rgba(201,168,76,0.4)", borderRadius: "0 12px 12px 0", padding: "14px 16px", background: "rgba(26,46,110,0.02)" }}>
                  {/* Category header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", borderRadius: "6px", padding: "2px 8px" }}>
                      {category.residents.length} resident{category.residents.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a2e6e", fontFamily: "'DM Sans',sans-serif" }}>{category.vitalType}</span>
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>· {totalEntries} reading{totalEntries !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif", marginBottom: "10px" }}>{category.thresholdText}</div>
                  {/* Each resident under this exception type */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {category.residents.map((resident, ri) => (
                      <div key={ri} style={{ borderRadius: "10px", border: "1px solid rgba(201,168,76,0.2)", overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: "rgba(201,168,76,0.08)", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a2e6e", fontFamily: "'DM Sans',sans-serif" }}>{resident.residentName}</span>
                          <span style={{ fontSize: "11px", color: "#6b7280" }}> · ID: {resident.residentId}</span>
                          {resident.location && resident.location !== "N/A" && <span style={{ fontSize: "11px", color: "#6b7280" }}> · {resident.location}</span>}
                          {resident.admissionDate && <span style={{ fontSize: "11px", color: "#6b7280" }}> · DOA: {resident.admissionDate}</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "8px 12px" }}>
                          {resident.entries.map((entry, ei) => (
                            <div key={ei} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                              <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "rgba(26,46,110,0.7)", borderRadius: "4px", padding: "1px 6px", flexShrink: 0, marginTop: "1px" }}>#{ei+1}</span>
                              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <span style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", fontFamily: "'DM Sans',sans-serif" }}>{entry.dateTime} — {entry.value}</span>
                                <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'DM Sans',sans-serif", lineHeight: 1.5 }}>{entry.reason}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          )}
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
              <p style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "16px", color: "#374151", marginBottom: "4px" }}>No vital exceptions found</p>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "13px", color: "#9ca3af" }}>No residents had vital sign readings outside the expected range in the uploaded file.</p>
            </div>
          </div>
        </SCard>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}