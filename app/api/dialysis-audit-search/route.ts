import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// ── Shared result shape (matches the docx export route + the frontend section) ──
interface DialysisChecklistItem {
  label: string
  status: "present" | "missing"
  effectiveDate?: string
  noteText?: string
}

interface DialysisGroup {
  type: "av-graft" | "perma-cath"
  totalItems: number
  presentCount: number
  missingCount: number
  // Only the MISSING checklist items are included here — present items are
  // dropped from the output since they don't need action. totalItems and
  // presentCount are still computed from the full checklist for context.
  items: DialysisChecklistItem[]
}

interface DialysisAuditResult {
  residentName: string
  location: string
  admissionDate: string
  groups: DialysisGroup[]
  // true when the resident has BOTH AV Graft/Fistula wording AND Perma Cath
  // wording in their orders. In that case only the Perma Cath checklist is
  // evaluated below (AV Graft is skipped) — this flag exists purely so the
  // export/frontend can highlight that the resident actually has both
  // access types on record.
  hasBothAccessTypes?: boolean
}

// ── Internal parsing shapes ──
interface OrderLine {
  orderSummary: string
  category: string
  status: string
  revisionDate: string
  lastOrderDate: string | null
  reorder: string
  isAVGraft: boolean
  isPermaCath: boolean
}

interface ResidentOrders {
  residentName: string
  residentId: string
  orders: OrderLine[]
}

// ────────────────────────────────────────────────────────────────────────────
// Trigger keywords.
//
// A resident's orders "trigger" the AV Graft checklist if any order mentions
// AV or fistula, and trigger the Perma Cath checklist if any order mentions
// Perma Cath (any spacing / hyphenation). Once triggered, EVERY item on the
// respective checklist below is checked against ALL of that resident's
// dialysis-related orders — items with no matching order are reported as
// "missing" rather than being silently dropped.
//
// If a resident triggers BOTH paths, only the Perma Cath checklist is
// evaluated — the AV Graft checklist is skipped entirely for that resident.
// The resident is still flagged via hasBothAccessTypes so this dual-access
// situation is visible in the report rather than silently dropped.
// ────────────────────────────────────────────────────────────────────────────
const AV_TRIGGER_PATTERN = /\bAV\b|\bfistula\b/i
const PERMA_CATH_TRIGGER_PATTERN = /\bperma[\s-]?cath\b/i

// Broad net used at parse time — every checklist item's order name starts
// with "Dialysis", so any row mentioning "dialysis" is kept as a candidate.
// Non-dialysis orders never reach a resident's order list.
const DIALYSIS_ORDER_PATTERN = /dialysis/i

function isAVGraftTrigger(orderSummary: string): boolean {
  return AV_TRIGGER_PATTERN.test(orderSummary)
}

function isPermaCathTrigger(orderSummary: string): boolean {
  return PERMA_CATH_TRIGGER_PATTERN.test(orderSummary)
}

function isDialysisOrder(orderSummary: string): boolean {
  return DIALYSIS_ORDER_PATTERN.test(orderSummary)
}

// ────────────────────────────────────────────────────────────────────────────
// Checklist definitions.
//
// Each item is checked against a resident's order text using the keyword(s)
// given below. A multi-word keyword no longer has to appear as an exact
// contiguous phrase — every significant word in it must appear SOMEWHERE in
// the order text, in ANY order. This matters because real order text is
// freeform nursing instructions, not a repeat of the order-set template
// name — e.g. "Check Site for Thrill and Bruit" as a template name shows up
// in practice as "Assess dialysis AV graft site for bruit &thrill every
// shift". Matching is done against the order summary text ONLY — the order
// Category column (Pharmacy / Nursing / Other / etc.) is never used.
//
// NOTE: for "Dialysis - Check Site for Thrill and Bruit" the word "Check"
// was dropped from the match requirement — real orders use "Assess" instead
// of "Check", so requiring it caused false "missing" results. The item now
// matches on "Site" + "Thrill" + "Bruit" (all three, any order).
//
// NOTE: "Dialysis Access - Post Dialysis" and "Dialysis Days" were loosened
// with extra alternatives based on real order text that never uses the
// literal words "Access" or "Days" — e.g. "Check dialysis AV graft site
// upon RETURN from dialysis center..." (no "Access") and "Dialysis on
// MONDAY, Wednesday, and Friday..." (no "Days"). Each now also matches on
// "Return" / "Post Dialysis" and on "Monday" / "MWF" respectively.
//
// NOTE: "Dialysis AV Graft - MD Notification" now accepts either phrasing
// — "MD Notification" or "Notify MD" — since real orders write it verb-
// first ("Notify MD and hemodialysis unit for...") rather than as the
// noun-form order-set template name.
// ────────────────────────────────────────────────────────────────────────────
interface ChecklistDef {
  label: string
  keyword: string
}

