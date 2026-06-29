import { type NextRequest, NextResponse } from "next/server"
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
  ShadingType,
} from "docx"

interface OrderSearchResult {
  pageNumber: number
  paragraph: string       // Order Summary
  residentName: string
  orderStatus: string
  matchedKeywords?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { results } = (await request.json()) as { results: OrderSearchResult[] }

    if (!results || results.length === 0) {
      return NextResponse.json({ error: "No results to export" }, { status: 400 })
    }

    const sections: (Paragraph | Table)[] = []

    // ── Title ──
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Order Listing Keyword Search Results",
            bold: true,
            font: "Times New Roman",
            size: 32,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    )

    // Group by keyword
    const resultsByKeyword = new Map<string, OrderSearchResult[]>()

    results.forEach((result) => {
      ;(result.matchedKeywords || []).forEach((keyword) => {
        if (!resultsByKeyword.has(keyword)) resultsByKeyword.set(keyword, [])
        const existing = resultsByKeyword.get(keyword)!
        const isDupe = existing.some(
          (r) => r.paragraph === result.paragraph && r.residentName === result.residentName,
        )
        if (!isDupe) existing.push(result)
      })
    })

    const totalMatches = results.length
    const totalKeywords = resultsByKeyword.size

    // ── Summary line ──
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Total Keywords Matched: ${totalKeywords} | Total Matches Found: ${totalMatches}`,
            bold: true,
            font: "Times New Roman",
            size: 24,
          }),
        ],
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 400 },
      }),
    )

    // ── One section per keyword ──
    Array.from(resultsByKeyword.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([keyword, keywordResults]) => {

        // Keyword heading
        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Category: ${keyword}`,
                bold: true,
                font: "Times New Roman",
                size: 28,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 300 },
          }),
        )

        // Count occurrences
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const countPattern =
          keyword === "1:1"
            ? new RegExp(`(?<![0-9])${escaped}(?![0-9])`, "gi")
            : new RegExp(escaped, "gi")

        const totalOccurrences = keywordResults.reduce((count, r) => {
          const m = r.paragraph.match(countPattern)
          return count + (m ? m.length : 0)
        }, 0)

        sections.push(
          new Paragraph({
            children: [
              new TextRun({ text: `Matches: ${totalOccurrences}`, font: "Times New Roman", size: 22 }),
            ],
            spacing: { after: 200 },
          }),
        )

        // ── Table ──
        const tableRows: TableRow[] = []

        // Header row — 3 columns: Match #, Resident Name, Order Summary, Order Status
        const headerCells = [
          { text: "Match #",       width: 500  },
          { text: "Resident Name", width: 2000 },
          { text: "Order Summary", width: 5500 },
          { text: "Order Status",  width: 1000 },
        ]

        tableRows.push(
          new TableRow({
            tableHeader: true,
            children: headerCells.map(({ text, width }) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text, bold: true, color: "FFFFFF", font: "Times New Roman", size: 22 }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                width: { size: width, type: WidthType.DXA },
                verticalAlign: VerticalAlign.CENTER,
                shading: { type: ShadingType.SOLID, color: "4472C4" },
              }),
            ),
          }),
        )

        // Data rows
        keywordResults.forEach((result, idx) => {
          const isEvenRow = idx % 2 === 0
          const rowShading = isEvenRow
            ? { type: ShadingType.SOLID, color: "F9F9F9" }
            : { type: ShadingType.CLEAR, color: "FFFFFF" }

          // Build highlighted text runs for Order Summary
          const splitPattern =
            keyword === "1:1"
              ? new RegExp(`((?<![0-9])${escaped}(?![0-9]))`, "gi")
              : new RegExp(`(${escaped})`, "gi")

          const parts = result.paragraph.split(splitPattern)
          const textRuns: TextRun[] = parts
            .filter((p) => p)
            .map((part) => {
              const matchPattern =
                keyword === "1:1"
                  ? new RegExp(`^(?<![0-9])${escaped}(?![0-9])$`, "i")
                  : new RegExp(`^${escaped}$`, "i")
              return new TextRun({
                text: part,
                highlight: matchPattern.test(part) ? "yellow" : undefined,
                font: "Times New Roman",
                size: 20,
              })
            })

          // Status badge colour
          const statusColor =
            result.orderStatus === "Active"       ? "1a7a1a" :
            result.orderStatus === "Discontinued"  ? "b30000" :
                                                     "555555"

          tableRows.push(
            new TableRow({
              children: [
                // Match #
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: `${idx + 1}`, font: "Times New Roman", size: 20 })],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  width: { size: 500, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  shading: rowShading,
                  margins: { top: 100, bottom: 100, left: 50, right: 50 },
                }),
                // Resident Name
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: result.residentName || "N/A",
                          bold: true,
                          font: "Times New Roman",
                          size: 20,
                        }),
                      ],
                    }),
                  ],
                  width: { size: 2000, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  shading: rowShading,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                }),
                // Order Summary (highlighted)
                new TableCell({
                  children: [new Paragraph({ children: textRuns })],
                  width: { size: 5500, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.TOP,
                  shading: rowShading,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                }),
                // Order Status
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: result.orderStatus || "N/A",
                          bold: true,
                          color: statusColor,
                          font: "Times New Roman",
                          size: 20,
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  width: { size: 1000, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  shading: rowShading,
                  margins: { top: 100, bottom: 100, left: 50, right: 50 },
                }),
              ],
            }),
          )
        })

        sections.push(
          new Table({
            rows: tableRows,
            width: { size: 9000, type: WidthType.DXA },
            layout: "fixed" as any,
            borders: {
              top:              { style: BorderStyle.SINGLE, size: 2, color: "4472C4" },
              bottom:           { style: BorderStyle.SINGLE, size: 2, color: "4472C4" },
              left:             { style: BorderStyle.SINGLE, size: 2, color: "4472C4" },
              right:            { style: BorderStyle.SINGLE, size: 2, color: "4472C4" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
              insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: "D0D0D0" },
            },
          }),
        )

        sections.push(new Paragraph({ text: "", spacing: { after: 300 } }))
      })

    const doc = new Document({
      sections: [{ properties: {}, children: sections }],
    })

    const buffer = await Packer.toBuffer(doc)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=order-listing-results.docx",
      },
    })
  } catch (error) {
    console.error("[order] Export error:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}