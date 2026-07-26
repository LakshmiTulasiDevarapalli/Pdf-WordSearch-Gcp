import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
interface AntibioticsEntry {
  effectiveDate: string
  noteText: string
}

interface AntibioticsGroup {
  duplicateNoteText: string
  entries: AntibioticsEntry[]
  // "condition"  -> existing Urinary/UTI/sepsis/bacteremia clusters (3+ days apart)
  // "wound"      -> new wound-related orders, no day-gap requirement
  type?: "condition" | "wound"
}

interface AntibioticsCheckResult {
  residentName: string
  location: string
  admissionDate: string
  groups: AntibioticsGroup[]
}

// ── Internal parsing shapes ──
interface OrderLine {
  orderSummary: string
  drugName: string
  category: string
  status: string
  revisionDate: string
  lastOrderDate: string | null
  reorder: string
  isWound: boolean
}

interface ResidentOrders {
  residentName: string
  residentId: string
  orders: OrderLine[]
}

// ────────────────────────────────────────────────────────────────────────────
// Antibiotic keyword list.
//
// The order report has no "drug class" column, so we detect antibiotics by
// matching the order summary text against known antibiotic generic/brand
// names. This list covers the common classes seen in long-term-care order
// reports; extend it as new antibiotic names show up in real reports.
// ────────────────────────────────────────────────────────────────────────────
const ANTIBIOTIC_KEYWORDS = [
  // Penicillins
  "amoxicillin", "augmentin", "amoxicillin-clavulanate", "ampicillin",
  "penicillin", "dicloxacillin", "piperacillin", "nafcillin", "oxacillin",
  "zosyn",
  // Cephalosporins
  "cefdinir", "cephalexin", "keflex", "cefuroxime", "ceftin", "ceftriaxone",
  "rocephin", "cefazolin", "cefpodoxime", "cefadroxil", "cefoxitin",
  "ceftaroline", "cefepime",
  // Fluoroquinolones
  "ciprofloxacin", "cipro", "levofloxacin", "levaquin", "moxifloxacin",
  "avelox", "ofloxacin",
  // Macrolides
  "azithromycin", "zithromax", "z-pak", "clarithromycin", "biaxin",
  "erythromycin",
  // Tetracyclines
  "doxycycline", "minocycline", "tetracycline",
  // Sulfonamides
  "sulfamethoxazole", "trimethoprim", "bactrim", "septra",
  // Nitrofurans
  "nitrofurantoin", "macrobid", "macrodantin",
  // Aminoglycosides
  "gentamicin", "tobramycin", "amikacin", "neomycin",
  // Glycopeptides / lipopeptides
  "vancomycin", "daptomycin",
  // Lincosamides
  "clindamycin",
  // Nitroimidazoles
  "metronidazole", "flagyl",
  // Oxazolidinones
  "linezolid",
  // Rifamycins
  "rifampin", "rifaximin",
  // Topical / other antibiotics
  "bacitracin", "mupirocin", "bactroban", "polymyxin", "neosporin",
  // Carbapenems / monobactams
  "meropenem", "ertapenem", "imipenem", "aztreonam",
  // Misc
  "fosfomycin", "tigecycline", "colistin", "linezolid",
]

