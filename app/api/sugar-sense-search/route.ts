import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
interface SugarSenseEntry {
  effectiveDate: string
  noteText: string
}

interface SugarSenseGroup {
  duplicateNoteText: string
  entries: SugarSenseEntry[]
}

interface SugarSenseResult {
  residentName: string
  location: string
  admissionDate: string
  groups: SugarSenseGroup[]
}

// ── Internal parsing shapes ──
interface MedicationOrder {
  effectiveDate: string
  noteText: string
}

interface MedResident {
  residentName: string
  residentId: string
  medications: MedicationOrder[]
  onSlidingScale: boolean
  isSubcutaneous: boolean
}

interface VitalsReading {
  date: string
  time: string
  value: number
}

interface VitalsResident {
  residentName: string
  residentId: string
  location: string
  readings: VitalsReading[]
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
    const { medicationText, vitalsText } = body as {
      medicationText?: string
      vitalsText?: string
    }

    if (!medicationText || !vitalsText) {
      return NextResponse.json(
        { error: "medicationText and vitalsText are both required" },
        { status: 400 }
      )
    }

    const medicationResidents = parseMedicationForDiabetesResidents(medicationText)
    console.log("[sugar-sense] Residents on antidiabetic medication: " + medicationResidents.size)
    medicationResidents.forEach((r) =>
      console.log(
        "  - " + r.residentName + " (" + r.residentId + "): " +
        r.medications.length + " medication order(s)" +
        (r.onSlidingScale ? "  [SLIDING SCALE — excluded]" : "") +
        (r.isSubcutaneous ? "  [SUBCUTANEOUSLY — excluded]" : "")
      )
    )

    const vitalsResidents = parseOrderListingVitalsPDF(vitalsText)
    console.log("[sugar-sense] Vitals residents parsed: " + vitalsResidents.size)
    vitalsResidents.forEach((r) =>
      console.log("  - " + r.residentName + ": " + r.readings.length + " blood sugar reading(s)")
    )

    const results: SugarSenseResult[] = []

    // The medication file (already filtered to Medication Class: ANTIDIABETICS)
    // is the source of truth for who's on diabetes medication. For each of
    // them:
    //   - If their medication notes mention "sliding scale", their blood
    //     sugar is expected to swing based on the sliding-scale dosing
    //     itself, so they're excluded from this report entirely.
    //   - If their medication notes mention "subcutaneously" (injectable
    //     route, e.g. insulin given subcutaneously), they're excluded from
    //     this report entirely as well.
    //   - Otherwise, pull their blood sugar readings from the order listing
    //     vitals file and surface only the top 3 HIGHEST readings on record.
    for (const medResident of medicationResidents.values()) {
      if (medResident.onSlidingScale || medResident.isSubcutaneous) continue

      const key = normalizeName(medResident.residentName)
      const vitals = vitalsResidents.get(key)
      const readings = vitals?.readings ?? []

      // No blood sugar readings on file for this (non-sliding-scale) resident —
      // nothing to surface for them in this report.
      if (readings.length === 0) continue

      const top3 = [...readings]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)

