import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

interface SearchBody {
  extractedText?: string
  extractedTextUrl?: string
  numPages: number
  fileName?: string
  keywords: string[]
}

interface SearchResult {
  paragraph: string
  pageNumber: number
  residentName: string
  orderStatus: string
  matchedKeywords: string[]
  location: string
  admissionDate: string
  effectiveDate: string
}

interface OrderRow {
  residentName: string
  orderSummary: string
  orderStatus: string
  textPosition: number
  pageNumber: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("[order] Order Listing Search API called")

    const body: SearchBody = await request.json()
    const { extractedText, extractedTextUrl, numPages, fileName, keywords } = body

    if ((!extractedText && !extractedTextUrl) || !keywords || keywords.length === 0) {
      return NextResponse.json({ error: "Missing extractedText or keywords" }, { status: 400 })
    }
    if (!numPages || numPages <= 0) {
      return NextResponse.json({ error: "Invalid numPages value" }, { status: 400 })
    }

    let textToSearch: string
    if (extractedTextUrl) {
      const textResponse = await fetch(extractedTextUrl, { signal: AbortSignal.timeout(30000) })
      if (!textResponse.ok) throw new Error(`Failed to fetch text: ${textResponse.status}`)
      textToSearch = await textResponse.text()
    } else {
      textToSearch = extractedText!
    }

    console.log("[order] Text length:", textToSearch.length)

    // ── Diagnostic: log first 2000 chars and line count to understand pdfjs output shape
    const allLines = textToSearch.split(/\n/)
    console.log("[order] Total lines:", allLines.length)
    console.log("[order] First 2000 chars of extracted text:")
    console.log(textToSearch.substring(0, 2000))
    console.log("[order] Line lengths (first 40):", allLines.slice(0, 40).map((l, i) => `L${i}(${l.length}): ${l.substring(0, 120)}`))

    const rows = parseOrderListingRows(textToSearch, numPages)
    console.log("[order] Parsed", rows.length, "order rows")
    if (rows.length > 0) {
      console.log("[order] Sample rows (first 3):", rows.slice(0, 3).map(r => ({
        residentName: r.residentName,
        orderStatus: r.orderStatus,
        summaryPreview: r.orderSummary.substring(0, 80),
      })))
    }

    const results = searchOrderRows(rows, keywords)
    console.log("[order] Found", results.length, "matches")

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[order] Error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Parser
//
// pdfjs extracts table PDFs in two possible ways:
//
//   MODE A — one long space-separated line per page:
//     "AGWU, ANNE (22406) Follow-up appt... Other Active 06/26/2026 N AGWU, ANNE (22406) HYDROmorphone..."
//
//   MODE B — newline-separated, one chunk per row:
//     "AGWU, ANNE (22406)\nFollow-up appt...\nOther\nActive\n06/26/2026\nN\n"
//
// We handle BOTH by:
//   1. Splitting on newlines to get lines.
//   2. For each line, scanning for resident-name tokens ANYWHERE in the line
//      (not just at ^), using a global regex.
//   3. When a resident token is found mid-line, everything between it and the
//      next resident token (or status word) is the Order Summary.
// ---------------------------------------------------------------------------
function parseOrderListingRows(text: string, numPages: number): OrderRow[] {
  const rows: OrderRow[] = []

  // Resident name pattern: "LASTNAME, FIRSTNAME (NNNNN)"
  // Requires at least 2 uppercase letters before the comma so that single-char
  // supply flags (Y / N) from the previous row cannot be captured as the
  // start of a resident name.
  const residentPattern = /(?<![A-Z])([A-Z]{2,}[A-Z\s,'.-]*,\s*[A-Z][A-Z\s,'.-]+\(\d+\))/g

  // Status values
  const statusPattern = /\b(Active|Completed|Discontinued)\b/i

  // After matching all resident tokens globally across the whole text,
  // slice the text between consecutive tokens to get the order summary block.

  const allMatches = [...text.matchAll(residentPattern)]
  console.log("[order] Resident token matches found:", allMatches.length)
  if (allMatches.length > 0) {
    console.log("[order] First 5 resident tokens:", allMatches.slice(0, 5).map(m => m[0]))
  }

  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i]
    const residentName = match[0].trim()
    const blockStart = match.index! + match[0].length
    const blockEnd = i + 1 < allMatches.length ? allMatches[i + 1].index! : text.length