const AV_GRAFT_CHECKLIST: ChecklistDef[] = [
  { label: "Dialysis Access - Post Dialysis", keyword: "Dialysis Access|Post Dialysis|Return" },
  { label: "Dialysis AV Graft - Remove Pressure Dressing", keyword: "Remove Pressure Dressing" },
  { label: "Dialysis - Arm BP Restriction", keyword: "B/P|BP" },
  { label: "Dialysis - Check Site for Thrill and Bruit", keyword: "Site Thrill Bruit" },
  { label: "Dialysis Access Site: (Choose One) AV Fistula / AV Graft / Central Vein", keyword: "Dialysis Access Site" },
  { label: "Dialysis Days", keyword: "Dialysis Days|Monday|MWF" },
  { label: "Dialysis AV Graft - MD Notification", keyword: "MD Notification|Notify MD" },
  { label: "Dialysis AV Graft - Hold Medications while at Dialysis", keyword: "Hold Medication" },
  { label: "Decompensation monitoring for dialysis residents", keyword: "Decompensation" },
]

const PERMA_CATH_CHECKLIST: ChecklistDef[] = [
  { label: "Dialysis Days", keyword: "Day|Days|Monday|MWF" },
  { label: "Dialysis Access - Post Dialysis", keyword: "Dialysis Access|Post Dialysis|Return" },
  { label: "Dialysis Perma Cath - Lumen Cap", keyword: "Lumen Cap" },
  { label: "Dialysis Perma Cath - Notify MD", keyword: "Notify MD" },
  { label: "Dialysis Perma Cath - Observe Site", keyword: "Observe Site" },
  { label: "Dialysis Perma Cath - Site Restrictions", keyword: "Site Restrictions" },
  { label: "Dialysis Perma Cath - Specify Location", keyword: "Location" },
  { label: "Dialysis Permacath - Monitor Site", keyword: "Monitor Site" },
  { label: "Dialysis Perma Cath - Hold Medications while at Dialysis", keyword: "Hold Medication" },
  { label: "Decompensation monitoring for dialysis residents", keyword: "Decompensation" },
]

// Connector words dropped from multi-word keywords before matching — these
// carry no distinguishing meaning and real order text often omits, replaces,
// or reorders them (e.g. "&" instead of "and").
const STOPWORDS = new Set([
  "and", "or", "for", "the", "to", "of", "while", "at", "in", "on", "a", "an", "with", "per",
])

// Builds a case-insensitive matcher for a keyword spec. Supports simple
// "A|B" alternation (e.g. "B/P|BP", "Day|Days") — the keyword matches if ANY
// alternative matches. For a multi-word alternative, EVERY significant word
// (stopwords filtered out) must appear somewhere in the text — in any order,
// not as a contiguous phrase. Each word match requires a leading word
// boundary only — no trailing boundary — so suffix variants (plurals, etc.)
// still match (e.g. "Medication" also matches "Medications").
function keywordToMatcher(keywordSpec: string): (text: string) => boolean {
  const alternatives = keywordSpec.split("|").map((alt) => alt.trim())

  const alternativeMatchers = alternatives.map((alt) => {
    const rawWords = alt.split(/\s+/).filter(Boolean)
    const words = rawWords.length > 1
      ? rawWords.filter((w) => !STOPWORDS.has(w.toLowerCase()))
      : rawWords
    const finalWords = words.length > 0 ? words : rawWords // safety net if filtering removes everything

    const wordPatterns = finalWords.map(
      (w) => new RegExp("\\b" + w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i")
    )

    return (text: string) => wordPatterns.every((p) => p.test(text))
  })

  return (text: string) => alternativeMatchers.some((m) => m(text))
}

// Checks a fixed checklist against a resident's pool of dialysis orders.
// Every item is included in the result — "present" with the matching
// order's date/details, or "missing" if no order in the pool matches.
function buildChecklistResult(
  orders: OrderLine[],
  checklist: ChecklistDef[]
): DialysisChecklistItem[] {
  return checklist.map((item) => {
    const matches = keywordToMatcher(item.keyword)
    const matched = orders.find((o) => matches(o.orderSummary))
    if (matched) {
      return {
        label: item.label,
        status: "present" as const,
        effectiveDate: matched.revisionDate,
        noteText: matched.orderSummary + " — " + matched.status + (matched.category ? " · " + matched.category : ""),
      }
    }
    return { label: item.label, status: "missing" as const }
  })
}

function normalizeName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, " ").trim()
}

