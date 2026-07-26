import { type NextRequest, NextResponse } from "next/server"
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableCell, TableRow,
  AlignmentType, WidthType,
  BorderStyle, VerticalAlign, ShadingType,
  convertInchesToTwip,
} from "docx"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Large facilities can flag thousands of readings across hundreds of
// residents — building that many docx tables can take a while, so give the
// route plenty of headroom rather than letting the platform's default
// timeout cut it off mid-generation.
export const maxDuration = 300

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

// Pivoted shape used when grouping by exception type instead of by resident.
interface CategoryResidentEntries {
  residentName: string
  residentId: string
  location: string
  admissionDate: string
  entries: VitalExceptionEntry[]
}

interface ExceptionCategory {
  vitalType: string
  thresholdText: string
  residents: CategoryResidentEntries[]
}

function pivotByExceptionType(results: VitalExceptionResult[]): ExceptionCategory[] {
  const byType = new Map<string, ExceptionCategory>()

  for (const resident of results) {
    for (const group of resident.groups) {
      if (!byType.has(group.vitalType)) {
        byType.set(group.vitalType, {
          vitalType: group.vitalType,
          thresholdText: group.thresholdText,
          residents: [],
        })
      }
      byType.get(group.vitalType)!.residents.push({
        residentName: resident.residentName,
        residentId: resident.residentId,
        location: resident.location,
        admissionDate: resident.admissionDate,
        entries: group.entries,
      })
    }
  }

  return [...byType.values()].sort((a, b) => {
    const totalA = a.residents.reduce((s, r) => s + r.entries.length, 0)
    const totalB = b.residents.reduce((s, r) => s + r.entries.length, 0)
    return totalB - totalA
  })
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

// Builds the navy-headed data table of flagged readings. When `residentColumn`
// is true, Resident Name / ID / Location columns are included (used in the
// by-exception-type view, where one table can span many residents);
// otherwise the table is just #, Date/Time, Reading, Exception Reason (used
// in the by-resident view, where that info is already in the banner above).
function buildEntriesTable(
  entries: (VitalExceptionEntry & { residentName?: string; residentId?: string; location?: string })[],
  residentColumn: boolean
): Table {
  const rows: TableRow[] = []

  const headerCells = [
    { text: "#", width: 400 },
    ...(residentColumn ? [
      { text: "Resident Name", width: 1800 },
      { text: "Resident ID", width: 1000 },
      { text: "Location", width: 1200 },
    ] : []),
    { text: "Date / Time", width: residentColumn ? 1300 : 2000 },
    { text: "Reading", width: residentColumn ? 1500 : 2600 },
    { text: "Exception Reason", width: residentColumn ? 1800 : 4000 },
  ]

  rows.push(new TableRow({
    tableHeader: true,
    children: headerCells.map((c) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: c.text, bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
      width: { size: c.width, type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: NAVY },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80 },
    })),
  }))

  // Tracks the previous row's resident so we can detect exactly where a
  // new resident's block of records starts within this combined table.
  let previousResidentId: string | undefined

  entries.forEach((entry, idx) => {
    // In the combined (residentColumn) table, entries arrive grouped by
    // resident (see the flatMap that builds this array), so a change in
    // residentId from the row above always marks the first record of a
    // new resident's block. Highlight that row distinctly so it's easy to
    // see at a glance where one resident's records end and the next
    // begins, instead of relying only on the resident name/ID text.
    const isFirstForResident = residentColumn && entry.residentId !== previousResidentId
    if (residentColumn) previousResidentId = entry.residentId

    const shading = isFirstForResident
      ? { type: ShadingType.SOLID, color: LIGHT_GOLD }
      : idx % 2 === 0
        ? { type: ShadingType.SOLID, color: ROW_ALT }
        : { type: ShadingType.CLEAR, color: WHITE }

    const cells: TableCell[] = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), font: "Times New Roman", size: 20, bold: true, color: NAVY })], alignment: AlignmentType.CENTER })],
        width: { size: 400, type: WidthType.DXA },
        shading, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 50, right: 50 },
      }),
    ]

    if (residentColumn) {
      cells.push(
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: entry.residentName || "N/A", bold: true, font: "Times New Roman", size: 20, color: NAVY })] })],
          width: { size: 1800, type: WidthType.DXA },
          shading, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: entry.residentId || "N/A", font: "Times New Roman", size: 20 })] })],
          width: { size: 1000, type: WidthType.DXA },
          shading, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: (entry.location && entry.location !== "N/A") ? entry.location : "N/A", font: "Times New Roman", size: 20 })] })],
          width: { size: 1200, type: WidthType.DXA },
          shading, verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
        })
      )
    }

    cells.push(
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: entry.dateTime || "N/A", font: "Times New Roman", size: 20 })] })],
        width: { size: residentColumn ? 1300 : 2000, type: WidthType.DXA },
        shading, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: entry.value, bold: true, font: "Times New Roman", size: 20, color: "B45309" })] })],
        width: { size: residentColumn ? 1500 : 2600, type: WidthType.DXA },
        shading, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: entry.reason, font: "Times New Roman", size: 20 })] })],
        width: { size: residentColumn ? 1800 : 4000, type: WidthType.DXA },
        shading, verticalAlign: VerticalAlign.TOP,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
      })
    )

    rows.push(new TableRow({ children: cells }))
  })

  return new Table({
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
  })
}

