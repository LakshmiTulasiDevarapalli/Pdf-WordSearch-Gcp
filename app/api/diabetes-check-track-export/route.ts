import { type NextRequest, NextResponse } from "next/server"
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableCell, TableRow,
  AlignmentType, WidthType,
  BorderStyle, VerticalAlign, ShadingType,
  convertInchesToTwip,
} from "docx"

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
    const { results, fileName } = (await request.json()) as {
      results: DiabetesTrackResult[]
      fileName: string
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "No results to export" }, { status: 400 })
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
          new TextRun({ text: "Diabetes ", bold: true, font: "Times New Roman", size: 52, color: GOLD }),
          new TextRun({ text: "Check & Track Report", bold: true, font: "Times New Roman", size: 52, color: NAVY }),
        ],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Diabetes diagnoses (ICD-10 E08\u2013E11) cross-referenced against Blood Glucose Monitor readings", font: "Times New Roman", size: 22, color: GRAY, italics: true }),
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
                    new TextRun({ text: "  FLAGGED DIABETES DIAGNOSES", font: "Times New Roman", size: 20, color: "C5D1E8" }),
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
                        new TextRun({ text: "Location: ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                        new TextRun({ text: (resident.location || "N/A") + "    ", font: "Times New Roman", size: 20, color: WHITE }),
                        new TextRun({ text: "\u2502    Status: ", bold: true, font: "Times New Roman", size: 20, color: "C5D1E8" }),
                        new TextRun({ text: (resident.admissionDate || "N/A") + "    ", font: "Times New Roman", size: 20, color: WHITE }),
                        new TextRun({ text: "\u2502    " + resident.groups.reduce((s,g)=>s+g.entries.length,0) + " diagnosis" + (resident.groups.reduce((s,g)=>s+g.entries.length,0) !== 1 ? "es" : ""), bold: true, font: "Times New Roman", size: 20, color: GOLD }),
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

      // Each compliance issue group
      for (let gi = 0; gi < resident.groups.length; gi++) {
        const group = resident.groups[gi]
        const groupLabel = resident.groups.length > 1 ? "Issue " + (gi + 1) + ":  " : "\u25B6  Missing Glucose Readings:  "

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
              children: [new Paragraph({ children: [new TextRun({ text: "Diagnosis Date", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
              width: { size: 2000, type: WidthType.DXA },
              shading: { type: ShadingType.SOLID, color: NAVY },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 80, bottom: 80 },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: "Diagnosis", bold: true, color: WHITE, font: "Times New Roman", size: 20 })], alignment: AlignmentType.CENTER })],
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
        "Content-Disposition": "attachment; filename=\"Diabetes-Check-Track-report-" + Date.now() + ".docx\"",
      },
    })

  } catch (error) {
    console.error("[diabetes-check-track-export] Error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}