"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Search, Download, CheckCircle2, AlertCircle } from "lucide-react"
import { MultiSelect } from "./multi-select"

const DEFAULT_KEYWORDS = [
  "HIT",
  "ALLEG",
  "ABUSE",
  "ALTERCATION",
  "CONCERN",
  "CONFLICT",
  "SUICIDE",
  "1:1",
  "15 MIN",
  "HOURLY",
  "ONE ON ONE",
  "WANDER",
  "ELOPEMENT",
  "EXIT",
  "LEAVE",
  "PACK",
  "GO OUT",
  "BRUIS",
  "SWEL",
  "SWOLL",
  "DISCOLOR",
  "SEX",
  "FOOD",
  "LOS",
  "LOST",
  "LOOK",
  "FIND",
  "MISSING",
  "SEARCH",
  "SPIL",
  "GRIEV",
  "ROOMMATE",
  "DENTURE",
  "SMOK",
  "NARCAN",
  "FIRE",
  "BURN",
  "HURT",
  "MONEY",
  "STOLE",
  "911",
  "MPD",
  "OMBUDSMAN",
  "APS",
  "POLICE",
  "CHOKE",
  "PUNCH",
  "CIGARETTE",
  "LIGHTER",
  "SECURITY",
  // "ERROR",
  // "CODE",
  // "CHANGE",
  // "INJURY",
]

interface SearchResult {
  paragraph: string
  pageNumber: number
  residentName: string
  location: string
  admissionDate: string
  matchedKeywords: string[]
}

interface FileUploadSectionProps {
  userRole?: string | null
}