export async function POST(request: NextRequest) {
  try {
    const { results, groupBy, fileName } = (await request.json()) as {
      results: VitalExceptionResult[]
      groupBy?: "resident" | "category"
      fileName: string
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "No results to export" }, { status: 400 })
    }

    const byCategory = groupBy === "category"
    const totalEntries = results.reduce((s, r) => s + r.groups.reduce((gs, g) => gs + g.entries.length, 0), 0)
    const categories = byCategory ? pivotByExceptionType(results) : []
    console.log(`[vital-exception-report-export] Building document (grouped by ${byCategory ? "exception type" : "resident"}) for ${results.length} resident(s), ${totalEntries} flagged reading(s)…`)
    const startedAt = Date.now()
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
          new TextRun({ text: "Vital ", bold: true, font: "Times New Roman", size: 52, color: GOLD }),
          new TextRun({ text: "Exception Report", bold: true, font: "Times New Roman", size: 52, color: NAVY }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: byCategory
              ? "Vital sign exceptions grouped by exception type"
              : "Residents with vital sign readings outside the expected range",
            font: "Times New Roman", size: 22, color: GRAY, italics: true,
          }),
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
                    new TextRun({ text: byCategory ? String(categories.length) : String(results.length), bold: true, font: "Times New Roman", size: 36, color: WHITE }),
                    new TextRun({ text: byCategory ? "  EXCEPTION TYPE" + (categories.length !== 1 ? "S" : "") : "  RESIDENT" + (results.length !== 1 ? "S" : ""), font: "Times New Roman", size: 20, color: "C5D1E8" }),
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
                    new TextRun({ text: "  FLAGGED VITAL READINGS", font: "Times New Roman", size: 20, color: "C5D1E8" }),
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

    if (byCategory) {
      // ── EACH EXCEPTION TYPE ──────────────────────────────────────────────
      for (let ci = 0; ci < categories.length; ci++) {
        const category = categories[ci]
        const totalForCategory = category.residents.reduce((s, r) => s + r.entries.length, 0)

        // Category navy banner
        children.push(
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: category.vitalType, bold: true, font: "Times New Roman", size: 32, color: WHITE })],
                        spacing: { before: 60, after: 40 },
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: category.thresholdText, font: "Times New Roman", size: 20, color: "C5D1E8" })],
                        spacing: { after: 20 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: category.residents.length + " resident" + (category.residents.length !== 1 ? "s" : "") + " flagged    ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                          new TextRun({ text: "\u2502    " + totalForCategory + " reading" + (totalForCategory !== 1 ? "s" : ""), bold: true, font: "Times New Roman", size: 20, color: GOLD }),
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
          }),
          spacer(100)
        )

        // One combined table for every resident flagged under this exception type
        const flatEntries = category.residents.flatMap((r) =>
          r.entries.map((e) => ({ ...e, residentName: r.residentName, residentId: r.residentId, location: r.location }))
        )

        children.push(
          buildEntriesTable(flatEntries, true),
          spacer(ci < categories.length - 1 ? 480 : 120)
        )
      }
    } else {
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
                          new TextRun({
                            text:
                              "Resident ID: " + resident.residentId + "    " +
                              (resident.location && resident.location !== "N/A" ? "Location: " + resident.location + "    " : "") +
                              (resident.admissionDate ? "DOA: " + resident.admissionDate + "    " : ""),
                            font: "Times New Roman", size: 20, color: "C5D1E8",
                          }),
                        ],
                        spacing: { after: 20 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({ text: resident.groups.length + " vital" + (resident.groups.length !== 1 ? "s" : "") + " flagged    ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                          new TextRun({ text: "\u2502    " + flaggedCount + " reading" + (flaggedCount !== 1 ? "s" : ""), bold: true, font: "Times New Roman", size: 20, color: GOLD }),
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

        // Each flagged vital type
        for (let gi = 0; gi < resident.groups.length; gi++) {
          const group = resident.groups[gi]

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
                          new TextRun({ text: group.vitalType + ":  ", bold: true, font: "Times New Roman", size: 20, color: GOLD }),
                          new TextRun({ text: group.thresholdText, font: "Times New Roman", size: 20, color: "374151", italics: true }),
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

          children.push(
            buildEntriesTable(group.entries, false),
            spacer(gi < resident.groups.length - 1 ? 200 : 0)
          )
        }

        children.push(spacer(ri < results.length - 1 ? 480 : 120))
      }
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
    console.log(`[vital-exception-report-export] Document built in ${Date.now() - startedAt}ms, ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=\"vital-exception-report-" + Date.now() + ".docx\"",
      },
    })

  } catch (error) {
    console.error("[vital-exception-report-export] Error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: "Export failed", details: message }, { status: 500 })
  }
}