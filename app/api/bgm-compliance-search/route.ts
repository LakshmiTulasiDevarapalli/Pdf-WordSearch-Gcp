import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
interface BGMEntry {
  effectiveDate: string
  noteText: string
}

interface BGMGroup {
  duplicateNoteText: string
  entries: BGMEntry[]
}

interface BGMComplianceResult {
  residentName: string
  location: string
  admissionDate: string
  groups: BGMGroup[]
}

// ── Internal parsing shapes ──
interface DiagnosisEntry {
  diagnosisText: string
  code: string
  date: string
  rank: string
  classification: string
}

interface DiagnosisResident {
  residentName: string
  residentId: string
  location: string
  diagnoses: DiagnosisEntry[]
}

interface BGMResident {
  residentName: string
  residentId: string
  location: string
  readingCount: number
  mostRecentReading: string | null
}

// Normalizes a "LASTNAME, FIRSTNAME" string into a stable lookup key —
// case/spacing differences between the two PDFs shouldn't cause a miss.
function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { diagnosisText, bloodSugarText } = body as {
      diagnosisText?: string
      bloodSugarText?: string
    }

    if (!diagnosisText || !bloodSugarText) {
      return NextResponse.json(
        { error: "Both diagnosisText and bloodSugarText are required" },
        { status: 400 }
      )
    }

    const diagnosisResidents = parseDiagnosisPDF(diagnosisText)
    console.log("[bgm-compliance] Diagnosis residents parsed: " + diagnosisResidents.length)
    diagnosisResidents.forEach((r) =>
      console.log("  - " + r.residentName + " (" + r.residentId + "): " + r.diagnoses.length + " diabetes diagnosis row(s)")
    )

    const bgmResidents = parseBloodSugarPDF(bloodSugarText)
    console.log("[bgm-compliance] Blood sugar residents parsed: " + bgmResidents.size)
    bgmResidents.forEach((r) =>
      console.log("  - " + r.residentName + ": " + r.readingCount + " reading(s)")
    )

    const results: BGMComplianceResult[] = []

    for (const resident of diagnosisResidents) {
      // Skip residents where we couldn't actually capture any diagnosis rows
      if (resident.diagnoses.length === 0) continue

      const bgm = bgmResidents.get(normalizeName(resident.residentName))
      const hasReadings = !!bgm && bgm.readingCount > 0

      // Compliant: resident has a diabetes diagnosis AND has BGM readings on file
      if (hasReadings) continue

      results.push({
        residentName: resident.residentName + " (" + resident.residentId + ")",
        location: resident.location || "N/A",
        admissionDate: bgm
          ? "Found in BGM report — 0 readings recorded"
          : "Not found in BGM report",
        groups: [
          {
            duplicateNoteText: bgm
              ? "Resident appears in the Blood Sugar report but has no recorded BGM readings."
              : "No Blood Glucose Monitor (BGM) readings found for this resident despite an active diabetes diagnosis.",
            entries: resident.diagnoses.map((d) => ({
              effectiveDate: d.date,
              noteText:
                d.diagnosisText +
                " — " +
                d.rank +
                (d.classification ? " · " + d.classification : ""),
            })),
          },
        ],
      })
    }

    console.log("[bgm-compliance] Non-compliant residents: " + results.length)

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[bgm-compliance] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Diagnosis PDF parsing
//
// Expected shape (per resident block, rendered as a shaded header row followed
// by one or more diagnosis rows):
//
//   BROWN, DARRYL (9367) - Unit 5 517 B
//   TYPE 2 DIABETES MELLITUS WITH DIABETIC CHRONIC KIDNEY DISEASE (E11.22)   12/04/2024   Dx 4   Admission
//
// pdfjs joins text items with single spaces, so column gaps collapse to single
// spaces — we anchor on the resident-header pattern and the diabetes ICD-10
// code pattern (E08.x - E11.x) rather than relying on whitespace/columns.
// ────────────────────────────────────────────────────────────────────────────
function parseDiagnosisPDF(text: string): DiagnosisResident[] {
  const residents: DiagnosisResident[] = []

  // "LASTNAME, FIRSTNAME (12345) - " — note: what follows the dash varies.
  // It can be a unit/room ("Unit 5 517 B") or a status word ("Discharged",
  // "Active", "Deceased", etc). We don't anchor on "Unit" specifically —
  // anything after the dash up to the first diagnosis is captured as-is.
  const headerPattern =
    /([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*)\s*\((\d{3,7})\)\s*-\s*/g
  const headerMatches = [...text.matchAll(headerPattern)]

  // Diagnosis text ending in a diabetes ICD-10 code, followed by a date, then
  // whatever rank/classification/comments text trails it. We deliberately
  // don't require an exact "Dx N" rank here — some rows use "Secondary",
  // "Primary", etc — and split that out afterward instead of baking it into
  // the regex, since a too-strict match here is what silently drops rows.
  const diagPattern =
    /([A-Z0-9][A-Z0-9\/,\-.()\s]{4,}?\((E0[89]|E1[01])[.\dX]*\))\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Za-z][A-Za-z0-9,.\/\s]*?)(?=\s+[A-Z0-9][A-Z0-9\/,\-.()\s]{4,}?\([A-Z]\d{2}[.\dX ]*\)|\s+[A-Z][A-Za-z'\-]+,\s*[A-Z][A-Za-z'\-]+\s*\(\d{3,7}\)|$)/g
  const diagMatches = [...text.matchAll(diagPattern)]

  // First token of the trailing text is the rank ("Dx 4", "Secondary", "Primary");
  // anything after that is classification/comments.
  const splitRankPattern = /^(Dx\s*\d+|Secondary|Primary)\s*(.*)$/i

  for (let i = 0; i < headerMatches.length; i++) {
    const h = headerMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < headerMatches.length - 1 ? headerMatches[i + 1].index! : text.length

    const lastName = h[1].trim()
    const firstName = h[2].trim()
    const residentId = h[3].trim()

    // Diagnoses that start within this resident's slice of text
    const ownDiagnoses = diagMatches.filter(
      (d) => d.index! >= headerEnd && d.index! < nextHeaderStart
    )

    // Location/status = whatever sits between the header and the first diagnosis
    // (e.g. "5 517 B" for an active resident, or "Discharged" for a discharged one).
    // Strip a trailing "Continued..." pagination marker if the block spans pages.
    const locationEnd = ownDiagnoses.length > 0 ? ownDiagnoses[0].index! : nextHeaderStart
    const location = text
      .substring(headerEnd, locationEnd)
      .replace(/Continued\s*\.*\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim()

    residents.push({
      residentName: lastName + ", " + firstName,
      residentId,
      location: location || "N/A",
      diagnoses: ownDiagnoses.map((d) => {
        const trailing = d[4].replace(/\s+/g, " ").trim()
        const split = trailing.match(splitRankPattern)
        return {
          diagnosisText: d[1].replace(/\s+/g, " ").trim(),
          code: d[2],
          date: d[3],
          rank: split ? split[1].trim() : "N/A",
          classification: split ? split[2].trim() : trailing,
        }
      }),
    })
  }

  return residents
}

