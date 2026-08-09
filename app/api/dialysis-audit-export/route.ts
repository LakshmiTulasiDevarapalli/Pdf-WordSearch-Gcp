import { type NextRequest, NextResponse } from "next/server"
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableCell, TableRow,
  AlignmentType, WidthType,
  BorderStyle, VerticalAlign, ShadingType,
  convertInchesToTwip,
} from "docx"

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
  // Only MISSING checklist items are present here — see search route.
  items: DialysisChecklistItem[]
}

interface DialysisAuditResult {
  residentName: string
  location: string
  admissionDate: string
  groups: DialysisGroup[]
  hasBothAccessTypes?: boolean
}

const NAVY       = "1B3A6B"
const GOLD       = "B8860B"
const LIGHT_GOLD = "FEF3C7"
const ROW_ALT    = "F0F4FF"
const WHITE      = "FFFFFF"
const GRAY       = "6B7280"
const GREEN      = "15803D"
const RED        = "B91C1C"
const LIGHT_RED  = "FEE2E2"

function spacer(pt = 120): Paragraph {
  return new Paragraph({ text: "", spacing: { after: pt } })
}

function noBorder() {
  return { style: BorderStyle.NONE, size: 0, color: WHITE }
}

function groupTitle(type: "av-graft" | "perma-cath"): string {
  return type === "perma-cath" ? "Dialysis Perma Cath Checklist" : "Dialysis AV Graft Checklist"
}

export async function POST(request: NextRequest) {
  try {
    const { results, fileName } = (await request.json()) as {
      results: DialysisAuditResult[]
      fileName: string
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "No results to export" }, { status: 400 })
    }

    const totalMissing = results.reduce(
      (s, r) => s + r.groups.reduce((gs, g) => gs + g.missingCount, 0), 0
    )
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
          new TextRun({ text: "Dialysis ", bold: true, font: "Times New Roman", size: 52, color: GOLD }),
          new TextRun({ text: "Audit Report", bold: true, font: "Times New Roman", size: 52, color: NAVY }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Dialysis AV Graft and Dialysis Perma Cath checklist compliance — present vs. missing orders", font: "Times New Roman", size: 22, color: GRAY, italics: true }),
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
                    new TextRun({ text: String(totalMissing), bold: true, font: "Times New Roman", size: 36, color: WHITE }),
                    new TextRun({ text: "  MISSING CHECKLIST ITEMS", font: "Times New Roman", size: 20, color: "C5D1E8" }),
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
      const totalItems = resident.groups.reduce((s, g) => s + g.totalItems, 0)
      const totalPresent = resident.groups.reduce((s, g) => s + g.presentCount, 0)
      const totalMissingForResident = resident.groups.reduce((s, g) => s + g.missingCount, 0)

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
                        new TextRun({ text: totalPresent + " of " + totalItems + " checklist items present    ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                        new TextRun({ text: "\u2502    " + totalMissingForResident + " missing", bold: true, font: "Times New Roman", size: 20, color: totalMissingForResident > 0 ? "FCA5A5" : GOLD }),
                        ...(resident.hasBothAccessTypes
                          ? [new TextRun({ text: "\u2502    \u26A0 HAS BOTH AV GRAFT & PERMA CATH", bold: true, font: "Times New Roman", size: 20, color: "FDE68A" })]
                          : []),
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

      if (resident.hasBothAccessTypes) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "This resident has both AV Graft/Fistula and Perma Cath orders on record — only the Perma Cath checklist is evaluated below.",
                italics: true, font: "Times New Roman", size: 18, color: "92400E",
              }),
            ],
            spacing: { before: 80, after: 60 },
          })
        )
      }

      // Each checklist group (AV Graft and/or Perma Cath)
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
                        new TextRun({ text: "\u25B6  " + groupTitle(group.type) + ":  ", bold: true, font: "Times New Roman", size: 20, color: GOLD }),
                        new TextRun({ text: group.presentCount + " of " + group.totalItems + " items present, " + group.missingCount + " missing", font: "Times New Roman", size: 20, color: "374151", italics: true }),
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
              width: { size: 700, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Missing Checklist Item", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
              width: { size: 8300, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
          ],
        }))

        // Data rows — every item here is missing (present items are excluded upstream)
        group.items.forEach((item, idx) => {
          const shading = { type: ShadingType.SOLID, color: LIGHT_RED }

          rows.push(new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), font: "Times New Roman", size: 20, bold: true, color: RED })], alignment: AlignmentType.CENTER })],
                width: { size: 700, type: WidthType.DXA },
                shading, verticalAlign: VerticalAlign.CENTER,
                margins: { top: 80, bottom: 80 },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: item.label, font: "Times New Roman", size: 20, bold: true, color: RED })] })],
                width: { size: 8300, type: WidthType.DXA },
                shading, verticalAlign: VerticalAlign.CENTER,
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
        "Content-Disposition": "attachment; filename=\"dialysis-audit-report-" + Date.now() + ".docx\"",
      },
    })

  } catch (error) {
    console.error("[dialysis-audit-export] Error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}