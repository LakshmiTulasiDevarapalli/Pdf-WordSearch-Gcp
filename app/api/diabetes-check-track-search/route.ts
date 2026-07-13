import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
interface DiabetesEntry {
  effectiveDate: string
  noteText: string
}

interface DiabetesGroup {
  duplicateNoteText: string
  entries: DiabetesEntry[]
}

interface DiabetesTrackResult {
  residentName: string
  location: string
  admissionDate: string
  groups: DiabetesGroup[]
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

interface DiabetesTrackResident {
  residentName: string
  residentId: string
  location: string
  readingCount: number
  mostRecentReading: string | null
}

interface DiabetesMedResident {
  residentName: string
  residentId: string
  medications: { effectiveDate: string; noteText: string }[]
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
    const { medicationText, diagnosisText, bloodSugarText } = body as {
      medicationText?: string
      diagnosisText?: string
      bloodSugarText?: string
    }

    if (!medicationText || !diagnosisText || !bloodSugarText) {
      return NextResponse.json(
        { error: "medicationText, diagnosisText, and bloodSugarText are all required" },
        { status: 400 }
      )
    }

    const medicationResidents = parseMedicationForDiabetesResidents(medicationText)
    console.log("[diabetes-check-track] Residents on antidiabetic medication: " + medicationResidents.size)
    medicationResidents.forEach((r) =>
      console.log("  - " + r.residentName + " (" + r.residentId + "): " + r.medications.length + " medication order(s)")
    )

    const diagnosisResidents = parseDiagnosisPDF(diagnosisText)
    console.log("[diabetes-check-track] Diagnosis residents parsed: " + diagnosisResidents.length)
    diagnosisResidents.forEach((r) =>
      console.log("  - " + r.residentName + " (" + r.residentId + "): " + r.diagnoses.length + " diabetes diagnosis row(s)")
    )
    const diagnosisByName = new Map(diagnosisResidents.map((r) => [normalizeName(r.residentName), r]))

    const bgmResidents = parseBloodSugarPDF(bloodSugarText)
    console.log("[diabetes-check-track] Blood sugar residents parsed: " + bgmResidents.size)
    bgmResidents.forEach((r) =>
      console.log("  - " + r.residentName + ": " + r.readingCount + " reading(s)")
    )

    const results: DiabetesTrackResult[] = []

    // The medication file (already filtered to Medication Class: ANTIDIABETICS)
    // is the source of truth here — every resident in it is confirmed to be on
    // a diabetes medication. For each of them we check two independent things:
    //   1. Do they have a matching diabetes diagnosis on file?
    //   2. Do they have blood glucose readings on file?
    // A resident is flagged (included in the report) if EITHER is missing.
    for (const medResident of medicationResidents.values()) {
      const key = normalizeName(medResident.residentName)
      const diagResident = diagnosisByName.get(key)
      const hasDiagnosis = !!diagResident && diagResident.diagnoses.length > 0

      const bgm = bgmResidents.get(key)
      const hasReadings = !!bgm && bgm.readingCount > 0

      // Fully compliant: on medication, has a diagnosis on file, and has glucose readings
      if (hasDiagnosis && hasReadings) continue

      const groups: DiabetesGroup[] = []

      if (!hasDiagnosis) {
        groups.push({
          duplicateNoteText:
            "Resident is on antidiabetic medication but has no matching diabetes diagnosis on file.",
          entries: medResident.medications.map((m) => ({
            effectiveDate: m.effectiveDate,
            noteText: m.noteText,
          })),
        })
      }

      if (!hasReadings) {
        groups.push({
          duplicateNoteText: bgm
            ? "Resident appears in the Blood Sugar report but has no recorded glucose readings."
            : "No blood glucose readings found for this resident despite being on antidiabetic medication.",
          entries: hasDiagnosis
            ? diagResident!.diagnoses.map((d) => ({
                effectiveDate: d.date,
                noteText:
                  d.diagnosisText + " — " + d.rank + (d.classification ? " · " + d.classification : ""),
              }))
            : medResident.medications.map((m) => ({
                effectiveDate: m.effectiveDate,
                noteText: m.noteText,
              })),
        })
      }

      const status =
        (hasDiagnosis ? "Diagnosis on file" : "No matching diagnosis on file") +
        " · " +
        (bgm ? "Found in glucose report — 0 readings recorded" : "Not found in glucose report")

      results.push({
        residentName: medResident.residentName + " (" + medResident.residentId + ")",
        location: diagResident?.location || "N/A",
        admissionDate: status,
        groups,
      })
    }

