import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

interface MedicationEntry {
  effectiveDate: string
  noteText: string
}

interface MedicationGroup {
  duplicateNoteText: string
  entries: MedicationEntry[]
}

interface MedicationResult {
  residentName: string
  location: string
  admissionDate: string
  groups: MedicationGroup[]  // one per repeated medication
}

interface NoteBlock {
  residentName: string
  location: string
  admissionDate: string
  effectiveDate: string
  type: string
  noteText: string
  textPosition: number
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { extractedText } = body

    if (!extractedText) {
      return NextResponse.json({ error: "No extracted text provided" }, { status: 400 })
    }

    const blocks = parsePDFIntoBlocks(extractedText)
    console.log("[medication] Total blocks parsed: " + blocks.length)

    const eMarBlocks = blocks.filter(b =>
      /default\s+pn\s+type\s+for\s+emar/i.test(b.type)
    )
    console.log("[medication] eMAR blocks: " + eMarBlocks.length)

    const groupMap = new Map<string, {
      residentName: string
      location: string
      admissionDate: string
      noteText: string
      entries: MedicationEntry[]
    }>()

    for (const block of eMarBlocks) {
      const normalizedNote = normalizeNoteText(block.noteText)
      if (!normalizedNote || normalizedNote.length < 20) continue
      const hasMedContent = /tablet|capsule|mg|ml|medication|dose|oral|injection|cream|patch|solution|syrup|insulin|infusion/i.test(normalizedNote)
      if (!hasMedContent) continue

      // --- Exclude sliding scale notes ---
      // Sliding scale entries are protocol-driven (not true duplicates) and should be filtered out.
      const isSlidingScale = /sliding\s+scale/i.test(normalizedNote)
      if (isSlidingScale) continue

      // --- Exclude "as needed" (PRN) notes ---
      // "As needed" medication entries are given on-demand and are not true duplicates.
      const isAsNeeded = /\bas\s+needed\b/i.test(normalizedNote)
      if (isAsNeeded) continue

      const noteKey = normalizedNote.substring(0, 80)
      const resKey = block.residentName === "N/A" ? "unknown" : block.residentName
      const key = resKey + "|||" + noteKey

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          residentName: block.residentName,
          location: block.location,
          admissionDate: block.admissionDate,
          noteText: block.noteText,
          entries: [],
        })
      } else {
        const existing = groupMap.get(key)!
        if (existing.residentName === "N/A" && block.residentName !== "N/A") {
          existing.residentName = block.residentName
          existing.location = block.location
          existing.admissionDate = block.admissionDate
        }
      }

      groupMap.get(key)!.entries.push({
        effectiveDate: block.effectiveDate,
        noteText: block.noteText,
      })
    }

    // ── 3-hour cluster filter + merge by resident ────────────────────────
    const THREE_HOURS = 3 * 60 * 60 * 1000

    // Merge all medication groups per resident
    const residentMap = new Map<string, MedicationResult>()

    for (const g of groupMap.values()) {
      // Apply 3-hour cluster filter
      const withTs = g.entries.map(e => ({ ...e, ts: parseEffectiveDate(e.effectiveDate) }))
      const clustered = new Set<number>()
      for (let i = 0; i < withTs.length; i++) {
        for (let j = 0; j < withTs.length; j++) {
          if (i === j) continue
          if (withTs[i].ts === null || withTs[j].ts === null) continue
          if (Math.abs(withTs[i].ts! - withTs[j].ts!) <= THREE_HOURS) {
            clustered.add(i); clustered.add(j)
          }
        }
      }
      const filteredEntries = g.entries.filter((_, idx) => !clustered.has(idx))

      // Only include this medication group if it still has >1 entry
      if (filteredEntries.length <= 1) continue

      const resKey = g.residentName === "N/A" ? "unknown" : g.residentName

      if (!residentMap.has(resKey)) {
        residentMap.set(resKey, {
          residentName: g.residentName,
          location: g.location,
          admissionDate: g.admissionDate,
          groups: [],
        })
      }

      residentMap.get(resKey)!.groups.push({
        duplicateNoteText: g.noteText,
        entries: filteredEntries,
      })
    }

    const results: MedicationResult[] = Array.from(residentMap.values())

    console.log("[medication] Residents after filter: " + results.length)
    results.forEach(r => {
      console.log("  - " + r.residentName + ": " + r.groups.length + " medication(s)")
    })

    return NextResponse.json({ results, totalMatches: results.length })

  } catch (error: any) {
    console.error("[medication] Error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

function parseEffectiveDate(dateStr: string): number | null {
  // Format: "05/08/2026 22:24"
  if (!dateStr) return null
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  const [, month, day, year, hour, minute] = match
  return new Date(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(minute)
  ).getTime()
}

function normalizeNoteText(text: string): string {
  let t = text
  // Strip "Administration was:" suffix and everything after
  const adminIdx = t.search(/Administration\s+was\s*:/i)
  if (adminIdx > 0) t = t.substring(0, adminIdx)
  // Strip trailing "PRN"
  t = t.replace(/\s+PRN\s*$/i, "")
  return t.replace(/\s+/g, " ").replace(/[^\x20-\x7E]/g, "").trim().toLowerCase()
}
function parsePDFIntoBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  const effectiveDatePattern = /Effective\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/gi
  const effectiveDateMatches = [...text.matchAll(effectiveDatePattern)]

  console.log("[medication] Found " + effectiveDateMatches.length + " Effective Date markers")

  let lastEffectiveDate = ""
  let lastType = ""

  for (let i = 0; i < effectiveDateMatches.length; i++) {
    const match = effectiveDateMatches[i]
    const effectiveDatePos = match.index!
    const effectiveDate = match[1]

    const nextSectionStart = i < effectiveDateMatches.length - 1
      ? effectiveDateMatches[i + 1].index!
      : text.length

    const rawSection = text.substring(effectiveDatePos, nextSectionStart)

    const typeMatchNoteText = rawSection.match(/Type:\s*([\s\S]+?Note\s+Text)\s*:/i)
    const typeMatchGeneral = rawSection.match(/Type:\s*(.+?)(?=\n|\r|Author:|Signature:|\s{3,}|$)/i)
    const typeRaw = typeMatchNoteText
      ? typeMatchNoteText[1].trim()
      : typeMatchGeneral ? typeMatchGeneral[1].trim() : ""
    const type = typeRaw || lastType

    if (effectiveDate) lastEffectiveDate = effectiveDate
    if (type) lastType = type

    if (!/default\s+pn\s+type\s+for\s+emar/i.test(type)) continue

    const noteTextMatch = rawSection.match(/Note\s+Text\s*:\s*([\s\S]+?)(?:\s*Author\s*:|Signature:|Page\s+\d+\s+of\s+\d+|$)/i)
    let noteText = noteTextMatch
      ? noteTextMatch[1].replace(/\s+/g, " ").trim()
      : ""

    // Fallback: no "Note Text:" label in PDF — grab content directly after the Type line
    if (!noteText || noteText.length < 5) {
      const fallbackMatch = rawSection.match(
        /Type:\s*Default\s+PN\s+Type\s+for\s+eMAR\s*([\s\S]+?)(?:Author\s*:|Signature:|Page\s+\d+\s+of\s+\d+|$)/i
      )
      if (fallbackMatch) {
        noteText = fallbackMatch[1].replace(/\s+/g, " ").trim()
      }
    }

    if (!noteText || noteText.length < 5) continue

    const residentName = extractResidentName(text, effectiveDatePos, rawSection)
    const location = extractLocation(text, effectiveDatePos)
    const admissionDate = extractAdmissionDate(text, effectiveDatePos)

    blocks.push({
      residentName,
      location,
      admissionDate,
      effectiveDate,
      type,
      noteText,
      textPosition: effectiveDatePos,
    })
  }

  return blocks
}

function extractResidentName(fullText: string, currentPos: number, sectionText: string): string {
  const searchStart = Math.max(0, currentPos - 20000)
  const textBefore = fullText.substring(searchStart, currentPos)

  // Exact format from PDF: "Name :   BARNES, ABC (22405)   Location :"
  // Use a greedy match up to "Location" or "Admission" anchor
  const idx = textBefore.lastIndexOf("Name :")
  if (idx >= 0) {
    const after = textBefore.substring(idx + 6).trimStart()
    // Find end anchor - multiple spaces before Location or Admission
    const endMatch = after.match(/^(.+?)\s{2,}(?:Location|Admission)/i)
    if (endMatch) {
      const name = endMatch[1].trim()
      if (name.length > 1) return name
    }
    // Fallback - take up to 60 chars
    const shortMatch = after.match(/^(.{3,60?}?)\s{3,}/)
    if (shortMatch) {
      const name = shortMatch[1].trim()
      if (name.length > 1) return name
    }
  }

  // Try without space before colon
  const idx2 = textBefore.lastIndexOf("Name:")
  if (idx2 >= 0) {
    const after = textBefore.substring(idx2 + 5).trimStart()
    const endMatch = after.match(/^(.+?)\s{2,}(?:Location|Admission)/i)
    if (endMatch) {
      const name = endMatch[1].trim()
      if (name.length > 1) return name
    }
  }

  // Footer fallback: "SMITH, JOHN - Page X of Y"
  const fp = /([A-Z][A-Z\s,]+[A-Z])\s+-\s+Page\s+\d+\s+of\s+\d+/g
  const fm = [...textBefore.matchAll(fp)]
  if (fm.length > 0) return fm[fm.length-1][1].trim()

  return "N/A"
}

function extractLocation(fullText: string, currentPos: number): string {
  const searchStart = Math.max(0, currentPos - 20000)
  const textBefore = fullText.substring(searchStart, currentPos)

  // Exact format: "Location :   2N 203 B   Admission Date :"
  const p = /Location\s*:\s+([A-Za-z0-9\s\-\/]+?)\s{2,}(?:Admission|DOB)/gi
  const m = [...textBefore.matchAll(p)]
  if (m.length > 0) {
    const loc = m[m.length-1][1].trim()
    return loc === "-" || loc.length === 0 ? "N/A" : loc
  }
  return "N/A"
}

function extractAdmissionDate(fullText: string, currentPos: number): string {
  const searchStart = Math.max(0, currentPos - 20000)
  const textBefore = fullText.substring(searchStart, currentPos)

  // Exact format: "Admission Date :  05/01/2026" or "Admission Date : 05/01/2026"
  const p = /Admission\s+Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
  const m = [...textBefore.matchAll(p)]
  if (m.length > 0) return m[m.length-1][1]
  return "N/A"
}