import { type NextRequest, NextResponse } from "next/server"
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableCell, TableRow,
  AlignmentType, WidthType,
  BorderStyle, VerticalAlign, ShadingType,
  convertInchesToTwip,
} from "docx"

interface AntibioticsEntry {
  effectiveDate: string
  noteText: string
}

interface AntibioticsGroup {
  duplicateNoteText: string
  entries: AntibioticsEntry[]
}

interface AntibioticsCheckResult {
  residentName: string
  location: string
  admissionDate: string
  groups: AntibioticsGroup[]
}

// ── Condition filter ──
// Only entries whose note text references one of these conditions are
// included in the exported report. Word-boundary, case-insensitive match.
// "bactremia" is kept alongside the correct spelling "bacteremia" in case
// source notes contain the misspelling.
// NOTE: the search route now applies this same filter before results ever
// reach the client, so in normal use this is a defensive no-op. It's kept
// here so the export stays correct even if it's ever called with unfiltered
// data from another caller.
const CONDITION_KEYWORDS = ["urinary", "uti", "sepsis", "bacteremia", "bactremia"]

function matchesCondition(noteText: string): boolean {
  const lower = noteText.toLowerCase()
  return CONDITION_KEYWORDS.some((keyword) => {
    const pattern = new RegExp("\\b" + keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i")
    return pattern.test(lower)
  })
}

// Filters a full result set down to only entries that reference one of the
// CONDITION_KEYWORDS, dropping any group or resident left with no matching
// entries.
function filterResultsByCondition(results: AntibioticsCheckResult[]): AntibioticsCheckResult[] {
  return results
    .map((resident) => {
      const groups = resident.groups
        .map((group) => {
          const entries = group.entries.filter((entry) => matchesCondition(entry.noteText))
          return {
            ...group,
            entries,
            duplicateNoteText:
              entries.length +
              " of " + group.entries.length +
              " antibiotic order" + (group.entries.length !== 1 ? "s" : "") +
              " in this cluster relate to Urinary/UTI/sepsis/bacteremia.",
          }
        })
        .filter((group) => group.entries.length >= 2)
      return { ...resident, groups }
    })
    .filter((resident) => resident.groups.length > 0)
}

const NAVY       = "1B3A6B"
const GOLD       = "B8860B"
const LIGHT_GOLD = "FEF3C7"
const ROW_ALT    = "F0F4FF"
const WHITE      = "FFFFFF"
const GRAY       = "6B7280"

function spacer(pt = 120): Paragraph {
  return new Paragraph({ text: "", spacing: { after: pt } })
}

function noBorder() {
  return { style: BorderStyle.NONE, size: 0, color: WHITE }
}

export async function POST(request: NextRequest) {
  try {
    const { results: rawResults, fileName } = (await request.json()) as {
      results: AntibioticsCheckResult[]
      fileName: string
    }

    if (!rawResults || rawResults.length === 0) {
      return NextResponse.json({ error: "No results to export" }, { status: 400 })
    }

    // Only export paragraphs/entries related to: Urinary, UTI, sepsis, bacteremia
    const results = filterResultsByCondition(rawResults)

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No antibiotic orders related to Urinary, UTI, sepsis, or bacteremia were found to export" },
        { status: 400 }
      )
    }

    const totalEntries = results.reduce((s, r) => s + r.groups.reduce((gs, g) => gs + g.entries.length, 0), 0)
    const children: (Paragraph | Table)[] = []

    // ── TITLE ────────────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [new TextRun({ text: " ", size: 4 })],
        border: { bottom: { style: BorderStyle.THICK, size: 24, color: GOLD } },
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Antibiotics ", bold: true, font: "Times New Roman", size: 52, color: GOLD }),
          new TextRun({ text: "Check Report", bold: true, font: "Times New Roman", size: 52, color: NAVY }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Residents with antibiotic orders 3 or more days apart", font: "Times New Roman", size: 22, color: GRAY, italics: true }),
        ],
        spacing: { after: 40 },
      })
    )

    // Summary banner
    children.push(
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({
                  children: [
                    new TextRun({ text: String(results.length), bold: true, font: "Times New Roman", size: 36, color: WHITE }),
                    new TextRun({ text: "  RESIDENT" + (results.length !== 1 ? "S" : ""), font: "Times New Roman", size: 20, color: "C5D1E8" }),
                  ],
                  alignment: AlignmentType.CENTER,
                })],
                shading: { type: ShadingType.SOLID, color: NAVY },
                margins: { top: 120, bottom: 120, left: 200, right: 200 },
                width: { size: 3000, type: WidthType.DXA },
                borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: { style: BorderStyle.SINGLE, size: 3, color: WHITE } },
              }),
              new TableCell({
                children: [new Paragraph({
                  children: [
                    new TextRun({ text: String(totalEntries), bold: true, font: "Times New Roman", size: 36, color: WHITE }),
                    new TextRun({ text: "  FLAGGED ANTIBIOTIC ORDERS", font: "Times New Roman", size: 20, color: "C5D1E8" }),
                  ],
                  alignment: AlignmentType.CENTER,
                })],
                shading: { type: ShadingType.SOLID, color: "2D4F8A" },
                margins: { top: 120, bottom: 120, left: 200, right: 200 },
                width: { size: 3000, type: WidthType.DXA },
                borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: { style: BorderStyle.SINGLE, size: 3, color: WHITE } },
              }),
              new TableCell({
                children: [new Paragraph({
                  children: [
                    new TextRun({ text: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), bold: true, font: "Times New Roman", size: 22, color: WHITE }),
                  ],
                  alignment: AlignmentType.CENTER,
                })],
                shading: { type: ShadingType.SOLID, color: "3D5F9A" },
                margins: { top: 120, bottom: 120, left: 200, right: 200 },
                width: { size: 3000, type: WidthType.DXA },
                borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() },
              }),
            ],
          }),
        ],
        borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder(), insideHorizontal: noBorder(), insideVertical: noBorder() },
      }),
      spacer(400)
    )

    // ── EACH RESIDENT ────────────────────────────────────────────────────────
    for (let ri = 0; ri < results.length; ri++) {
      const resident = results[ri]
      const flaggedCount = resident.groups.reduce((s, g) => s + g.entries.length, 0)

      // Resident navy banner
      children.push(
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: resident.residentName, bold: true, font: "Times New Roman", size: 32, color: WHITE })],
                      spacing: { before: 60, after: 40 },
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({ text: resident.groups.length + " cluster" + (resident.groups.length !== 1 ? "s" : "") + " flagged    ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                        new TextRun({ text: "\u2502    " + flaggedCount + " antibiotic order" + (flaggedCount !== 1 ? "s" : ""), bold: true, font: "Times New Roman", size: 20, color: GOLD }),
                      ],
                      spacing: { after: 60 },
                    }),
                  ],
                  shading: { type: ShadingType.SOLID, color: NAVY },
                  margins: { top: 100, bottom: 100, left: 280, right: 280 },
                  borders: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD }, top: noBorder(), left: noBorder(), right: noBorder() },
                }),
              ],
            }),
          ],
          borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder(), insideHorizontal: noBorder(), insideVertical: noBorder() },
        })
      )

      // Each flagged cluster (orders 3+ days apart)
      for (let gi = 0; gi < resident.groups.length; gi++) {
        const group = resident.groups[gi]
        const groupLabel = resident.groups.length > 1 ? "Cluster " + (gi + 1) + ":  " : "\u25B6  Antibiotics 3+ Days Apart:  "

        // Gold callout box
        children.push(
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({
                      children: [
                        new TextRun({ text: groupLabel, bold: true, font: "Times New Roman", size: 20, color: GOLD }),
                        new TextRun({ text: group.duplicateNoteText, font: "Times New Roman", size: 20, color: "374151", italics: true }),
                      ],
                    })],
                    shading: { type: ShadingType.SOLID, color: LIGHT_GOLD },
                    margins: { top: 100, bottom: 100, left: 200, right: 200 },
                    borders: { left: { style: BorderStyle.THICK, size: 16, color: GOLD }, top: noBorder(), right: noBorder(), bottom: noBorder() },
                  }),
                ],
              }),
            ],
            borders: { top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder(), insideHorizontal: noBorder(), insideVertical: noBorder() },
          }),
          spacer(100)
        )

        // Data table
        const rows: TableRow[] = []

        // Header row
        rows.push(new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "#", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
              width: { size: 400, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Created Date", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
              width: { size: 2000, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Antibiotic Order", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
              width: { size: 6600, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
          ],
        }))

        // Data rows
        group.entries.forEach((entry, idx) => {
          const shading = idx % 2 === 0
            ? { type: ShadingType.SOLID, color: ROW_ALT }
            : { type: ShadingType.CLEAR, color: WHITE }

          rows.push(new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), font: "Times New Roman", size: 20, bold: true, color: NAVY })], alignment: AlignmentType.CENTER })],
                width: { size: 400, type: WidthType.DXA },
                shading, verticalAlign: VerticalAlign.CENTER,
                margins: { top: 80, bottom: 80, left: 50, right: 50 },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: entry.effectiveDate || "N/A", font: "Times New Roman", size: 20 })] })],
                width: { size: 2000, type: WidthType.DXA },
                shading, verticalAlign: VerticalAlign.CENTER,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: entry.noteText, font: "Times New Roman", size: 20 })] })],
                width: { size: 6600, type: WidthType.DXA },
                shading, verticalAlign: VerticalAlign.TOP,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
              }),
            ],
          }))
        })

        children.push(
          new Table({
            rows,
            width: { size: 9000, type: WidthType.DXA },
            layout: "fixed" as any,
            borders: {
              top:               { style: BorderStyle.SINGLE, size: 2, color: NAVY },
              bottom:            { style: BorderStyle.SINGLE, size: 2, color: NAVY },
              left:              { style: BorderStyle.SINGLE, size: 2, color: NAVY },
              right:             { style: BorderStyle.SINGLE, size: 2, color: NAVY },
              insideHorizontal:  { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
              insideVertical:    { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
            },
          }),
          spacer(gi < resident.groups.length - 1 ? 200 : 0)
        )
      }

      children.push(spacer(ri < results.length - 1 ? 480 : 120))
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: convertInchesToTwip(0.75), bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.85), right: convertInchesToTwip(0.85) } },
        },
        children,
      }],
    })

    const buffer = await Packer.toBuffer(doc)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=\"antibiotics-check-report-" + Date.now() + ".docx\"",
      },
    })

  } catch (error) {
    console.error("[antibiotics-check-export] Error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}