// Builds a DialysisGroup for the given checklist. Counts (total/present/
// missing) are computed from the FULL checklist evaluation, but the
// returned `items` array only contains the missing ones — present items
// are not needed in the output, only what's outstanding.
function buildGroup(
  type: "av-graft" | "perma-cath",
  orders: OrderLine[],
  checklist: ChecklistDef[]
): DialysisGroup {
  const allItems = buildChecklistResult(orders, checklist)
  return {
    type,
    totalItems: allItems.length,
    presentCount: allItems.filter((i) => i.status === "present").length,
    missingCount: allItems.filter((i) => i.status === "missing").length,
    items: allItems.filter((i) => i.status === "missing"),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dialysisText } = body as { dialysisText?: string }

    if (!dialysisText) {
      return NextResponse.json({ error: "dialysisText is required" }, { status: 400 })
    }

    const residents = parseOrderReportPDF(dialysisText)

    const results: DialysisAuditResult[] = []

    for (const resident of residents) {
      const groups: DialysisGroup[] = []

      const hasAVTrigger = resident.orders.some((o) => o.isAVGraft)
      const hasPermaCathTrigger = resident.orders.some((o) => o.isPermaCath)
      const hasBothAccessTypes = hasAVTrigger && hasPermaCathTrigger

      // ── When a resident has BOTH AV Graft/Fistula and Perma Cath wording,
      // only the Perma Cath checklist is evaluated — AV Graft is skipped
      // entirely. The resident is still flagged via hasBothAccessTypes so
      // this dual-access situation is visible in the report rather than
      // silently dropped. ──
      if (hasBothAccessTypes) {
        groups.push(buildGroup("perma-cath", resident.orders, PERMA_CATH_CHECKLIST))
      } else {
        // ── AV Graft checklist — every item checked against ALL of this
        // resident's dialysis orders, not just the ones that triggered it ──
        if (hasAVTrigger) {
          groups.push(buildGroup("av-graft", resident.orders, AV_GRAFT_CHECKLIST))
        }

        // ── Perma Cath checklist — only reached when AV Graft is not
        // also triggered (the both-triggers case is handled above) ──
        if (hasPermaCathTrigger) {
          groups.push(buildGroup("perma-cath", resident.orders, PERMA_CATH_CHECKLIST))
        }
      }

      // Drop groups with nothing missing — a resident whose checklist is
      // fully satisfied has no outstanding items to report.
      const groupsWithMissingItems = groups.filter((g) => g.missingCount > 0)

      // Resident has neither AV Graft nor Perma Cath activity, or every
      // checklist item is already present — do not export.
      if (groupsWithMissingItems.length === 0) continue

      results.push({
        residentName: resident.residentName + " (" + resident.residentId + ")",
        location: "N/A",
        admissionDate: "",
        groups: groupsWithMissingItems,
        hasBothAccessTypes,
      })
    }

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[dialysis-audit] Error:", error)
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
//   AGWU, AUGUSTINE (22406) Assess dialysis AV graft site for bruit &thrill
//   every shift. (Notify MD immediately if no bruit is audible via
//   stethoscope and thrill not palpable) every shift   Other   Active
//   07/17/2026        N
//
// pdfjs joins text items with single spaces, collapsing the table columns, so
// we anchor on the resident-header pattern ("LASTNAME, FIRSTNAME (12345)")
// and on the trailing Category / Status / Revision Date / [Last Order Date] /
// Reorder(Y|N) sequence — same approach used by the antibiotics check route.
// ────────────────────────────────────────────────────────────────────────────
function parseOrderReportPDF(text: string): ResidentOrders[] {
  const headerPattern =
    /([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*),\s*([A-Z][A-Za-z'\-]+(?:\s[A-Z][A-Za-z'\-]+)*)\s*\((\d{3,7})\)\s*/g
  const headerMatches = [...text.matchAll(headerPattern)]

  // Known order-category values. We anchor on these literally rather than
  // matching "any word" — a generic [A-Za-z]+ was matching stray words from
  // inside the order summary itself. Extend this list if new category
  // values appear. NOTE: this list is only used to locate where the order
  // summary text ends in the raw PDF text — the category value itself is
  // never used for checklist keyword matching.
  const ORDER_CATEGORIES = [
    "Pharmacy", "Lab", "Laboratory", "Nursing", "Treatment", "DME",
    "Diet", "Dietary", "Therapy", "Radiology", "Other",
  ]

  // group1: order category (one of ORDER_CATEGORIES)
  // group2: order status (e.g. "Discontinued", "Completed", "Active")
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
        "[dialysis-audit] Could not locate Category/Status/Date columns for " +
        lastName + ", " + firstName + " (" + residentId + ") — skipping row. Segment: " +
        segment.slice(0, 160)
      )
      continue // row didn't contain the expected trailing columns; skip rather than guess
    }

    const orderSummary = segment.slice(0, lineMatch.index).trim()

    // Only keep rows that are dialysis-related at all — every checklist
    // item's order name starts with "Dialysis", so this is a broad net.
    // Non-dialysis orders are dropped here and never reach a resident's
    // order list or the checklist matching below.
    if (!isDialysisOrder(orderSummary)) continue

    const isAVGraft = isAVGraftTrigger(orderSummary)
    const isPermaCath = isPermaCathTrigger(orderSummary)

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
      category: lineMatch[1].trim(),
      status: lineMatch[2].trim(),
      revisionDate: lineMatch[3],
      lastOrderDate: lineMatch[4] || null,
      reorder: lineMatch[5] || "N/A",
      isAVGraft,
      isPermaCath,
    })
  }

  return [...residentsByKey.values()]
}