export function FileUploadSection({ userRole }: FileUploadSectionProps) {
  const [keywords] = useState<string[]>(DEFAULT_KEYWORDS)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(DEFAULT_KEYWORDS) // ✅ all selected by default
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string>("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string>("")

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      setSearchResults([])
      setUploadStatus("idle")
      setErrorMessage("")
      setUploadedFileName("")
    }
  }

  const handleSearch = async () => {
    if (!uploadedFile || selectedKeywords.length === 0) {
      setErrorMessage("Please upload a file and select keywords first")
      setUploadStatus("error")
      return
    }

    setIsSearching(true)
    setIsUploading(true)
    setUploadStatus("idle")
    setErrorMessage("")

    try {
      console.log("[v0] Starting client-side PDF parsing")
      const pdfjsLib = await import("pdfjs-dist")

      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString()

      const arrayBuffer = await uploadedFile.arrayBuffer()

      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
      }).promise
      console.log("[v0] PDF has", pdf.numPages, "pages")

      let extractedText = ""
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(" ")
        extractedText += pageText + "\n"
      }

      console.log("[v0] Extracted text length:", extractedText.length)

      // ✅ No blob upload — send extracted text directly in the request body
      setUploadedFileName(uploadedFile.name)
      setIsUploading(false)

      console.log("[v0] Sending extracted text directly to search API...")
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedText,
          numPages: pdf.numPages,
          fileName: uploadedFile.name,
          keywords: selectedKeywords,
        }),
      })

      const contentType = response.headers.get("content-type")

      if (!response.ok) {
        let errorMessage = "Search failed"

        if (contentType?.includes("application/json")) {
          try {
            const errorData = await response.json()
            errorMessage = errorData.details || errorData.error || errorMessage
          } catch {
            errorMessage = `Search failed with status ${response.status}`
          }
        } else {
          const responseText = await response.text()
          if (responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
            errorMessage = `Server error occurred (status ${response.status}). The PDF may be corrupt or in an unsupported format.`
          } else {
            errorMessage = responseText.substring(0, 200)
          }
        }
        throw new Error(errorMessage)
      }

      if (!contentType?.includes("application/json")) {
        throw new Error("Server returned invalid response format. Please try again.")
      }

      const data = await response.json()
      console.log("[v0] Search API returned:", data)
      console.log("[v0] Number of results:", data.results?.length || 0)
      if (data.results && data.results.length > 0) {
        console.log("[v0] First result sample:", {
          residentName: data.results[0].residentName,
          location: data.results[0].location,
          admissionDate: data.results[0].admissionDate,
          effectiveDate: data.results[0].effectiveDate,
          paragraphLength: data.results[0].paragraph?.length || 0,
          matchedKeywords: data.results[0].matchedKeywords,
        })
      }
      setSearchResults(data.results || [])
      setUploadStatus("success")
      setErrorMessage("")
    } catch (error) {
      console.error("[v0] Search error:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to search file")
      setUploadStatus("error")
    } finally {
      setIsSearching(false)
      setIsUploading(false)
    }
  }

  const handleExport = async () => {
    if (searchResults.length === 0) return

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          results: searchResults,
          fileName: uploadedFileName,
        }),
      })

      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const fileName = `${uploadedFileName.replace(".pdf", "")}-results-${Date.now()}.docx`

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

    } catch (error) {
      console.error("[v0] Export error:", error)
      alert("An error occurred during export. Please try again.")
    }
  }

  const totalMatches = searchResults.length

  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords || keywords.length === 0) return text

    // Escape special regex characters in keywords
    const escapedKeywords = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const regexPattern = `(${escapedKeywords.join("|")})`
    const regex = new RegExp(regexPattern, "gi")

    const parts = text.split(regex)

    return (
      <>
        {parts.map((part, i) => {
          // Check if this part matches any keyword (case-insensitive exact match)
          const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase())

          if (isMatch) {
            return (
              <mark key={i} className="bg-yellow-300 px-0.5 rounded">
                {part}
              </mark>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"20px",fontWeight:400,color:"#111827"}}>Upload PDF File</CardTitle>
          <CardDescription style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af"}}>Select a PDF file to search for keywords and extract paragraphs. Supports files up to 5 TB in production.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="file-upload" style={{fontFamily:"'DM Sans',sans-serif",fontSize:"11px",fontWeight:700,color:"#374151",letterSpacing:"0.05em",textTransform:"uppercase"}}>PDF File</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="cursor-pointer"
                disabled={isUploading}
              />
              {uploadedFile && (
                <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
                  <CheckCircle2 className="size-3.5" />
                  {uploadedFile.name}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Keyword selection only visible to IT role */}
      {userRole?.toLowerCase() === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"20px",fontWeight:400,color:"#111827"}}>Select Keywords</CardTitle>
            <CardDescription style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af"}}>Choose keywords to search — the entire paragraph containing each keyword will be extracted</CardDescription>
          </CardHeader>
          <CardContent>
            <MultiSelect options={keywords} selected={selectedKeywords} onChange={setSelectedKeywords} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-6">
        <div>
          <h3 style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"19px",fontWeight:400,color:"#111827"}}>Ready to Search</h3>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af",marginTop:"3px"}}>{uploadedFile ? `File: ${uploadedFile.name}` : "No file uploaded"} • {selectedKeywords.length} keyword{selectedKeywords.length !== 1 ? "s" : ""} selected</p>
          {uploadStatus === "error" && errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!uploadedFile || selectedKeywords.length === 0 || isSearching}
          style={{ fontFamily:"'DM Sans',sans-serif", background: "linear-gradient(135deg, #1a2e6e, #4c1d95)", boxShadow: "0 4px 20px rgba(26,46,110,0.3)", display:"flex", alignItems:"center", gap:"8px", borderRadius:"12px", padding:"10px 28px", fontSize:"13px", fontWeight:700, color:"#fff", border:"none", cursor:"pointer", transition:"all .2s" }}
        >
          {isUploading ? (
            <>Uploading...</>
          ) : isSearching ? (
            <>Processing...</>
          ) : (
            <>
              <Search className="size-4" />
              Search Document
            </>
          )}
        </button>
      </div>

      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"20px",fontWeight:400,color:"#111827"}}>Search Results</CardTitle>
                <CardDescription style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af"}}>Found {totalMatches} paragraph{totalMatches !== 1 ? "s" : ""} containing selected keywords</CardDescription>
              </div>
              <button
                type="button"
                onClick={handleExport}
                style={{ fontFamily:"'DM Sans',sans-serif", background: "linear-gradient(135deg, #1a2e6e, #4c1d95)", boxShadow: "0 4px 20px rgba(26,46,110,0.3)", display:"flex", alignItems:"center", gap:"8px", borderRadius:"12px", padding:"10px 28px", fontSize:"13px", fontWeight:700, color:"#fff", border:"none", cursor:"pointer", transition:"all .2s" }}
              >
                <Download className="size-4" />
                Export to Word
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {searchResults.map((result, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                <div style={{display:"flex",alignItems:"center",gap:"6px",fontFamily:"'DM Sans',sans-serif",fontSize:"11px",color:"#9ca3af"}}>
                  <span className="font-medium">Page: {result.pageNumber}</span>
                  <span>•</span>
                  <span>Resident: {result.residentName}</span>
                  <span>•</span>
                  <span>Location: {result.location}</span>
                  <span>•</span>
                  <span>Admission: {result.admissionDate}</span>
                </div>
                <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#374151",lineHeight:1.65}}>
                  {highlightKeywords(result.paragraph, result.matchedKeywords)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {uploadStatus === "success" && searchResults.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="mb-3 size-12 text-muted-foreground" />
              <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"14px",color:"#9ca3af"}}>No matches found for the selected keywords</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}