// ────────────────────────────────────────────────────────────────────────────
// Blood Sugar PDF parsing
//
// This file can come in two different shapes, so we check for both and merge
// whatever each one finds:
//
// FORMAT A — bulk, multi-resident table:
//   ARTIS, GENE (9607)   Location: Unit 1 103 A, Height: 66 Inches, DOA: 09/02/2025
//   Blood Sugar Summary
//   07/09/2026 08:33  79 mg/dL
//   07/06/2026 10:27  112 mg/dL
//   ...
//
// FORMAT B — per-resident quick report (one resident, possibly one per page):
//   Resident: RAIFORD, LAVERNE MERCEDES (5888)   Vital: Blood Sugar   Effective Date Range: 07/01/2026 - 07/05/2026
//   No data found
//   -- or, if readings exist --
//   07/02/2026 08:15  95 mg/dL
// ────────────────────────────────────────────────────────────────────────────
function parseBloodSugarPDF(text: string): Map<string, BGMResident> {
  const map = new Map<string, BGMResident>()
  const readingPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(\d{1,3}(?:\.\d+)?)\s*mg\/dL/g

  // FORMAT A: "LASTNAME, FIRSTNAME (12345)   Location: Unit 1 103 A, Height:"
  const bulkHeaderPattern =
    /([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*)\s*\((\d{3,7})\)\s*Location:\s*([^,]+),\s*Height:/g
  const bulkHeaderMatches = [...text.matchAll(bulkHeaderPattern)]

  for (let i = 0; i < bulkHeaderMatches.length; i++) {
    const h = bulkHeaderMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < bulkHeaderMatches.length - 1 ? bulkHeaderMatches[i + 1].index! : text.length
    const segment = text.substring(headerEnd, nextHeaderStart)

    const readings = [...segment.matchAll(readingPattern)]
    const residentId = h[3].trim()
    const nameKey = normalizeName(h[1].trim() + ", " + h[2].trim())

    map.set(nameKey, {
      residentName: h[1].trim() + ", " + h[2].trim(),
      residentId,
      location: h[4].trim(),
      readingCount: readings.length,
      mostRecentReading: readings.length > 0 ? readings[0][1] + " " + readings[0][2] : null,
    })
  }

  // FORMAT B: "Resident: LASTNAME, FIRSTNAME (12345)   Vital: Blood Sugar"
  const perResidentHeaderPattern =
    /Resident:\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*)\s*\((\d{3,7})\)\s*Vital:\s*Blood\s*Sugar/g
  const perResidentMatches = [...text.matchAll(perResidentHeaderPattern)]

  for (let i = 0; i < perResidentMatches.length; i++) {
    const h = perResidentMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < perResidentMatches.length - 1 ? perResidentMatches[i + 1].index! : text.length
    const segment = text.substring(headerEnd, nextHeaderStart)

    const residentId = h[3].trim()
    const nameKey = normalizeName(h[1].trim() + ", " + h[2].trim())
    const noDataFound = /no\s+data\s+found/i.test(segment)
    const readings = noDataFound ? [] : [...segment.matchAll(readingPattern)]

    // Don't let a Format-B match overwrite a richer Format-A entry for the same resident
    if (map.has(nameKey)) continue

    map.set(nameKey, {
      residentName: h[1].trim() + ", " + h[2].trim(),
      residentId,
      location: "N/A",
      readingCount: readings.length,
      mostRecentReading: readings.length > 0 ? readings[0][1] + " " + readings[0][2] : null,
    })
  }

  return map
}