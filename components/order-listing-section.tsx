"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Search, Download, CheckCircle2, AlertCircle } from "lucide-react"
import { MultiSelect } from "./multi-select"

const DEFAULT_KEYWORDS = [
  "RAY",
  "CXR",
  "ULTRA",
  "DOP",
  "EKG",
  "SOD",
  "SAL",
  "NOR",
  "DEX",
  "CHL",
  "TRANS",
  "SEND",
  "WANDER",
  "ELOP",
  "SUI",
  "1:1",
  "15 MIN",
  "15MIN",
  "HOURLY",
  "ONE ON ONE",
  "BRUIS",
  "SWEL",
  "SWOLL",
  "FALL",
  "FRACT",
  "PAIN",
  "FULL",
  "DNR",
  "SMOK"
]

interface SearchResult {
  paragraph: string
  pageNumber: number
  residentName: string
  orderStatus: string
  matchedKeywords: string[]
}

interface OrderListingSectionProps {
  userRole?: string | null
}

export function OrderListingSection({ userRole }: OrderListingSectionProps) {
  const [keywords] = useState<string[]>(DEFAULT_KEYWORDS)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(DEFAULT_KEYWORDS)
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
      console.log("[order] Starting client-side PDF parsing")
      const pdfjsLib = await import("pdfjs-dist")

      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString()

      const arrayBuffer = await uploadedFile.arrayBuffer()

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      console.log("[order] PDF has", pdf.numPages, "pages")

      let extractedText = ""
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(" ")
        extractedText += pageText + "\n"
      }

      console.log("[order] Extracted text length:", extractedText.length)

      setUploadedFileName(uploadedFile.name)
      setIsUploading(false)

      console.log("[order] Sending extracted text to order-search API...")
      const response = await fetch("/api/order-search", {
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
      console.log("[order] API returned:", data)
      console.log("[order] Number of results:", data.results?.length || 0)
      setSearchResults(data.results || [])
      setUploadStatus("success")
      setErrorMessage("")
    } catch (error) {
      console.error("[order] Search error:", error)
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
      const response = await fetch("/api/order-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: searchResults,
          fileName: uploadedFileName,
        }),
      })

      if (!response.ok) throw new Error("Export failed")

      const blob = await response.blob()
      const fileName = `${uploadedFileName.replace(".pdf", "")}-order-results-${Date.now()}.docx`

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("[order] Export error:", error)
      alert("An error occurred during export. Please try again.")
    }
  }

  const totalMatches = searchResults.length

  const highlightKeywords = (text: string, keywords: string[]) => {
    if (!keywords || keywords.length === 0) return text

    const escapedKeywords = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const regexPattern = `(${escapedKeywords.join("|")})`
    const regex = new RegExp(regexPattern, "gi")
    const parts = text.split(regex)

    return (
      <>
        {parts.map((part, i) => {
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
      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"20px",fontWeight:400,color:"#111827"}}>Upload PDF File</CardTitle>
          <CardDescription style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af"}}>Select an Order Listing PDF to search for keywords and extract matching paragraphs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="order-file-upload" style={{fontFamily:"'DM Sans',sans-serif",fontSize:"11px",fontWeight:700,color:"#374151",letterSpacing:"0.05em",textTransform:"uppercase"}}>PDF File</Label>
            <div className="flex items-center gap-4">
              <Input
                id="order-file-upload"
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

      {/* Keyword selection — admin only */}
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

      {/* Action bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-6">
        <div>
          <h3 style={{fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"19px",fontWeight:400,color:"#111827"}}>Ready to Search</h3>
          <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#9ca3af",marginTop:"3px"}}>
            {uploadedFile ? `File: ${uploadedFile.name}` : "No file uploaded"} • {selectedKeywords.length} keyword{selectedKeywords.length !== 1 ? "s" : ""} selected
          </p>
          {uploadStatus === "error" && errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!uploadedFile || selectedKeywords.length === 0 || isSearching}
          style={{ fontFamily:"'DM Sans',sans-serif", background:"linear-gradient(135deg, #1a2e6e, #4c1d95)", boxShadow:"0 4px 20px rgba(26,46,110,0.3)", display:"flex", alignItems:"center", gap:"8px", borderRadius:"12px", padding:"10px 28px", fontSize:"13px", fontWeight:700, color:"#fff", border:"none", cursor:"pointer", transition:"all .2s" }}
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

      {/* Results */}
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
                style={{ fontFamily:"'DM Sans',sans-serif", background:"linear-gradient(135deg, #1a2e6e, #4c1d95)", boxShadow:"0 4px 20px rgba(26,46,110,0.3)", display:"flex", alignItems:"center", gap:"8px", borderRadius:"12px", padding:"10px 28px", fontSize:"13px", fontWeight:700, color:"#fff", border:"none", cursor:"pointer", transition:"all .2s" }}
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
                  <span style={{
                    fontWeight:700,
                    color: result.orderStatus === "Active" ? "#15803d" :
                           result.orderStatus === "Discontinued" ? "#b91c1c" : "#6b7280"
                  }}>
                    {result.orderStatus || "N/A"}
                  </span>
                </div>
                <p style={{fontFamily:"'DM Sans',sans-serif",fontSize:"13px",color:"#374151",lineHeight:1.65}}>
                  {highlightKeywords(result.paragraph, result.matchedKeywords)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No results */}
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