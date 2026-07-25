import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
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

// ────────────────────────────────────────────────────────────────────────────
// Threshold rules
//
// Each vital type below has a check() function that pulls the relevant
// number(s) out of the raw value text (e.g. "130/72 mmHg (Lying l/arm)") and
// decides whether it's an exception. Only the vitals listed here are
// evaluated — any other "<X> Summary" section in the report (Weight, BMI
// Percentile, Height, etc.) is ignored.
// ────────────────────────────────────────────────────────────────────────────
function firstNumber(text: string): number | null {
  const m = text.match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

interface ThresholdRule {
  label: string
  thresholdText: string
  check: (value: string) => { exceeded: boolean; reason: string }
}

// A single one-off out-of-range reading is often noise (a bad cuff
// placement, a resident moving during the check, a device blip). We only
// keep a resident/vital-type pairing if it recurred at least this many
// times within the report's date range — recurring exceptions are what's
// actually actionable.
const MIN_OCCURRENCES_TO_FLAG = 3

const THRESHOLDS: Record<string, ThresholdRule> = {
  "blood pressure": {
    label: "Blood Pressure",
    thresholdText: "Systolic (upper) reading above 170 or below 80 mmHg",
    check: (value: string) => {
      const m = value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
      if (!m) return { exceeded: false, reason: "" }
      const systolic = parseInt(m[1], 10)
      if (systolic > 170) return { exceeded: true, reason: `Systolic ${systolic} mmHg is above 170` }
      if (systolic < 80) return { exceeded: true, reason: `Systolic ${systolic} mmHg is below 80` }
      return { exceeded: false, reason: "" }
    },
  },
  "pulse": {
    label: "Pulse",
    thresholdText: "Reading above 100 or below 55 bpm",
    check: (value: string) => {
      const n = firstNumber(value)
      if (n === null) return { exceeded: false, reason: "" }
      if (n > 100) return { exceeded: true, reason: `Pulse ${n} bpm is above 100` }
      if (n < 55) return { exceeded: true, reason: `Pulse ${n} bpm is below 55` }
      return { exceeded: false, reason: "" }
    },
  },
  "respiration": {
    label: "Respiration",
    thresholdText: "Reading above 22 or below 14 per minute",
    check: (value: string) => {
      const n = firstNumber(value)
      if (n === null) return { exceeded: false, reason: "" }
      if (n > 22) return { exceeded: true, reason: `Respiration ${n} is above 22` }
      if (n < 14) return { exceeded: true, reason: `Respiration ${n} is below 14` }
      return { exceeded: false, reason: "" }
    },
  },
  "o2 sats": {
    label: "O2 Sats",
    thresholdText: "Reading below 90%",
    check: (value: string) => {
      const n = firstNumber(value)
      if (n === null) return { exceeded: false, reason: "" }
      if (n < 90) return { exceeded: true, reason: `O2 sats ${n}% is below 90` }
      return { exceeded: false, reason: "" }
    },
  },
  "blood sugar": {
    label: "Blood Sugar",
    thresholdText: "Reading above 300 or below 70 mg/dL",
    check: (value: string) => {
      const n = firstNumber(value)
      if (n === null) return { exceeded: false, reason: "" }
      if (n > 300) return { exceeded: true, reason: `Blood Sugar ${n} mg/dL is above 300` }
      if (n < 70) return { exceeded: true, reason: `Blood Sugar ${n} mg/dL is below 70` }
      return { exceeded: false, reason: "" }
    },
  },
  "temperature": {
    label: "Temperature",
    thresholdText: "Reading above 99°F or below 95°F",
    check: (value: string) => {
      const n = firstNumber(value)
      if (n === null) return { exceeded: false, reason: "" }
      if (n > 99) return { exceeded: true, reason: `Temperature ${n}°F is above 99` }
      if (n < 95) return { exceeded: true, reason: `Temperature ${n}°F is below 95` }
      return { exceeded: false, reason: "" }
    },
  },
}

// Matches the "<Vital Type> Summary" section headers inside a resident's
// block, e.g. "Blood Pressure Summary", "O2 sats Summary", "Pulse Summary".
// Captures the canonical threshold key alongside the label actually printed
// in the report (case can vary, e.g. "O2 Sats" vs "O2 sats").
const KNOWN_VITAL_LABEL_PATTERN =
  /(Blood Pressure|Pulse|Respiration(?:\s*Rate)?|O2\s*[Ss]ats|Blood Sugar|Temperature)\s+Summary/gi

function canonicalKey(label: string): string {
  const lower = label.toLowerCase().trim()
  if (lower.startsWith("respiration")) return "respiration"
  if (lower.startsWith("o2")) return "o2 sats"
  return lower
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// This report can track far more than the six vitals we threshold-check —
// Weight, BMI Percentile, Head Circumference, Pain Level, Height, etc. all
// get their own "<Name> Summary" section too. If we only ever look for our
// six known labels, every *other* section's rows silently get absorbed into
// whichever recognized section came right before it (since nothing marks
// where that unrecognized section starts), and then get evaluated against
// the wrong threshold entirely — e.g. a Pain Level reading of "0" getting
// flagged as an O2 sats exception.
//
// To prevent that, we read the report's own legend line — "Vital: Blood
// Pressure, Blood Sugar, BMI Percentile, ... Effective Date Range: ..." —
// which lists every section name actually present in this specific report,
// and build the boundary pattern from that complete list. Every section
// then correctly bounds the next, even the ones we don't check.
function buildSectionPattern(text: string): RegExp {
  const legendMatch = text.match(/Vital:\s*(.*?)\s*Effective Date Range/i)
  const legendLabels = legendMatch
    ? legendMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
    : []

  if (legendLabels.length === 0) {
    // Legend line wasn't found for some reason — fall back to just the
    // six vitals we check. Sections we don't recognize could still leak
    // into a recognized one in this fallback path, but this keeps the
    // route from failing outright.
    return new RegExp(KNOWN_VITAL_LABEL_PATTERN.source, "gi")
  }

  // Longest-first so e.g. "Blood Pressure" isn't cut short by a hypothetical
  // "Blood" appearing earlier in the alternation.
  const alternation = [...legendLabels]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|")

  return new RegExp(`(${alternation})\\s+Summary`, "gi")
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { vitalsText } = body as { vitalsText?: string }

    if (!vitalsText) {
      return NextResponse.json({ error: "vitalsText is required" }, { status: 400 })
    }

    const results = parseVitalsReportPDF(vitalsText)

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[vital-exception-report] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Vitals report PDF parsing
//
// Expected shape (per resident block, from the "Weights and Vitals Summary"
// report):
//
//   ABDISA, DEGU (22191)   Location: 4S 420 D, Height: 68 Inches, DOA: 09/04/2025
//   Blood Pressure Summary
//   07/24/2026 20:26  130/72 mmHg (Lying l/arm)
//   07/24/2026 13:14  125/76 mmHg (Lying r/arm)
//   ...
//   Pulse Summary
//   07/24/2026 20:26  72 bpm
//   ...
//
// pdfjs joins text items with single spaces, collapsing table columns, so —
// same approach as the order report / antibiotics route — we anchor on the
// resident-header pattern ("LASTNAME, FIRSTNAME (12345)") and on known
// section labels ("<Vital> Summary") rather than relying on line breaks.
// ────────────────────────────────────────────────────────────────────────────
function parseVitalsReportPDF(text: string): VitalExceptionResult[] {
  const rawNormalized = text.replace(/\s+/g, " ").trim()

  // This report can span thousands of pages, and every page reprints the
  // same boilerplate block (facility name/code, report title, date/time,
  // the "Vital: ..." legend, and the "Date Value Warnings" column header) —
  // right in the middle of a vital's reading list, without repeating the
  // "<Vital> Summary" section label. Left in place, that boilerplate gets
  // glued onto whichever reading happens to fall right before a page break
  // (our row capture only stops at the next real date+time pair), corrupting
  // that one reading's value with hundreds of characters of junk.
  //
  // The boilerplate reliably starts with "Only vitals with data are
  // displayed Page X of Y" and reliably ends with "Date Value Warnings"
  // right before real rows resume, so we strip everything between those
  // two markers (non-greedy, case-insensitive) before parsing anything else.
  const normalized = rawNormalized
    .replace(/Only vitals with data are displayed[\s\S]*?Date Value Warnings/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  const SECTION_PATTERN = buildSectionPattern(normalized)

  // ── Resident boundary detection ─────────────────────────────────────────
  //
  // Earlier versions of this parser found resident boundaries by matching
  // the name itself ("LASTNAME, FIRSTNAME"). That's fragile: patient names
  // can contain accented letters, suffixes, unusual punctuation, or other
  // formatting we haven't anticipated. Every time the name pattern failed to
  // match *any* character in a resident's name, that resident's header went
  // undetected entirely — and their whole block of readings silently merged
  // into whichever resident came before them, misattributing their
  // exceptions to a different person. We've hit this repeatedly (accented
  // names, names with suffixes, etc.) and patching the name pattern one
  // format at a time doesn't converge.
  //
  // Instead, we anchor on something structurally guaranteed rather than
  // pattern-matched: every resident header is immediately followed by
  // "(ID) Location: ..., DOA: <date>" — a resident ID (always digits), the
  // literal word "Location:", and a literal "DOA:" date. This is far less
  // likely to vary than a name ever is. Name extraction becomes a secondary,
  // best-effort step layered on top: if we can't confidently parse the name
  // right before a given anchor, we still create a correct boundary and
  // just fall back to a generic "Resident (ID)" label — so worst case we
  // lose a display name, never a resident's data.
  const anchorPattern = /\(\s*(\d{3,7})\s*\)\s*Location:\s*(.*?)(?:,\s*Height:[^,]*)?,\s*DOA:\s*(\d{1,2}\/\d{1,2}\/\d{4})/g
  const anchorMatches = [...normalized.matchAll(anchorPattern)]

  // Using \p{Lu} (any Unicode uppercase letter) instead of plain [A-Z]
  // matters here: it lets us correctly recover names with accented
  // characters ("GARCÍA", "JOSÉ", "MUÑOZ"). This is now purely additive —
  // whether or not it succeeds has no bearing on data correctness, since
  // segmentation is anchored on the structural ID/Location/DOA pattern
  // above, not on this. Worst case a name fails to parse and we fall back
  // to a generic "Resident (ID)" label; the readings themselves are never
  // at risk of being lost or misattributed.
  //
  // Surnames in this report are consistently printed fully upper case
  // ("LEFTWICH", "ABDISA", "O'BRIEN"), but first/middle names sometimes
  // are NOT — e.g. "TANYA Elaise" mixes an upper-case first name with a
  // Title Case middle name. So the surname pattern stays strict
  // (all-upper-case per word), while the given-name pattern allows mixed
  // case within a word after its capitalized first letter. Keeping the
  // surname strict is what still protects us from matching boilerplate
  // report text (facility names, the report generator's own username,
  // etc.) as a false "name" — none of that boilerplate is ever all-caps,
  // so it still can't satisfy the surname half of the pattern.
  const surnamePart = "\\p{Lu}[\\p{Lu}'\\-.]*(?:\\s\\p{Lu}[\\p{Lu}'\\-.]*)*"
  const givenNamePart = "\\p{Lu}[\\p{L}'\\-.]*(?:\\s\\p{Lu}[\\p{L}'\\-.]*)*"
  // Anchored with $ so it only matches a name sitting immediately before
  // the "(ID)" we already found — never starting mid-word off some
  // unrelated preceding value like the trailing "L" in "310 mg/dL". The
  // leading negative lookbehind is what actually enforces that: without it,
  // .match() happily starts the search at that "L" since a match is still
  // possible from there through to the end of the window.
  const trailingNamePattern = new RegExp(`(?<![\\p{L}])(${surnamePart}),\\s*(${givenNamePart})\\s*$`, "u")

  interface ResidentAnchor {
    residentId: string
    residentName: string
    location: string
    admissionDate: string
    nameStart: number
    dataStart: number
  }

  const anchors: ResidentAnchor[] = anchorMatches.map((m) => {
    const anchorStart = m.index!
    const residentId = m[1].trim()
    const location = m[2].trim() || "N/A"
    const admissionDate = m[3].trim()
    const dataStart = anchorStart + m[0].length

    // Look back only a short, bounded window for "LASTNAME, FIRSTNAME"
    // immediately preceding this anchor — bounded so a name-matching
    // failure can never expand into swallowing a large chunk of the
    // previous resident's data. This match's *position* (nameStart) is
    // load-bearing for segmentation; the captured text is now also
    // returned to the caller as the display name.
    const windowStart = Math.max(0, anchorStart - 200)
    const window = normalized.slice(windowStart, anchorStart)
    const nameMatch = window.match(trailingNamePattern)

    const nameStart = nameMatch ? windowStart + nameMatch.index! : anchorStart
    const residentName = nameMatch
      ? `${nameMatch[1].trim()}, ${nameMatch[2].trim()}`
      : `Resident ${residentId}`

    return { residentId, residentName, location, admissionDate, nameStart, dataStart }
  })

  // The value capture stops at whichever comes first: the next date/time
  // row, or the start of the next resident's "(ID) Location:" block. The
  // second alternative is a safety net — it should rarely be needed since
  // segments are already cut at nameStart above, but it means that even if
  // a name-boundary computation is ever imprecise, a reading's value can
  // never end up swallowing structural anchor text like "(20079) Location:".
  const rowPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(.*?)(?=(?:\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})|(?:\(\s*\d{3,7}\s*\)\s*Location:)|$)/g

  const results: VitalExceptionResult[] = []

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    // The next resident's segment starts at their *name*, not their ID —
    // otherwise the few characters between "DOA: <date>" and the next
    // name would be silently included as trailing, harmless text (fine),
    // but more importantly this keeps every byte of text correctly
    // assigned to exactly one resident with no gap or overlap.
    const segmentEnd = i < anchors.length - 1 ? anchors[i + 1].nameStart : normalized.length
    const segment = normalized.slice(anchor.dataStart, segmentEnd)

    // Locate every "<Section> Summary" boundary within this resident's
    // segment — including sections we don't threshold-check, so their rows
    // never bleed into a recognized section.
    const vitalMatches = [...segment.matchAll(SECTION_PATTERN)]
    if (vitalMatches.length === 0) continue

    const groups: VitalExceptionGroup[] = []

    for (let vi = 0; vi < vitalMatches.length; vi++) {
      const vm = vitalMatches[vi]
      const label = vm[1].trim()
      const key = canonicalKey(label)
      const rule = THRESHOLDS[key]
      if (!rule) continue // not a vital we're checking (e.g. Weight, BMI Percentile)

      const blockStart = vm.index! + vm[0].length
      const blockEnd = vi < vitalMatches.length - 1 ? vitalMatches[vi + 1].index! : segment.length
      const block = segment.substring(blockStart, blockEnd)

      const entries: VitalExceptionEntry[] = []
      const rows = [...block.matchAll(rowPattern)]

      for (const row of rows) {
        const date = row[1]
        const time = row[2]
        const value = row[3].trim()
        if (!value) continue

        const { exceeded, reason } = rule.check(value)
        if (!exceeded) continue

        entries.push({
          dateTime: `${date} ${time}`,
          value,
          reason,
        })
      }

      // Drop one-off exceptions: only flag this resident for this vital
      // type if it happened MIN_OCCURRENCES_TO_FLAG times or more.
      if (entries.length >= MIN_OCCURRENCES_TO_FLAG) {
        groups.push({
          vitalType: rule.label,
          thresholdText: `${rule.thresholdText} (flagged when it recurs ${MIN_OCCURRENCES_TO_FLAG}+ times)`,
          entries,
        })
      }
    }

    if (groups.length > 0) {
      results.push({
        residentName: anchor.residentName,
        residentId: anchor.residentId,
        location: anchor.location,
        admissionDate: anchor.admissionDate,
        groups,
      })
    }
  }

  return results
}