      results.push({
        residentName: medResident.residentName + " (" + medResident.residentId + ")",
        location: vitals?.location || "N/A",
        admissionDate:
          "On antidiabetic medication · " + readings.length + " reading" +
          (readings.length !== 1 ? "s" : "") + " on file",
        groups: [
          {
            duplicateNoteText:
              "Top " + top3.length + " highest blood sugar reading" +
              (top3.length !== 1 ? "s" : "") + " on record for this resident.",
            entries: top3.map((r) => ({
              effectiveDate: r.date + " " + r.time,
              noteText: r.value + " mg/dL",
            })),
          },
        ],
      })
    }

    console.log("[sugar-sense] Residents in report: " + results.length)

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[sugar-sense] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Medication PDF parsing
//
// This is an Order Summary report already filtered to
// "Medication Class: ANTIDIABETICS" — so every resident row in this file is
// confirmed to be on a diabetes-related medication. No keyword matching is
// needed to find them; we just need to extract who's on the list, what their
// order(s) say, and whether any of those orders are sliding-scale insulin or
// given subcutaneously (both exclude the resident from the report).
// A resident can appear multiple times (one row per active order):
//
//   Resident Name              Order Summary                                    Order Category  Order Status  Revision Date  Supply Last Order Date  Supply Reorder
//   BEALE, ANDRENETTE (9544)   Insulin Sliding Scale ... per protocol...         Pharmacy         Active        06/17/2026     11/13/2025               Y
//   BLAND, BARBARA (9754)      Empagliflozin ...                                 Pharmacy         Active        07/07/2026     07/07/2026               Y
// ────────────────────────────────────────────────────────────────────────────
function parseMedicationForDiabetesResidents(text: string): Map<string, MedResident> {
  const map = new Map<string, MedResident>()

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
    // reliable signal of active diabetes management. Skip these orders so
    // they aren't used as evidence for this resident.
    if (/empagliflozin/i.test(noteText)) continue

    const residentName = h[1].trim() + ", " + h[2].trim()
    const residentId = h[3].trim()
    const key = normalizeName(residentName)

    if (!map.has(key)) {
      map.set(key, { residentName, residentId, medications: [], onSlidingScale: false, isSubcutaneous: false })
    }

    const entry = map.get(key)!
    entry.medications.push({ effectiveDate: revisionDate, noteText })
    if (/sliding\s*scale/i.test(noteText)) {
      entry.onSlidingScale = true
    }
    if (/subcutaneously/i.test(noteText)) {
      entry.isSubcutaneous = true
    }
  }

  return map
}

// ────────────────────────────────────────────────────────────────────────────
// Order Listing Vitals PDF parsing
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
//
// NOTE: adjust the two header regexes below if the real "order listing
// vitals" export uses different column labels — the reading-value pattern
// (date/time + "N mg/dL") is what actually drives the top-3 calculation and
// should hold regardless of which header format wraps around it.
// ────────────────────────────────────────────────────────────────────────────
function parseOrderListingVitalsPDF(text: string): Map<string, VitalsResident> {
  const map = new Map<string, VitalsResident>()
  const readingPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(\d{1,3}(?:\.\d+)?)\s*mg\/dL/g

  // FORMAT A: "LASTNAME, FIRSTNAME (12345)   Location: Unit 1 103 A, Height:"
  const bulkHeaderPattern =
    /([A-Z][A-Za-z'\-]+),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+){0,2})\s*\((\d{3,7})\)\s*Location:\s*([^,]+),\s*Height:/g
  const bulkHeaderMatches = [...text.matchAll(bulkHeaderPattern)]

  for (let i = 0; i < bulkHeaderMatches.length; i++) {
    const h = bulkHeaderMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < bulkHeaderMatches.length - 1 ? bulkHeaderMatches[i + 1].index! : text.length
    const segment = text.substring(headerEnd, nextHeaderStart)

    const readings = [...segment.matchAll(readingPattern)].map((r) => ({
      date: r[1],
      time: r[2],
      value: parseFloat(r[3]),
    }))

    const residentId = h[3].trim()
    const nameKey = normalizeName(h[1].trim() + ", " + h[2].trim())

    map.set(nameKey, {
      residentName: h[1].trim() + ", " + h[2].trim(),
      residentId,
      location: h[4].trim(),
      readings,
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

    // Don't let a Format-B match overwrite a richer Format-A entry for the same resident
    if (map.has(nameKey)) continue

    const noDataFound = /no\s+data\s+found/i.test(segment)
    const readings = noDataFound
      ? []
      : [...segment.matchAll(readingPattern)].map((r) => ({
          date: r[1],
          time: r[2],
          value: parseFloat(r[3]),
        }))

    map.set(nameKey, {
      residentName: h[1].trim() + ", " + h[2].trim(),
      residentId,
      location: "N/A",
      readings,
    })
  }

  return map
}