    const block = text.substring(blockStart, blockEnd)

    // Extract Order Status from the block
    const statusMatch = block.match(statusPattern)
    const orderStatus = statusMatch ? statusMatch[1] : "N/A"

    // Extract Order Summary:
    // Everything before the first status word, stripped of dates and flag chars
    let orderSummary = block
      // Cut off at the status word (and everything after: category, dates, Y/N)
      .replace(/\b(Active|Completed|Discontinued)\b[\s\S]*/i, "")
      // Remove category words that appear before status
      .replace(/\b(Pharmacy|Other|Laboratory|Radiology|Therapy|Dietary|Nursing|Social Work)\b/gi, "")
      // Remove dates
      .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, "")
      // Remove standalone Y/N supply flags
      .replace(/\s+[YN]\s+/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()

    if (orderSummary.length < 5) continue

    const pageNumber = Math.max(
      1,
      Math.min(Math.floor((match.index! / text.length) * numPages) + 1, numPages),
    )

    rows.push({
      residentName,
      orderSummary,
      orderStatus,
      textPosition: match.index!,
      pageNumber,
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function searchOrderRows(rows: OrderRow[], keywords: string[]): SearchResult[] {
  const results: SearchResult[] = []

  const uniqueKeywords = Array.from(new Set(keywords.map((k) => k.toLowerCase()))).map(
    (k) => keywords.find((orig) => orig.toLowerCase() === k)!,
  )

  for (const keyword of uniqueKeywords) {
    const keywordLower = keyword.toLowerCase()

    for (const row of rows) {
      const summaryLower = row.orderSummary.toLowerCase()
      if (!summaryLower.includes(keywordLower)) continue

      const occurrences = findAllOccurrences(summaryLower, keywordLower)
      if (occurrences.length === 0) continue

      console.log(`[order] ✓ "${keyword}" matched for ${row.residentName} (${row.orderStatus})`)

      results.push({
        paragraph: row.orderSummary,
        pageNumber: row.pageNumber,
        residentName: row.residentName,
        orderStatus: row.orderStatus,
        matchedKeywords: [keyword],
        location: "",
        admissionDate: "",
        effectiveDate: "",
      })
    }
  }

  results.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber
    return a.residentName.localeCompare(b.residentName)
  })

  return results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function findAllOccurrences(text: string, keyword: string): Array<{ index: number }> {
  const occurrences: Array<{ index: number }> = []
  let index = 0
  while (index < text.length) {
    const found = text.indexOf(keyword, index)
    if (found === -1) break
    if (isValidKeywordMatch(text, keyword, found)) occurrences.push({ index: found })
    index = found + 1
  }
  return occurrences
}

function isValidKeywordMatch(text: string, keyword: string, matchIndex: number): boolean {
  const keywordLower = keyword.toLowerCase()
  if (matchIndex > 0) {
    const charBefore = text[matchIndex - 1]
    const isAlphanumeric = /^[a-z0-9]+$/i.test(keywordLower)
    const isSpecial = /[^a-z0-9]/i.test(keywordLower)
    if (isAlphanumeric && /[a-zA-Z0-9]/.test(charBefore)) return false
    if (isSpecial && /[a-zA-Z0-9]/.test(charBefore)) return false
  }
  if (keywordLower === "1:1") {
    const charAfter = text[matchIndex + keyword.length]
    if (charAfter !== undefined && /[0-9]/.test(charAfter)) return false
  }
  return true
}