    console.log("[diabetes-check-track] Non-compliant residents: " + results.length)

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[diabetes-check-track] Error:", error)
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
  //
  // Last name is bounded to a single word: surnames in these reports are one
  // token, and an unbounded quantifier here will greedily swallow the PRIOR
  // resident's trailing classification word (e.g. "...Admission BROWN, DARRYL"
  // gets misread as last name "Admission BROWN") when there's no separator
  // between one resident's block and the next.
  const headerPattern =
    /([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+){0,2})\s*\((\d{3,7})\)\s*-\s*/g
  const headerMatches = [...text.matchAll(headerPattern)]

  // Diagnosis text ending in a diabetes ICD-10 code, followed by a date, then
  // whatever rank/classification/comments text trails it. We deliberately
  // don't require an exact "Dx N" rank here — some rows use "Secondary",
  // "Primary", etc — and split that out afterward instead of baking it into
  // the regex, since a too-strict match here is what silently drops rows.
  //
  // [.\dX\s]{0,8} (not [.\dX]*) because this PDF's text extraction sometimes
  // inserts a stray space right after the decimal point in a code, e.g.
  // "(E11. 65)" or "(Z93. 1)" instead of "(E11.65)" — without tolerating that
  // space, the whole diagnosis row silently fails to match.
  //
  // The trailing group matches ANY character ([\s\S]*?, not a whitelist) —
  // bounded entirely by the lookahead below. A resident whose diagnosis sits
  // right before a page break is followed by page-header junk (facility
  // name, date, the full ICD-10 code list, table headers) containing ":",
  // "-", "*", digits, etc. A restrictive whitelist here has no valid path
  // through that junk to the next real boundary and silently drops the row.
  const diagPattern =
    /([A-Z0-9][A-Z0-9\/,\-.()\s]{4,}?\((E0[89]|E1[01])[.\dX\s]{0,8}\))\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([\s\S]*?)(?=\s+[A-Z0-9][A-Z0-9\/,\-.()\s]{4,}?\([A-Z]\d{2}[.\dX\s]{0,8}\)|\s+[A-Z][A-Za-z'\-]+,\s*[A-Z][A-Za-z'\-]+\s*\(\d{3,7}\)|$)/g
  const diagMatches = [...text.matchAll(diagPattern)]