function isAntibioticOrder(orderSummary: string): string | null {
  const lower = orderSummary.toLowerCase()
  for (const keyword of ANTIBIOTIC_KEYWORDS) {
    // Word-boundary match so "cipro" doesn't match inside an unrelated word.
    const pattern = new RegExp("\\b" + keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i")
    if (pattern.test(lower)) return keyword
  }
  return null
}

// ── Exclusion list ──
// Order lines containing any of these words are dropped entirely, even if
// they also match an antibiotic keyword above — e.g. "topically" marks a
// topical-route order, and Prevnar/Comirnaty are vaccines, not antibiotics.
// Extend this list as new false-positive terms show up in real reports.
const EXCLUDE_KEYWORDS = ["topically", "prevnar", "comirnaty"]

function isExcludedOrder(orderSummary: string): boolean {
  const lower = orderSummary.toLowerCase()
  return EXCLUDE_KEYWORDS.some((keyword) => {
    const pattern = new RegExp("\\b" + keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i")
    return pattern.test(lower)
  })
}

// ── Condition filter ──
// Only flag antibiotic orders whose text references one of these conditions.
// Word-boundary, case-insensitive match. "bactremia" is kept alongside the
// correct spelling "bacteremia" in case source notes contain the misspelling.
const CONDITION_KEYWORDS = ["urinary", "uti", "sepsis", "bacteremia", "bactremia"]

function matchesCondition(orderSummary: string): boolean {
  const lower = orderSummary.toLowerCase()
  return CONDITION_KEYWORDS.some((keyword) => {
    const pattern = new RegExp("\\b" + keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i")
    return pattern.test(lower)
  })
}

// ── Wound path (separate OR condition, no 3+ day gap requirement) ──
// Any order whose text references "wound" is retrieved for the export
// report as-is — there is no clustering / day-gap requirement for this
// path. The only exclusion is if the order is a basic wound-care topical
// product (Bacitracin, Betadine, Dakin's, Iodosorb, Metronidazole) rather than a true
// antibiotic treatment; those are dropped. Because these products are wound
// dressing/antiseptic products rather than systemic antibiotics of concern,
// they're excluded even though "topically" (the general EXCLUDE_KEYWORDS
// exclusion used by the condition path) does NOT apply here.
function isWoundOrder(orderSummary: string): boolean {
  const pattern = /\bwound\b/i
  return pattern.test(orderSummary)
}

// Regexes instead of plain keyword+\b pairs, since "dakin" needs to match
// "Dakin", "Dakins", and "Dakin's" — a trailing \b after "dakin" never
// matches "Dakins" because "n" and "s" are both word characters with no
// boundary between them.
const WOUND_EXCLUDE_PATTERNS = [
  /\bbacitracin\b/i,
  /\bbetadine\b/i,
  /\bdakin'?s?\b/i,
  /\biodosorb\b/i,
  /\bmetronidazole\b/i,
]

function isWoundExcludedOrder(orderSummary: string): boolean {
  return WOUND_EXCLUDE_PATTERNS.some((pattern) => pattern.test(orderSummary))
}

// Pulls a short display name off the front of the order summary, e.g.
// "Cefdinir Oral Capsule 300 MG (Cefdinir) Give 1 capsule..." -> the part
// before the administration verb ("Give", "Apply", etc).
function extractDrugName(orderSummary: string): string {
  const match = orderSummary.match(/^(.*?)\s+(Apply|Give|Take|Instill|Inject|Administer)\b/i)
  const name = match ? match[1] : orderSummary
  return name.replace(/\s+/g, " ").trim()
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, " ").trim()
}

function parseOrderDate(mmddyyyy: string): Date | null {
  const m = mmddyyyy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, mm, dd, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { antibioticsText } = body as { antibioticsText?: string }

    if (!antibioticsText) {
      return NextResponse.json({ error: "antibioticsText is required" }, { status: 400 })
    }

    const residents = parseOrderReportPDF(antibioticsText)
    // residents.forEach((r) =>
    //   console.log("  - " + r.residentName + " (" + r.residentId + "): " + r.orders.length + " order row(s)")
    // )

    const results: AntibioticsCheckResult[] = []

    for (const resident of residents) {
      // ── Path 1: Urinary/UTI/sepsis/bacteremia clusters, 3+ days apart ──
      // Only orders that match a known antibiotic name (excludes wound rows,
      // which follow their own path below with no day-gap requirement).
      const antibioticOrders = resident.orders
        .filter((o) => !o.isWound)
        .map((o) => ({ o, date: parseOrderDate(o.revisionDate) }))
        .filter((x): x is { o: OrderLine; date: Date } => x.date !== null)
        .sort((a, b) => a.date.getTime() - b.date.getTime())

      // Cluster orders where each is 3 OR MORE days apart from the previous
      // one — a 0/1/2-day gap does NOT count, but 3 days or any larger gap does.
      const clusters: { o: OrderLine; date: Date }[][] = []
      let current: { o: OrderLine; date: Date }[] = []

      for (const entry of antibioticOrders) {
        if (current.length === 0) {
          current = [entry]
        } else {
          const prev = current[current.length - 1]
          if (daysBetween(prev.date, entry.date) >= 3) {
            current.push(entry)
          } else {
            if (current.length >= 2) clusters.push(current)
            current = [entry]
          }
        }
      }
      if (current.length >= 2) clusters.push(current)

      // Within each flagged cluster, only keep the orders that relate to
      // Urinary/UTI/sepsis/bacteremia — everything else is dropped entirely
      // so it never reaches the screen results or the export.
      const conditionGroups = clusters
        .map((cluster) => {
          const matched = cluster.filter(({ o }) => matchesCondition(o.orderSummary))
          return {
            type: "condition" as const,
            duplicateNoteText:
              matched.length + " of " + cluster.length +
              " antibiotic order" + (cluster.length !== 1 ? "s" : "") +
              " in this cluster (3+ days apart) relate to Urinary/UTI/sepsis/bacteremia.",
            entries: matched.map(({ o }) => ({
              effectiveDate: o.revisionDate,
              noteText: o.orderSummary + " — " + o.status + (o.category ? " · " + o.category : ""),
            })),
          }
        })
        .filter((group) => group.entries.length >= 2)

      // ── Path 2: wound-related orders — OR condition, no day-gap needed ──
      // Any order whose text references "wound" is retrieved as-is; the
      // only exclusion is Bacitracin/Betadine/Dakin's/Iodosorb/Metronidazole, already
      // applied at parse time (isWoundExcludedOrder), so every isWound row
      // that reached resident.orders is retrieved here.
      const woundEntries = resident.orders
        .filter((o) => o.isWound)
        .sort((a, b) => {
          const da = parseOrderDate(a.revisionDate)
          const db = parseOrderDate(b.revisionDate)
          if (da && db) return da.getTime() - db.getTime()
          return 0
        })
        .map((o) => ({
          effectiveDate: o.revisionDate,
          noteText: o.orderSummary + " — " + o.status + (o.category ? " · " + o.category : ""),
        }))

      const groups: AntibioticsGroup[] = [...conditionGroups]
      if (woundEntries.length > 0) {
        groups.push({
          type: "wound",
          duplicateNoteText:
            woundEntries.length + " wound-related order" + (woundEntries.length !== 1 ? "s" : "") +
            " found — no 3+ day gap requirement applies to wound orders.",
          entries: woundEntries,
        })
      }

      if (groups.length === 0) continue

      results.push({
        residentName: resident.residentName + " (" + resident.residentId + ")",
        location: "N/A",
        admissionDate: "",
        groups,
      })
    }

    //console.log("[antibiotics-check] Residents flagged: " + results.length)

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[antibiotics-check] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Order report PDF parsing
//
// Expected shape (per order row, resident header repeats on every row):
//
//   ALLEN, ANN (9841) Bacitracin Ointment 500 UNIT/GM Apply to Upper lip
//   lesion topically two times a day related to ABRASION OF OTHER PART OF
//   HEAD, SUBSEQUENT ENCOUNTER (S00.81XD) for 5 Days Apply to upper lip
//   lesion   Pharmacy   Discontinued   06/23/2026        N
//
//   BURZACCHI, CECILE (9838) Cefdinir Oral Capsule 300 MG (Cefdinir) Give 1
//   capsule by mouth every morning and at bedtime for complicated uti for 7
//   Days   Pharmacy   Discontinued   07/02/2026   06/30/2026   Y
//
// pdfjs joins text items with single spaces, collapsing the table columns, so
// we anchor on the resident-header pattern ("LASTNAME, FIRSTNAME (12345)")
// and on the trailing Category / Status / Revision Date / [Last Order Date] /
// Reorder(Y|N) sequence, same approach used for the diagnosis PDF in the BGM
// route.
// ────────────────────────────────────────────────────────────────────────────
function parseOrderReportPDF(text: string): ResidentOrders[] {
  const headerPattern =
    /([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*)\s*\((\d{3,7})\)\s*/g
  const headerMatches = [...text.matchAll(headerPattern)]

  // Known order-category values. We anchor on these literally rather than
  // matching "any word" — a generic [A-Za-z]+ was matching stray words from
  // inside the order summary itself (e.g. "...for 7 Days" was mistaken for
  // the category column). Extend this list if new category values appear.
  const ORDER_CATEGORIES = [
    "Pharmacy", "Lab", "Laboratory", "Nursing", "Treatment", "DME",
    "Diet", "Dietary", "Therapy", "Radiology", "Other",
  ]

  // group1: order category (one of ORDER_CATEGORIES)
  // group2: order status (e.g. "Discontinued", "Completed", "On Hold")
  // group3: revision date
  // group4: optional supply last order date
  // group5: optional supply reorder flag (Y/N)
  //
  // NOTE: this is intentionally NOT anchored to the end of the segment ($).
  // Real extracted PDF text can have trailing noise after a row — a page
  // break, a repeated table header on the next page, a footer like
  // "Page 2 of 8" — and anchoring to the end caused whole rows to be
  // silently dropped whenever that noise was present. Instead we find the
  // leftmost place in the segment where a known Category word is followed by
  // Status/Date columns, and treat everything before that as the order
  // summary, and everything after it (if anything) as ignorable trailing noise.
  const linePattern = new RegExp(
    "\\b(" + ORDER_CATEGORIES.join("|") + ")\\s+([A-Za-z][A-Za-z ]*?)\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4})(?:\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4}))?(?:\\s+([YN]))?",
    "i"
  )

  const residentsByKey = new Map<string, ResidentOrders>()

  for (let i = 0; i < headerMatches.length; i++) {
    const h = headerMatches[i]
    const headerEnd = h.index! + h[0].length
    const nextHeaderStart = i < headerMatches.length - 1 ? headerMatches[i + 1].index! : text.length

    const lastName = h[1].trim()
    const firstName = h[2].trim()
    const residentId = h[3].trim()

    const segment = text
      .substring(headerEnd, nextHeaderStart)
      .replace(/\s+/g, " ")
      .trim()

    const lineMatch = segment.match(linePattern)
    if (!lineMatch) {
      console.warn(
        "[antibiotics-check] Could not locate Category/Status/Date columns for " +
        lastName + ", " + firstName + " (" + residentId + ") — skipping row. Segment: " +
        segment.slice(0, 160)
      )
      continue // row didn't contain the expected trailing columns; skip rather than guess
    }

    const orderSummary = segment.slice(0, lineMatch.index).trim()

    const isWound = isWoundOrder(orderSummary)

    if (isWound) {
      // Wound path: the only exclusion is a basic wound-care topical
      // product (Bacitracin/Betadine/Dakin's/Iodosorb/Metronidazole) — the general
      // "topically"/vaccine exclusion list does NOT apply here, since most
      // legitimate wound orders are administered topically.
      if (isWoundExcludedOrder(orderSummary)) continue
    } else {
      if (isExcludedOrder(orderSummary)) continue // e.g. topical-route orders, vaccine orders — never antibiotics for this check

      const antibioticKeyword = isAntibioticOrder(orderSummary)
      if (!antibioticKeyword) continue // only keep rows that are actually antibiotic orders
    }

    const key = normalizeName(lastName + ", " + firstName) + "|" + residentId
    if (!residentsByKey.has(key)) {
      residentsByKey.set(key, {
        residentName: lastName + ", " + firstName,
        residentId,
        orders: [],
      })
    }

    residentsByKey.get(key)!.orders.push({
      orderSummary,
      drugName: extractDrugName(orderSummary),
      category: lineMatch[1].trim(),
      status: lineMatch[2].trim(),
      revisionDate: lineMatch[3],
      lastOrderDate: lineMatch[4] || null,
      reorder: lineMatch[5] || "N/A",
      isWound,
    })
  }

  return [...residentsByKey.values()]
}