  // First token of the trailing text is the rank ("Dx 4", "Secondary", "Primary",
  // or "Primary(#67)"); anything after that is classification/comments — minus
  // any page-break junk, trimmed off starting at the "Page N of M" footer marker.
  const splitRankPattern = /^(Dx\s*\d+|Secondary(?:\(#?\d+\))?|Primary(?:\(#?\d+\))?)\s*([\s\S]*)$/i
  const stripPageJunk = (s: string) => s.replace(/\s*Page\s+\d+\s+of\s+\d+[\s\S]*$/i, "").trim()

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
    const cleanLocation = stripPageJunk(location)

    residents.push({
      residentName: lastName + ", " + firstName,
      residentId,
      location: cleanLocation || "N/A",
      diagnoses: ownDiagnoses.map((d) => {
        const trailing = d[4].replace(/\s+/g, " ").trim()
        const split = trailing.match(splitRankPattern)
        return {
          diagnosisText: d[1].replace(/\s+/g, " ").trim(),
          code: d[2],
          date: d[3],
          rank: split ? split[1].trim() : "N/A",
          classification: split ? stripPageJunk(split[2]) : stripPageJunk(trailing),
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
function parseBloodSugarPDF(text: string): Map<string, DiabetesTrackResident> {
  const map = new Map<string, DiabetesTrackResident>()
  const readingPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(\d{1,3}(?:\.\d+)?)\s*mg\/dL/g

  // FORMAT A: "LASTNAME, FIRSTNAME (12345)   Location: Unit 1 103 A, Height:"
  // Last name bounded to one word — same over-matching risk as the diagnosis
  // parser (e.g. would otherwise swallow "Date Value Warnings" column headers
  // into the first resident's name).
  const bulkHeaderPattern =
    /([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+){0,2})\s*\((\d{3,7})\)\s*Location:\s*([^,]+),\s*Height:/g
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
    /Resident:\s*([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+){0,2})\s*\((\d{3,7})\)\s*Vital:\s*Blood\s*Sugar/g
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

// ────────────────────────────────────────────────────────────────────────────
// Medication PDF parsing
//
// This is an Order Summary report already filtered to
// "Medication Class: ANTIDIABETICS" — so every resident row in this file is
// confirmed to be on a diabetes-related medication. No keyword matching is
// needed; we just need to extract who's on the list and what their order(s)
// say. A resident can appear multiple times (one row per active order):
//
//   Resident Name              Order Summary                                    Order Category  Order Status  Revision Date  Supply Last Order Date  Supply Reorder
//   BEALE, ANDRENETTE (9544)   Gvoke HypoPen ... related to TYPE 2 DIABETES...   Pharmacy         Active        06/17/2026     11/13/2025               Y
//   BEALE, ANDRENETTE (9544)   Lantus SoloStar ... related to TYPE 2 DIABETES... Pharmacy         Active        06/03/2026     05/11/2026               Y
//   BLAND, BARBARA (9754)      Empagliflozin ...                                 Pharmacy         Active        07/07/2026     07/07/2026               Y
// ────────────────────────────────────────────────────────────────────────────
function parseMedicationForDiabetesResidents(text: string): Map<string, DiabetesMedResident> {
  const map = new Map<string, DiabetesMedResident>()

  // "LASTNAME, FIRSTNAME MIDDLENAME (12345)" — last name kept to a single word
  // (surnames in these reports are single tokens) so this doesn't greedily
  // swallow preceding report/column-header text that has no comma to stop at.
  const headerPattern =
    /([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+){0,2})\s*\((\d{3,7})\)/g
  const headerMatches = [...text.matchAll(headerPattern)]

  // Strips the trailing "Pharmacy Active 06/17/2026 11/13/2025 Y" columns off
  // the end of an order-summary segment, capturing the Revision Date along the way.
  const trailingColumnsPattern =
    /\s*(Pharmacy|Nursing|Dietary|Lab)\s+(Active|Discontinued|Held|Inactive|Expired)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})?\s*[YN]?\s*$/i

  for (let i = 0; i < headerMatches.length; i++) {
    const h = headerMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < headerMatches.length - 1 ? headerMatches[i + 1].index! : text.length

    const segment = text.substring(headerEnd, nextHeaderStart).replace(/\s+/g, " ").trim()
    if (!segment) continue

    const colMatch = segment.match(trailingColumnsPattern)
    const revisionDate = colMatch ? colMatch[3] : "N/A"
    const noteText = segment.replace(trailingColumnsPattern, "").trim()
    if (!noteText) continue

    // Empagliflozin (Jardiance) is frequently ordered for heart failure / CKD
    // rather than diabetes — as an SGLT2 inhibitor it shows up on this
    // ANTIDIABETICS-class report either way, but its presence alone isn't a
    // reliable signal that the resident needs a diabetes diagnosis or BGM
    // tracking. Skip these orders so they aren't used as flagging evidence.
    if (/empagliflozin/i.test(noteText)) continue

    const residentName = h[1].trim() + ", " + h[2].trim()
    const residentId = h[3].trim()
    const key = normalizeName(residentName)

    if (!map.has(key)) {
      map.set(key, { residentName, residentId, medications: [] })
    }
    map.get(key)!.medications.push({ effectiveDate: revisionDate, noteText })
  }

  return map
}