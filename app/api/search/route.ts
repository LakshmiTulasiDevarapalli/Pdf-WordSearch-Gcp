import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

interface SearchBody {
  extractedTextUrl?: string
  extractedText?: string
  numPages: number
  fileName?: string
  keywords: string[]
}

interface SearchResult {
  paragraph: string
  pageNumber: number
  residentName: string
  location: string
  admissionDate: string
  effectiveDate: string
  type: string
  matchedKeywords: string[]
}

interface NoteBlock {
  residentName: string
  location: string
  admissionDate: string
  effectiveDate: string
  type: string
  paragraphText: string
  textPosition: number
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Search API called")

    const body: SearchBody = await request.json()
    const { extractedTextUrl, extractedText, numPages, fileName, keywords } = body

    // Validation
    if ((!extractedTextUrl && !extractedText) || !keywords || keywords.length === 0) {
      return NextResponse.json({ error: "Missing extractedTextUrl/extractedText or keywords" }, { status: 400 })
    }

    if (!numPages || numPages <= 0) {
      return NextResponse.json({ error: "Invalid numPages value" }, { status: 400 })
    }

    // Fetch or use provided text
    let textToSearch: string
    if (extractedTextUrl) {
      console.log("[v0] Fetching extracted text from Blob storage:", extractedTextUrl)
      const textResponse = await fetch(extractedTextUrl, {
        signal: AbortSignal.timeout(30000),
      })
      if (!textResponse.ok) {
        throw new Error(`Failed to fetch extracted text: ${textResponse.status}`)
      }
      textToSearch = await textResponse.text()
      console.log("[v0] Fetched text length:", textToSearch.length)
    } else {
      textToSearch = extractedText!
    }

    console.log("[v0] Text to search length:", textToSearch.length)
    console.log("[v0] Keywords to search:", keywords)

    const results = searchPDFWithSpec(textToSearch, keywords, numPages)

    console.log("[v0] Search complete, found", results.length, "matches")

    return NextResponse.json({ results, totalMatches: results.length })
  } catch (error: any) {
    console.error("[v0] Error:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}

function searchPDFWithSpec(text: string, keywords: string[], numPages: number): SearchResult[] {
  const results: SearchResult[] = []
  const blocks = parsePDFIntoBlocks(text)

  console.log("[v0] Parsed", blocks.length, "note blocks from PDF")

  const uniqueKeywords = Array.from(new Set(keywords.map((k) => k.toLowerCase()))).map(
    (k) => keywords.find((orig) => orig.toLowerCase() === k)!,
  )

  for (const keyword of uniqueKeywords) {
    const keywordLower = keyword.toLowerCase()

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]

      // --- Block-level exclusion for "Default PN Type for eMAR Note Text" ---
      // These are structured eMAR checklist notes (e.g. suicidal ideation questionnaires).
      // Their content is templated/routine and should never be surfaced as a keyword match.
      if (/default\s+pn\s+type\s+for\s+emar/i.test(block.type)) {
        continue
      }

      const paragraphLower = block.paragraphText.toLowerCase()

      const occurrences = findAllOccurrences(paragraphLower, keywordLower)

      if (occurrences.length > 0) {
        // --- Paragraph-level exclusion for the CONCERN keyword ---
        // Skip paragraphs that contain specific phrases:
        // - "questions regarding any part of the document" / "questions concerning any part of the document"
        // - "no behavioral concern observed during the shift" (singular/plural)
        // - "denies any new concern"
        // - "no concern"
        // - "no behavioral concerns" (standalone)
        // - "no new concerns"
        // - "The nurse did not voice any concerns"
        // - "notify wound team of any concerns"
        // - "Not attempted due to medical condition or safety concerns"
        // - "No other concerns at this time"
        // - "No RD concerns"
        // - "no pain and concerns voiced"
        // - "did not verbalize any concern"
        // - "has no care concerns at this time"
        // - "OTHER AREAS OF CONCERN: Must view"
        // - "no significant concerns"
        // - "No abdominal concern"
        // - "No abnormal concern too"
        // - "no complaints or concerns"
        // - "concerning for malignancy"
        // - "did not express any concerns" (and spelling variants)
        // - "No major concerns noted"
        // - "no behavioral problems or concerns"
        // - "SIGNS CONCERNING FOOD"
        if (keywordLower === "concern") {
          if (
            paragraphLower.includes("questions regarding any part of the document") ||
            paragraphLower.includes("has questions concerning any part of the document") ||
            paragraphLower.includes("no behavioral concern observed during the shift") ||
            paragraphLower.includes("no behavioral concerns observed during the shift") ||
            paragraphLower.includes("no behavioral concern(s) observed during the shift") ||
            paragraphLower.includes("for any question or concern call") ||
            paragraphLower.includes("for any questions or concerns, please call") ||
            paragraphLower.includes("denies any new concern") ||
            paragraphLower.includes("no new concerns") ||
            paragraphLower.includes("the nurse did not voice any concerns") ||
            paragraphLower.includes("notify wound team of any concerns") ||
            paragraphLower.includes("inform the wound team of any concerns or changes") ||
            paragraphLower.includes("no further concern") ||
            paragraphLower.includes("any conditions or concerns requiring referral to rehab?") ||
            paragraphLower.includes("no additional concerns noted") ||
            paragraphLower.includes("no concerns") ||
            paragraphLower.includes("not attempted due to medical condition or safety concerns") ||
            paragraphLower.includes("no other concerns at this time") ||
            paragraphLower.includes("no rd concerns") ||
            paragraphLower.includes("no pain and concerns voiced") ||
            paragraphLower.includes("did not verbalize any concern") ||
            paragraphLower.includes("has no care concerns at this time") ||
            paragraphLower.includes("other areas of concern: must view") ||
            paragraphLower.includes("no significant concerns") ||
            paragraphLower.includes("no abdominal concern") ||
            paragraphLower.includes("no abnormal concern") ||
            paragraphLower.includes("no complaints or concerns") ||
            paragraphLower.includes("concerning for malignancy") ||
            paragraphLower.includes("did not express any concerns") ||
            paragraphLower.includes("didnot express any concerns") ||
            paragraphLower.includes("didn't express any concerns") ||
            paragraphLower.includes("didnt express any concerns") ||
            paragraphLower.includes("no major concerns noted") ||
            paragraphLower.includes("no behavioral problems or concerns") ||
            paragraphLower.includes("signs concerning food") ||
            paragraphLower.includes("no complains and concerns") ||
            paragraphLower.includes("no complaints and concerns") ||
            paragraphLower.includes("no questions or concerns") ||
            paragraphLower.includes("if any urgent podiatric concerns") ||
            paragraphLower.includes("denies new concerns") ||
            paragraphLower.includes("bring forward questions or concerns") ||
            paragraphLower.includes("the resident denies depressive symptoms, anxiety exacerbation, hallucinations, delusions, suicidal ideation, homicidal ideation, or concerns related to abuse or neglect") ||
            paragraphLower.includes("including memory concerns") ||
            /\bno\s+concern\b/i.test(paragraphLower) ||
            /\bno\s+behavioral\s+concerns?\b/i.test(paragraphLower)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the INJURY keyword ---
        // Skip paragraphs that contain "self injury" or "self-injury".
        if (keywordLower === "injury") {
          if (
            /self[\s-]+injur/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the FOOD keyword ---
        // Skip paragraphs that only mention food in administrative/medication contexts.
        if (keywordLower === "food") {
          if (
            /give\s+with\s+food/i.test(block.paragraphText) ||
            /food\s+and\s+nutritional\s+services/i.test(block.paragraphText) ||
            /with\s+food/i.test(block.paragraphText) ||
            /food\s+preferences/i.test(block.paragraphText) ||
            /food\s+intake/i.test(block.paragraphText) ||
            /inhalation\s+of\s+food/i.test(block.paragraphText) ||
            /bring\s+the\s+food/i.test(block.paragraphText) ||
            /smearing\s+food/i.test(block.paragraphText) ||
            /holding\s+food\s+in\s+mouth[/\\]?cheeks?/i.test(block.paragraphText) ||
            /signs\s+concerning\s+food/i.test(block.paragraphText) ||
            /no\s+food\s+traps/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the SWEL keyword ---
        // Skip paragraphs that use "swelling" in a "no swelling" / routine clinical context.
        if (keywordLower === "swel") {
          if (
            /dry\s+and\s+intact\s+with\s+no\s+bleeding\s+or\s+swelling/i.test(block.paragraphText) ||
            /no\s+edema\s+or\s+swelling\s+noted/i.test(block.paragraphText) ||
            /erythema,\s+swelling/i.test(block.paragraphText) ||
            /graft\s+are?\s+intact\s+without\s+bleeding\s+or\s+swelling/i.test(block.paragraphText) ||
            /including\s+absence\s+of\s+redness,?\s+swelling/i.test(block.paragraphText) ||
            /no\s+signs\s+of\s+infiltration\s+redness,?\s+swelling/i.test(block.paragraphText) ||
            /localized\s+swelling/i.test(block.paragraphText) ||
            /leg\s+swelling\s+and\s+cerebral\s+edema/i.test(block.paragraphText) ||
            /abdominal\s+and\s+pelvic\s+swelling/i.test(block.paragraphText) ||
            /left\s+groin\s+swelling\s+subsiding/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the BURN keyword ---
        // Skip paragraphs where "burn" only appears in "BURNOLL" (a medication name).
        // Also skip paragraphs that mention "Glen Burnie" (a place name in Maryland).
        // Also skip paragraphs that contain "No complaints of burning with voiding".
        // Also skip paragraphs that contain "Resident is at Risk for burns due to unable to safely manage".
        // Also skip paragraphs that contain "denied pain or burning upon urination".
        if (keywordLower === "burn") {
          // If every occurrence of "burn" in the paragraph is part of "burnoll", skip it
          const burnMatches = block.paragraphText.match(/burn\w*/gi) || []
          const allAreBurnoll = burnMatches.every((m) => /^burnoll/i.test(m))
          if (burnMatches.length > 0 && allAreBurnoll) {
            continue
          }
          // Exclude "Glen Burnie" (Maryland city name)
          if (/glen\s+burni/i.test(block.paragraphText)) {
            continue
          }
          // Exclude "No complaints of burning with voiding"
          if (/no\s+complaints\s+of\s+burning\s+with\s+voiding/i.test(block.paragraphText)) {
            continue
          }
          // Exclude "Resident is at Risk for burns due to unable to safely manage"
          if (/resident\s+is\s+at\s+risk\s+for\s+burns?\s+due\s+to\s+unable\s+to\s+safely\s+manage/i.test(block.paragraphText)) {
            continue
          }
          // Exclude "denied pain or burning upon urination"
          if (/denied\s+pain\s+or\s+burning\s+upon\s+urination/i.test(block.paragraphText)) {
            continue
          }
          // Exclude "rectal burning"
          if (/rectal\s+burning/i.test(block.paragraphText)) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the DISCOLOR keyword ---
        // Skip paragraphs that mention "maroon discoloration" without other discoloration evidence.
        // Also skip paragraphs that contain "no discoloration", "no signs of discoloration",
        // "toenails discolored", or "Toenails elongated, discolored".
        if (keywordLower === "discolor") {
          if (
            /maroon\s+discolor/i.test(block.paragraphText) ||
            /no\s+discoloration/i.test(block.paragraphText) ||
            /no\s+signs\s+of\s+discoloration/i.test(block.paragraphText) ||
            /toenails?\s+discolored/i.test(block.paragraphText) ||
            /toenails?\s+elongated,?\s+discolored/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the HURT keyword ---
        // Skip paragraphs that contain the specific phrase "better off dead, or of hurting"
        // (and close variants), or "CARLOS HURT" (a person's name).
        if (keywordLower === "hurt") {
          if (
            /better\s+off\s+dead,?\s+or\s+of\s+hurting/i.test(block.paragraphText) ||
            /carlos\s+hurt/i.test(block.paragraphText) ||
            /hurt,\s*carita/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the BRUIS keyword ---
        // Skip paragraphs with "Monitor for bleeding/bruising", "Monitor for bleeding, bruising",
        // or "no bruises, swelling, discoloration".
        if (keywordLower === "bruis") {
          if (
            /monitor\s+for\s+bleeding\s*[/or]+\s*bruis/i.test(block.paragraphText) ||
            /monitor\s+for\s+bleeding,\s*bruis/i.test(block.paragraphText) ||
            /no\s+bruises?,\s+swelling,?\s+discoloration/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the PAIN keyword ---
        // Skip paragraphs that contain "denied pain or burning upon urination".
        if (keywordLower === "pain") {
          if (
            /denied\s+pain\s+or\s+burning\s+upon\s+urination/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the WANDER keyword ---
        // Skip paragraphs that contain "denied pain or burning upon urination Aggressive Behavior: Wandering"
        // (a routine care-plan template phrase).
        if (keywordLower === "wander") {
          if (
            /denied\s+pain\s+or\s+burning\s+upon\s+urination/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the SEX keyword ---
        // Skip paragraphs that contain "adult physical and sexual abuse" (a care history label).
        if (keywordLower === "sex") {
          if (
            /adult\s+physical\s+and\s+sexual\s+abuse/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the ABUSE keyword ---
        // Skip paragraphs containing the routine "resident denies" template phrase.
        if (keywordLower === "abuse") {
          if (
            /the\s+resident\s+denies\s+depressive\s+symptoms.*concerns\s+related\s+to\s+abuse\s+or\s+neglect/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the SUICIDE keyword ---
        // Skip paragraphs containing the routine "resident denies" template phrase.
        if (keywordLower === "suicide") {
          if (
            /the\s+resident\s+denies\s+depressive\s+symptoms.*suicidal\s+ideation/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the OMBUDSMAN keyword ---
        // Skip paragraphs that contain "6-108 sent to Ombudsman" (an administrative tracking phrase).
        if (keywordLower === "ombudsman") {
          if (
            /6-108\s+sent\s+to\s+ombudsman/i.test(block.paragraphText) ||
            /sent\s+to\s+the\s+ombudsman/i.test(block.paragraphText) ||
            /6-108\s+email\s+to\s+the\s+ombudsman/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the HIT keyword ---
        // Skip paragraphs that contain "History of HIT/heparin allergy" (a medical history label).
        if (keywordLower === "hit") {
          if (/history\s+of\s+hit[/\\]?heparin\s+allergy/i.test(block.paragraphText)) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the BREAK keyword ---
        // Skip paragraphs where every occurrence of "break" is part of "breakfast", "breakthrough",
        // or "breakdown" (all are common, benign words that should not trigger an incident alert).
        if (keywordLower === "break") {
          const breakMatches = block.paragraphText.match(/break\w*/gi) || []
          const allAreExcluded = breakMatches.length > 0 && breakMatches.every(
            (m) => /^breakfast/i.test(m) || /^breakthrough/i.test(m) || /^breakdown/i.test(m)
          )
          if (allAreExcluded) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the 1:1 keyword ---
        // Skip paragraphs that contain routine activity/stimulation template phrases.
        if (keywordLower === "1:1") {
          if (
            /activities\s+reviewed\s+activities\s+of\s+interest[/\\]?1:1\s+visits/i.test(block.paragraphText) ||
            /seen\s+for\s+1:1\s+social\s+and\s+sensory\s+stimulation/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the FIND keyword ---
        // Skip paragraphs that contain "incidental finding" (a radiology/clinical report phrase).
        if (keywordLower === "find") {
          if (/incidental\s+finding/i.test(block.paragraphText)) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the KILL keyword ---
        // Skip paragraphs where every occurrence of "kill" (in any casing) is either:
        //   1. Part of "skill" or its variants (e.g. "skills", "skilled", "skillful"), or
        //   2. Part of a known proper name that contains "kill" (e.g. "Killebrew", "Killian",
        //      "Killington") — matched case-insensitively so KILLEBREW, Killebrew, killebrew
        //      are all caught regardless of how pdfjs extracted the text casing.
        // IMPORTANT: use /gi so uppercase names like "KILLEBREW" are included in the match list.
        if (keywordLower === "kill") {
          const killMatches = block.paragraphText.match(/kill\w*/gi) || []
          const allAreExcluded = killMatches.length > 0 && killMatches.every(
            (m) =>
              /^skill/i.test(m)     ||   // skill, skills, skilled, skillful …
              /^killebrew/i.test(m) ||   // Killebrew, KILLEBREW, killebrew
              /^killian/i.test(m)   ||   // Killian
              /^killing(ton)?/i.test(m)  // Killington, Killing (place names)
          )
          if (allAreExcluded) {
            continue
          }
        }

        // --- Paragraph-level exclusion for the CUT keyword ---
        // Skip paragraphs that contain "Acute", "Subcutaneous", or "XEROSIS CUTIS".
        if (keywordLower === "cut") {
          if (
            /\bacute\b/i.test(block.paragraphText) ||
            /subcutaneous/i.test(block.paragraphText) ||
            /xerosis\s+cutis/i.test(block.paragraphText)
          ) {
            continue
          }
        }

        // --- Numbered list exclusion (applies to ALL keywords) ---
        // Reject any occurrence whose position falls inside a numbered list item
        // e.g. "1) The resident was hit" or "2. Verbal abuse noted" — the keyword
        // can be anywhere inside the item, not just immediately after the prefix.
        const listRanges = getNumberedListRanges(paragraphLower)
        const nonListOccurrences = occurrences.filter(({ index }) =>
          !listRanges.some(([start, end]) => index >= start && index < end)
        )

        if (nonListOccurrences.length === 0) continue

        const dedupedOccurrences = deduplicateOccurrencesByDistance(nonListOccurrences, 200)

        console.log(
          `[v0] ✓ Keyword "${keyword}" found ${occurrences.length} time(s) in block ${i + 1} (${block.residentName}) - creating ${dedupedOccurrences.length} result(s) after deduplication`,
        )

        for (const occurrence of dedupedOccurrences) {
          const contextText = extractContextAroundKeywordAtPosition(block.paragraphText, keyword, occurrence.index)

          // Improved page calculation with bounds checking
          const pageNumber = Math.max(
            1,
            Math.min(Math.floor((block.textPosition / text.length) * numPages) + 1, numPages),
          )

          results.push({
            paragraph: contextText,
            pageNumber,
            residentName: block.residentName,
            location: block.location,
            admissionDate: block.admissionDate,
            effectiveDate: block.effectiveDate,
            type: block.type,
            matchedKeywords: [keyword],
          })
        }
      }
    }
  }

  // Sort results by page number, then by resident name
  results.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) {
      return a.pageNumber - b.pageNumber
    }
    return a.residentName.localeCompare(b.residentName)
  })

  return results
}

function deduplicateOccurrencesByDistance(
  occurrences: Array<{ index: number }>,
  minDistance: number,
): Array<{ index: number }> {
  if (occurrences.length <= 1) return occurrences

  const deduplicated: Array<{ index: number }> = [occurrences[0]]

  for (let i = 1; i < occurrences.length; i++) {
    const lastKept = deduplicated[deduplicated.length - 1]
    const current = occurrences[i]

    // Only keep this occurrence if it's far enough from the last one we kept
    if (current.index - lastKept.index >= minDistance) {
      deduplicated.push(current)
    }
  }

  return deduplicated
}

/**
 * Returns an array of [start, end] ranges for each numbered list item in the text.
 * Matches patterns like "1)" "2." "12) " "3. " at word boundaries.
 * The range covers from the number prefix up to the start of the next numbered item
 * (or end of string), so any keyword found inside a range is part of a list item.
 */
function getNumberedListRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  // Only match 1-2 digit numbers followed by ) or . — avoids IDs like (22403)
  const listItemPattern = /(?:^|(?<=\n))[ \t]*(\d{1,2}[).]\s*)/g
  const matches = [...text.matchAll(listItemPattern)]
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length
    ranges.push([start, end])
  }
  return ranges
}

function findAllOccurrences(text: string, keyword: string): Array<{ index: number }> {
  const occurrences: Array<{ index: number }> = []

  let index = 0
  while (index < text.length) {
    const foundIndex = text.indexOf(keyword, index)
    if (foundIndex === -1) break

    // Validate the match is not a false positive
    if (isValidKeywordMatch(text, keyword, foundIndex)) {
      occurrences.push({ index: foundIndex })
    }
    index = foundIndex + 1 // Move past this occurrence to find the next one
  }

  return occurrences
}

/**
 * Validates that a keyword match is a genuine match using word-prefix logic.
 * 
 * Rules:
 * 1. The keyword must appear at the START of a word (not in the middle or end).
 *    e.g., "HIT" matches "HIT", "HITTING", "HITS" but NOT "WHITE" or "EXHIBIT".
 * 2. For numeric/colon keywords like "1:1", reject matches inside time formats like "11:15".
 */
function isValidKeywordMatch(text: string, keyword: string, matchIndex: number): boolean {
  const keywordLower = keyword.toLowerCase()

  // --- Word-prefix validation (applies to ALL keywords) ---
  // The character before the match must be a word boundary (start of string, space, punctuation, etc.)
  // This ensures the keyword is at the START of a word, not a substring in the middle.
  if (matchIndex > 0) {
    const charBefore = text[matchIndex - 1]
    // If charBefore is a letter or digit, the keyword is in the middle of a word -> reject
    // Exception: allow special-char keywords like "1:1" where preceding digit check is handled below
    const isAlphanumericKeyword = /^[a-z0-9]+$/i.test(keywordLower)
    const isSpecialKeyword = /[^a-z0-9]/i.test(keywordLower) // contains special chars like ":"
    
    if (isAlphanumericKeyword) {
      // For purely alphanumeric keywords (e.g., "HIT", "ABUSE", "15MIN")
      // charBefore must NOT be a letter or digit
      if (/[a-zA-Z0-9]/.test(charBefore)) {
        return false
      }
    } else if (isSpecialKeyword) {
      // For keywords with special characters (e.g., "1:1")
      // charBefore must NOT be a letter or digit (to avoid matching inside "11:15")
      if (/[a-zA-Z0-9]/.test(charBefore)) {
        return false
      }
    }

  }

  // --- Special validation for "1:1" keyword ---
  // Reject if the character AFTER "1:1" is a digit, meaning it's part of a time format like "1:13" or "01:13"
  // Valid: "1:1 monitoring", "on 1:1." — Invalid: "01:13", "1:15"
  if (keywordLower === "1:1") {
    const charAfter = text[matchIndex + keyword.length]
    if (charAfter !== undefined && /[0-9]/.test(charAfter)) {
      return false
    }
  }

  // --- Special validation for the HURT keyword ---
  // "hurt", "hurting", "hurts" etc. should match normally.
  // Additionally, the phrase "thoughts that you would be better off dead, or of hurting"
  // (and similar phrasing like "hurting yourself" / "hurting others") MUST match even though
  // "hurting" appears after "of" — this is already allowed by the word-prefix rule above.
  // No exclusion is needed; the word-prefix rule handles false positives (e.g. "unhurt").
  // This block is intentionally left as a no-op placeholder for clarity.
  if (keywordLower === "hurt") {
    // No additional exclusions — "Thoughts that you would be better off dead, or of hurting"
    // will match correctly via the standard prefix logic.
  }

  // --- Special validation for the FIND keyword ---
  // "find", "finding", "finds" etc. should match, but "findings" should NOT.
  // Also exclude "find under assessment", "FINDING OF LUNG FIELD", and "incidental finding".
  if (keywordLower === "find") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^ings\b/i.test(afterKeyword)) {
      return false
    }
    // Exclude "find under assessment"
    if (/^\s+under\s+assessment/i.test(afterKeyword)) {
      return false
    }
    // Exclude "FINDING OF LUNG FIELD"
    if (/^ing\s+of\s+lung\s+field/i.test(afterKeyword)) {
      return false
    }
    // Exclude "incidental finding" — "incidental" before "find"
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 15), matchIndex)
    if (/incidental\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the PACK keyword ---
  // "pack", "packs", "packing" etc. should match, but "ice pack", "ice packs", "ice packing" etc. should NOT.
  if (keywordLower === "pack") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 10), matchIndex)
    if (/ice\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the LOS keyword ---
  // "los", "loss", "lose", "losing", "lost" etc. should match, but "losartan", "weight loss", "air loss",
  // "HEARING LOSS", "VISUAL LOSS", "Visual loss", "blood loss", "loss of appetite" should NOT.
  if (keywordLower === "los") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^artan/i.test(afterKeyword)) {
      return false
    }
    // Exclude "loss of appetite"
    if (/^s\s+of\s+appetite/i.test(afterKeyword)) {
      return false
    }
    // Exclude "weight loss", "weight lose", "weight losing", "air loss", "hearing loss", "visual loss", "blood loss" etc.
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 20), matchIndex)
    if (/weight\s+$/i.test(textBeforeMatch) || /air\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/hearing\s+$/i.test(textBeforeMatch) || /visual\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/blood\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "wt loss" (abbreviation for weight loss)
    if (/wt\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "loss weight" — "los" matched inside "loss" followed by " weight"
    if (/^s\s+weight/i.test(afterKeyword)) {
      return false
    }
    // Exclude "lost weight" — "los" matched inside "lost" followed by " weight"
    if (/^t\s+weight/i.test(afterKeyword)) {
      return false
    }
    // Exclude "lost significant weight" — "los" inside "lost" followed by " significant weight"
    if (/^t\s+significant\s+weight/i.test(afterKeyword)) {
      return false
    }
    // Exclude "No loss of consciousness" and "HEMORRHAGE WITHOUT LOSS OF CONSCIOUSNESS"
    // Both contain "loss of consciousness" — check for "s of consciousness" after "los"
    if (/^s\s+of\s+consciousness/i.test(afterKeyword)) {
      return false
    }
    // Exclude "weight-loss" (hyphenated variant) — "weight-" before "los"
    if (/weight-$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Vision loss" — "vision" before "los"
    if (/vision\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "complete skin loss" — "complete skin" before "los"
    if (/complete\s+skin\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "age-related volume, loss" — "volume," or "volume" before "los"
    if (/volume,?\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "tissue loss" — "tissue" before "los"
    if (/tissue\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "MUSCULOSKELETAL" — "los" appears inside this word; caught by word-prefix rule,
    // but add explicit afterKeyword check for safety
    if (/^keletal/i.test(afterKeyword)) {
      return false
    }
    // Exclude "loss of urine" — "s of urine" after "los"
    if (/^s\s+of\s+urine/i.test(afterKeyword)) {
      return false
    }
    // Exclude "loss of protective sensation" — "s of protective" after "los"
    if (/^s\s+of\s+protective/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the BRUIS keyword ---
  // "bruis", "bruise", "bruised", "bruising" etc. should match,
  // but "no bruising", "no bruise", "no easy bruising", "no easy bruise", "monitor for bleeding or bruising",
  // "monitor for bruising/bleeding", "Monitor for bruises/bleeding" etc. should NOT.
  if (keywordLower === "bruis") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 50), matchIndex)
    if (/no\s+$/i.test(textBeforeMatch) || /no\s+easy\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "denies easy bruising"
    if (/denies\s+easy\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/monitor\s+for\s+bleeding\s+or\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "monitor for bruising/bleeding" and "Monitor for bruises/bleeding"
    if (/monitor\s+for\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Monitor for bleeding/bruising" (slash variant)
    if (/monitor\s+for\s+bleeding\s*\/\s*$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "no bruises, swelling, discoloration" — negation before the keyword
    if (/\bno\b.*$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the DISCOLOR keyword ---
  // "discolor", "discolored", "discoloration" etc. should match,
  // but "no skin discoloration", "no skin discolored", standalone "discoloration" (label-only) etc. should NOT.
  if (keywordLower === "discolor") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 25), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 20)
    if (/no\s+skin\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "maroon discoloration" — maroon is a normal tissue/wound color descriptor, not an incident
    if (/maroon\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude standalone "discoloration" used as a label/header (followed by colon or end-of-context)
    if (/^ation\s*[:\n]/i.test(afterKeyword) && /^\s*$/i.test(textBeforeMatch.trim() === "" ? "" : "x")) {
      // Only a soft hint — primary exclusion handled at paragraph level
    }
  }

  // --- Special validation for the SMOK keyword ---
  // "smok", "smoke", "smoking", "smoked" etc. should match,
  // but "never smok", "never smoke", "never smoking", "never smoked" etc. should NOT.
  // Also exclude "non-smoker", "Former remote smoker", "Former Smoker", "former smoker",
  // "if ever smoked", "quit smoking", "Current smoker", "No history of smoking",
  // "pack year smoking", "Unknown Smoking", "every day smoker", "down on smoking",
  // "Tobacco Use Active smoker", "Current every day smoker", "Heavy smoker",
  // "Denied history of smoking", "Smoking Status", and "smoking cessation".
  if (keywordLower === "smok") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 60), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 30)
    if (/never\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/non-$/i.test(textBeforeMatch) || /non\s*$/i.test(textBeforeMatch)) {
      return false
    }
    if (/former\s+remote\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Former Smoker" / "former smoker"
    if (/former\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "never smoker" (the word "never" anywhere in the window before "smok")
    if (/\bnever\b/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "if ever smoked" / "ever smoked"
    if (/if\s+ever\s+$/i.test(textBeforeMatch) || /ever\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "quit smoking"
    if (/quit\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Current smoker" / "Current every day smoker"
    if (/current\s+$/i.test(textBeforeMatch) || /current\s+every\s+day\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "smoking cessation"
    if (/^ing\s+cessation/i.test(afterKeyword)) {
      return false
    }
    // Exclude "denies drinking alcohol or smoking tobacco"
    if (/denies\s+drinking\s+alcohol\s+or\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "No history of smoking" / "Denied history of smoking"
    if (/no\s+history\s+of\s+$/i.test(textBeforeMatch) || /denied\s+history\s+of\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "pack year smoking" / "pack-year smoking" — "pack year" or "pack-year" before "smok"
    if (/pack[-\s]year\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Unknown Smoking" — "unknown" before "smok"
    if (/unknown\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "every day smoker" — "every day" before "smok"
    if (/every\s+day\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "down on smoking" — "down on" before "smok"
    if (/down\s+on\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Tobacco Use Active smoker" — "tobacco use active" before "smok"
    if (/tobacco\s+use\s+active\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Heavy smoker" — "heavy" before "smok"
    if (/heavy\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Smoking Status" — "smok" followed by "ing status"
    if (/^ing\s+status/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Denies smoking" — "denies" before "smok"
    if (/denies\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Daily smoker" — "daily" before "smok"
    if (/daily\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "chronic smoking history" — "chronic" before "smok"
    if (/chronic\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Does not smoke" — "does not" before "smok"
    if (/does\s+not\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Therapy Pack Unknown Smoking" — "unknown" before "smok" (already covered)
    // and "therapy pack unknown" before "smok" for extra specificity
    if (/therapy\s+pack\s+unknown\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the SWEL keyword ---
  // "swel", "swell", "swelling", "swelled" etc. should match,
  // but "no swelling", "no swell" etc. should NOT.
  if (keywordLower === "swel") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 40), matchIndex)
    if (/no\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "dry and intact with no bleeding or swelling" and "no edema or swelling"
    if (/no\s+bleeding\s+or\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/no\s+edema\s+or\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "intact with no ... swelling"
    if (/\bno\b.{0,30}$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the BURN keyword ---
  // "burn", "burning", "burned", "burns" etc. should match,
  // but "BURNOLL" (a medication name) should NOT.
  if (keywordLower === "burn") {
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 10)
    if (/^oll/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the LEAVE keyword ---
  // "leave", "leaving", "leaves" etc. should match,
  // but "Return from Leave", "leave open to air", "Leave open", "Leave heplock" etc. should NOT.
  if (keywordLower === "leave") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 20), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 20)
    if (/return\s+from\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/^\s+open/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Leave heplock"
    if (/^\s+heplock/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the EXIT keyword ---
  // "exit", "exiting", "exited" etc. should match,
  // but "included in exit communications" and "during exit communication" should NOT.
  if (keywordLower === "exit") {
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 30)
    if (/^\s+communications/i.test(afterKeyword)) {
      return false
    }
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 30), matchIndex)
    if (/included\s+in\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "during exit communication"
    if (/during\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the PACK keyword (additional rules) ---
  // Exclude "packed" and "packet" as well. Also exclude "pack with Dakin's", "Z-pack",
  // "pack with calcium alginate", "pack per day", "packing strip", and "Therapy Pack Unknown Smoking".
  if (keywordLower === "pack") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^ed\b/i.test(afterKeyword) || /^et/i.test(afterKeyword)) {
      return false
    }
    // Exclude "pack with Dakin's"
    if (/^\s+with\s+dakin/i.test(afterKeyword)) {
      return false
    }
    // Exclude "pack with calcium alginate"
    if (/^\s+with\s+calcium\s+alginate/i.test(afterKeyword)) {
      return false
    }
    // Exclude "pack per day"
    if (/^\s+per\s+day/i.test(afterKeyword)) {
      return false
    }
    // Exclude "packing strip" — "pack" followed by "ing strip"
    if (/^ing\s+strip/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Therapy Pack Unknown Smoking" — "pack" followed by " unknown smoking"
    if (/^\s+unknown\s+smoking/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Z-pack" — "z-" or "z " before "pack"
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 5), matchIndex)
    if (/z[-\s]$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the ABUSE keyword ---
  // "abuse", "abused", "abusing", "abusive" etc. should match,
  // but specific medical/administrative phrases should NOT:
  // "Alcohol abuse", "Cocaine abuse", "Substance Abuse", "Prior polysubstance abuse",
  // "Other psychoactive substance abuse", "HISTORY OF ADULT PHYSICAL AND SEXUAL ABUSE",
  // "Abuse :", "Abuse/Neglect :", "abuse," and "abuse ," should NOT match.
  if (keywordLower === "abuse") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 50), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 30)
    
    // Exclude "Alcohol abuse with intoxication"
    if (/alcohol\s+$/i.test(textBeforeMatch) && /^\s+with\s+intoxication/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Alcohol abuse" (any context)
    if (/alcohol\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Cocaine abuse"
    if (/cocaine\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Substance Abuse" — "substance" before "abuse"
    if (/substance\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Prior polysubstance abuse"
    if (/prior\s+polysubstance\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Other psychoactive substance abuse"
    if (/other\s+psychoactive\s+substance\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "HISTORY OF ADULT PHYSICAL AND SEXUAL ABUSE" / "adult physical and sexual abuse"
    // — "sexual" immediately before "abuse"
    if (/sexual\s+$/i.test(textBeforeMatch) || /physical\s+and\s+sexual\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Abuse :" or "Abuse:" patterns (standalone labels)
    if (/^\s*:/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Abuse/Neglect :" or "Abuse/Neglect:" patterns
    if (/^\/neglect\s*:/i.test(afterKeyword)) {
      return false
    }
    // Exclude "abuse," or "abuse ," (trailing comma pattern)
    if (/^[\s]*,/i.test(afterKeyword)) {
      return false
    }
    // Exclude "Has the patient been accused of abuse towards others" —
    // "accused of" before "abuse"
    if (/accused\s+of\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the MISSING keyword ---
  // "missing", "miss" etc. should match, but "no missing teeth" should NOT.
  if (keywordLower === "missing") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 15), matchIndex)
    if (/no\s+$/i.test(textBeforeMatch)) {
      const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 15)
      if (/^\s+teeth/i.test(afterKeyword)) {
        return false
      }
    }
  }

  // --- Special validation for the 15 MIN keyword ---
  // "15 min", "15 mins", "15 minutes" etc. should match, but "Physician spent 15 mins" should NOT.
  if (keywordLower === "15 min") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 40), matchIndex)
    // Exclude "Physician spent more than 15 mins"
    if (/physician\s+spent\s+(?:more\s+than\s+|greater\s+than\s+)?$/i.test(textBeforeMatch)) {
      return false
    }
    // Explicit check for "greater than" variant
    if (/greater\s+than\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Additional validation for colon-based keywords like "1:1" ---
  // For "1:1" keyword specifically, we need strict validation:
  // - ONLY match actual "1:1" one-to-one monitoring references
  // - REJECT any time format like "01:13", "1:15", "15:25", "11:15" etc.
  if (keywordLower === "1:1") {
    const charBefore = matchIndex > 0 ? text[matchIndex - 1] : ""
    const charAfter = matchIndex + keyword.length < text.length ? text[matchIndex + keyword.length] : ""

    // Reject if the character BEFORE is a digit (e.g., "01:13" contains "1:1" after "0")
    if (/\d/.test(charBefore)) {
      return false
    }

    // Reject if the character AFTER the keyword is a digit (e.g., "1:15" starts with "1:1")
    if (/\d/.test(charAfter)) {
      return false
    }

    // Check broader context for time patterns (HH:MM format)
    // Get surrounding text and look for time-like patterns
    const contextStart = Math.max(0, matchIndex - 10)
    const contextEnd = Math.min(text.length, matchIndex + keyword.length + 10)
    const surroundingText = text.substring(contextStart, contextEnd)
    
    // Detect common time patterns in the surrounding context
    // Time patterns: "01:13", "1:30", "15:25", "12:00", "11:15" etc.
    // These are typically HH:MM or H:MM format where both parts are 1-2 digits
    const timePatterns = [
      /\d{1,2}:\d{2}/,  // Standard time HH:MM or H:MM
      /\d{2}:\d{1,2}/, // Two digit hour with any minute
    ]
    
    for (const pattern of timePatterns) {
      const match = surroundingText.match(pattern)
      if (match) {
        // Check if the matched time pattern overlaps with our keyword position
        const matchStartInContext = surroundingText.indexOf(match[0])
        const matchEndInContext = matchStartInContext + match[0].length
        const keywordStartInContext = matchIndex - contextStart
        const keywordEndInContext = keywordStartInContext + keyword.length
        
        // If there's overlap between the time pattern and our keyword, reject
        if (keywordStartInContext < matchEndInContext && keywordEndInContext > matchStartInContext) {
          return false
        }
      }
    }
  } else if (/^\d+:\d+$/.test(keywordLower)) {
    // For other numeric colon patterns (not "1:1"), apply general digit checks
    const charBefore = matchIndex > 0 ? text[matchIndex - 1] : ""
    const charAfter = matchIndex + keyword.length < text.length ? text[matchIndex + keyword.length] : ""

    if (/\d/.test(charBefore) || /\d/.test(charAfter)) {
      return false
    }
  }

  // --- Special validation for the WANDER keyword ---
  // "wander", "wandering", "wandered" etc. should match,
  // but "Aggressive Behavior: Wandering" (a care-plan label) should NOT.
  if (keywordLower === "wander") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 30), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 30)
    if (/aggressive\s+behavior:\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "WANDERING IN DISEASES" — "wander" followed by "ing in diseases"
    if (/^ing\s+in\s+diseases/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the PAIN keyword ---
  // "pain" etc. should match,
  // but "monitor bony prominences for pain" should NOT.
  if (keywordLower === "pain") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 40), matchIndex)
    if (/monitor\s+bony\s+prominences\s+for\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the 911 keyword ---
  // "911" should match genuine emergency call references,
  // but "G40.911 EPILEPSY" (a diagnosis code), "C50.911" (a breast cancer diagnosis code),
  // "Call 911 when used" (a device label), "911 NON-PRESSURE" (a wound classification code),
  // and any occurrence of "911" inside parentheses e.g. (911), (9110) should NOT.
  if (keywordLower === "911") {
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 20)
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 10), matchIndex)
    // Exclude "G40.911 EPILEPSY" — "G40." before "911"
    if (/g40\.\s*$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "C50.911" — "C50." before "911"
    if (/c50\.\s*$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "F03.911" — "F03." before "911"
    if (/f03\.\s*$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Call 911 when used" — "when used" after "911"
    if (/^\s+when\s+used/i.test(afterKeyword)) {
      return false
    }
    // Exclude "911 NON-PRESSURE" — "non-pressure" after "911"
    if (/^\s+non-pressure/i.test(afterKeyword)) {
      return false
    }
    // Exclude "911 UNSPECIFIED DEMENTIA" — "unspecified dementia" after "911"
    if (/^\s+unspecified\s+dementia/i.test(afterKeyword)) {
      return false
    }
    // Exclude "9114" — digit immediately after "911"
    if (/^4/.test(afterKeyword)) {
      return false
    }
    // Exclude any "911" that appears inside parentheses e.g. (911), (9110), (911A) etc.
    // Check if "(" appears before and ")" appears after the match (with possible extra chars in between)
    if (/\(\s*$/.test(textBeforeMatch) || /\(\d*$/.test(textBeforeMatch)) {
      return false
    }
    if (/^[\d\w]*\s*\)/.test(afterKeyword)) {
      // Only exclude if there was an opening paren before this match
      const widerBefore = text.substring(Math.max(0, matchIndex - 20), matchIndex)
      if (/\([\d\w]*$/.test(widerBefore)) {
        return false
      }
    }
  }

  // --- Special validation for the CIGARETTE keyword ---
  // "cigarette", "cigarettes" etc. should match,
  // but "NICOTINE DEPENDENCE, CIGARETTES" (a diagnosis label) should NOT.
  if (keywordLower === "cigarette") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 30), matchIndex)
    // Exclude "NICOTINE DEPENDENCE, CIGARETTES" — "nicotine dependence," before "cigarette"
    if (/nicotine\s+dependence,?\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the ALLEG keyword ---
  // "alleg", "allegation", "alleged" etc. should match,
  // but "Allegra Allergy" (a medication/allergy label) should NOT.
  if (keywordLower === "alleg") {
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 20)
    // Exclude "Allegra Allergy" — "ra allergy" after "alleg"
    if (/^ra\s+allergy/i.test(afterKeyword)) {
      return false
    }
  }

  return true
}

function extractContextAroundKeywordAtPosition(
  paragraphText: string,
  keyword: string,
  keywordIndex: number,
  contextLines = 0,
): string {
  const keywordLower = keyword.toLowerCase()
  const textLower = paragraphText.toLowerCase()

  // Validate that keywordIndex is correct
  if (keywordIndex < 0 || keywordIndex >= paragraphText.length) {
    return paragraphText
  }

  // Check word count - if too long, extract context
  const words = paragraphText.split(/\s+/)
  const wordCount = words.length
  const shouldExtractContext = wordCount > 100

  // If paragraph is short (under 100 words), return it all
  if (!shouldExtractContext) {
    return paragraphText
  }

  console.log(`[v0] Long paragraph detected (${wordCount} words), extracting context around keyword "${keyword}"`)

  // Strategy 1: Try splitting by sentence markers (., !, ?)
  const sentences = splitIntoSentences(paragraphText)

  if (sentences.length > 3) {
    const result = extractSentenceContextAtPosition(sentences, paragraphText, keywordIndex, contextLines)
    if (result) {
      console.log(`[v0] Extracted ${result.count} sentences from ${sentences.length} total`)
      return result.text
    }
  }

  // Strategy 2: Use line breaks as separators (for multi-line paragraphs)
  const lines = paragraphText.split(/\n+/).filter((line) => line.trim().length > 0)

  if (lines.length > 3) {
    const result = extractLineContextAtPosition(lines, paragraphText, keywordIndex, contextLines)
    if (result) {
      console.log(`[v0] Extracted ${result.count} lines from ${lines.length} total`)
      return result.text
    }
  }

  // Strategy 3: Character-based extraction (fallback)
  const result = extractCharacterContext(paragraphText, keywordIndex, keyword.length)
  console.log(`[v0] Extracted character-based context (${result.length} chars from ${paragraphText.length} total)`)
  return result
}

function splitIntoSentences(text: string): string[] {
  const sentencePattern = /[.!?]+\s+/g
  const sentences: string[] = []
  const sentenceStarts: number[] = [0]

  let match
  while ((match = sentencePattern.exec(text)) !== null) {
    sentenceStarts.push(match.index + match[0].length)
  }

  for (let i = 0; i < sentenceStarts.length; i++) {
    const start = sentenceStarts[i]
    const end = i < sentenceStarts.length - 1 ? sentenceStarts[i + 1] : text.length
    sentences.push(text.substring(start, end))
  }

  return sentences
}

function extractSentenceContextAtPosition(
  sentences: string[],
  fullText: string,
  keywordIndex: number,
  contextLines: number,
): { text: string; count: number } | null {
  let matchSentenceIndex = -1
  let currentPos = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentenceStart = currentPos
    const sentenceEnd = currentPos + sentences[i].length

    if (keywordIndex >= sentenceStart && keywordIndex < sentenceEnd) {
      matchSentenceIndex = i
      break
    }

    currentPos = sentenceEnd
  }

  if (matchSentenceIndex === -1) {
    return null
  }

  const startIndex = Math.max(0, matchSentenceIndex - contextLines)
  const endIndex = Math.min(sentences.length, matchSentenceIndex + contextLines + 1)
  const contextSentences = sentences.slice(startIndex, endIndex)

  let result = contextSentences.join("")

  const MAX_CONTEXT_CHARS = 250
  if (result.length > MAX_CONTEXT_CHARS) {
    const keywordPosInResult = keywordIndex - sentences.slice(0, startIndex).join("").length
    if (keywordPosInResult >= 0 && keywordPosInResult < result.length) {
      const halfLimit = MAX_CONTEXT_CHARS / 2
      const extractStart = Math.max(0, keywordPosInResult - halfLimit)
      const extractEnd = Math.min(result.length, keywordPosInResult + halfLimit)
      result = result.substring(extractStart, extractEnd)

      if (extractStart > 0) result = "... " + result
      if (extractEnd < result.length) result = result + " ..."
    } else {
      result = result.substring(0, MAX_CONTEXT_CHARS) + " ..."
    }
  }

  if (startIndex > 0 && !result.startsWith("...")) {
    result = "... " + result
  }
  if (endIndex < sentences.length && !result.endsWith("...")) {
    result = result + " ..."
  }

  return { text: result.trim(), count: contextSentences.length }
}

function extractLineContextAtPosition(
  lines: string[],
  fullText: string,
  keywordIndex: number,
  contextLines: number,
): { text: string; count: number } | null {
  let matchLineIndex = -1
  let currentPos = 0

  for (let i = 0; i < lines.length; i++) {
    const lineStart = currentPos
    const lineEnd = currentPos + lines[i].length

    if (keywordIndex >= lineStart && keywordIndex < lineEnd) {
      matchLineIndex = i
      break
    }

    currentPos = lineEnd + 1
  }

  if (matchLineIndex === -1) {
    return null
  }

  const startIndex = Math.max(0, matchLineIndex - contextLines)
  const endIndex = Math.min(lines.length, matchLineIndex + contextLines + 1)
  const contextLinesExtracted = lines.slice(startIndex, endIndex)

  let result = contextLinesExtracted.join("\n")

  const MAX_CONTEXT_CHARS = 250
  if (result.length > MAX_CONTEXT_CHARS) {
    const keywordPosInResult = keywordIndex - lines.slice(0, startIndex).join("\n").length
    if (keywordPosInResult >= 0 && keywordPosInResult < result.length) {
      const halfLimit = MAX_CONTEXT_CHARS / 2
      const extractStart = Math.max(0, keywordPosInResult - halfLimit)
      const extractEnd = Math.min(result.length, keywordPosInResult + halfLimit)
      result = result.substring(extractStart, extractEnd)

      if (extractStart > 0) result = "... " + result
      if (extractEnd < result.length) result = result + " ..."
    } else {
      result = result.substring(0, MAX_CONTEXT_CHARS) + " ..."
    }
  }

  if (startIndex > 0 && !result.startsWith("...")) {
    result = "... " + result
  }
  if (endIndex < lines.length && !result.endsWith("...")) {
    result = result + " ..."
  }

  return { text: result.trim(), count: contextLinesExtracted.length }
}

function extractCharacterContext(text: string, keywordIndex: number, keywordLength: number): string {
  const contextChars = 125
  const startIndex = Math.max(0, keywordIndex - contextChars)
  const endIndex = Math.min(text.length, keywordIndex + keywordLength + contextChars)

  let result = text.substring(startIndex, endIndex)

  if (startIndex > 0) {
    result = "... " + result
  }
  if (endIndex < text.length) {
    result = result + " ..."
  }

  return result.trim()
}

function parsePDFIntoBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []

  const effectiveDatePattern = /Effective\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/gi
  const effectiveDateMatches = [...text.matchAll(effectiveDatePattern)]

  console.log("[v0] Found", effectiveDateMatches.length, "Effective Date markers")

  let lastEffectiveDate = ""
  let lastType = ""

  for (let i = 0; i < effectiveDateMatches.length; i++) {
    const match = effectiveDateMatches[i]
    const effectiveDatePos = match.index!
    const effectiveDate = match[1]

    const sectionStart = effectiveDatePos
    const nextSectionStart = i < effectiveDateMatches.length - 1 ? effectiveDateMatches[i + 1].index! : text.length

    const rawSectionText = text.substring(sectionStart, nextSectionStart)

    const authorMatch = rawSectionText.match(/Author:\s*[^\n]+\s*Signature:/i)
    const sectionEnd = authorMatch ? sectionStart + authorMatch.index! + authorMatch[0].length : nextSectionStart

    const sectionText = text.substring(sectionStart, sectionEnd)

    const residentName = extractResidentNameFromPosition(text, effectiveDatePos, sectionText)
    const location = extractLocationFromPosition(text, effectiveDatePos)
    const admissionDate = extractAdmissionDateFromPosition(text, effectiveDatePos)

    // Extract the Type field. Two patterns are needed:
    // 1. Types ending with "Note Text :" (e.g. "Default PN Type for eMAR Note Text :")
    //    — capture everything up to and including "Note Text", stopping before the colon.
    // 2. All other types — stop at double-space, known label, or end of line.
    const typeMatchNoteText = sectionText.match(/Type:\s*([\s\S]+?Note\s+Text)\s*:/i)
    const typeMatchGeneral = sectionText.match(/Type:\s*([^\n]+?)(?:\s{2,}|\bResident\b|Author:|Signature:|$)/i)
    const typeRaw = typeMatchNoteText
      ? typeMatchNoteText[1].trim()
      : typeMatchGeneral
        ? typeMatchGeneral[1].trim()
        : ""
    const type = typeRaw || lastType

    const paragraphText = cleanParagraphText(sectionText)

    if (effectiveDate) lastEffectiveDate = effectiveDate
    if (type) lastType = type

    if (paragraphText.trim().length > 0) {
      blocks.push({
        residentName,
        location,
        admissionDate,
        effectiveDate: effectiveDate || lastEffectiveDate,
        type: type || lastType,
        paragraphText,
        textPosition: effectiveDatePos,
      })
    }
  }

  console.log(`[v0] Total blocks created before deduplication: ${blocks.length}`)

  const deduplicatedBlocks = deduplicateBlocks(blocks)

  console.log(`[v0] Total blocks after deduplication: ${deduplicatedBlocks.length}`)
  return deduplicatedBlocks
}

function deduplicateBlocks(blocks: NoteBlock[]): NoteBlock[] {
  const uniqueBlocks: NoteBlock[] = []

  for (const block of blocks) {
    let isDuplicate = false

    for (const existing of uniqueBlocks) {
      if (existing.effectiveDate === block.effectiveDate && existing.type === block.type) {
        const existingPhrases = extractKeyPhrases(existing.paragraphText)
        const blockPhrases = extractKeyPhrases(block.paragraphText)

        let matchCount = 0
        for (const phrase of blockPhrases) {
          if (existingPhrases.includes(phrase)) {
            matchCount++
          }
        }

        const similarity = blockPhrases.length > 0 ? matchCount / blockPhrases.length : 0
        if (similarity > 0.7) {
          console.log(
            `[v0] Duplicate block detected (${Math.round(similarity * 100)}% match): ${block.effectiveDate} - ${block.type}`,
          )
          isDuplicate = true
          break
        }
      }
    }

    if (!isDuplicate) {
      uniqueBlocks.push(block)
    }
  }

  return uniqueBlocks
}

function extractKeyPhrases(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/\s+/g, " ").trim()
  const phrases: string[] = []

  const words = cleaned.split(" ")

  for (let i = 0; i < words.length - 2; i++) {
    const phrase3 = words.slice(i, i + 3).join(" ")
    if (phrase3.length >= 20) {
      phrases.push(phrase3)
    }

    if (i < words.length - 3) {
      const phrase4 = words.slice(i, i + 4).join(" ")
      if (phrase4.length >= 25) {
        phrases.push(phrase4)
      }
    }
  }

  return phrases
}

function extractResidentNameFromPosition(fullText: string, currentPos: number, sectionText: string): string {
  const searchStart = Math.max(0, currentPos - 5000)
  const textBefore = fullText.substring(searchStart, currentPos)

  const residentNamePattern = /Resident\s+Name:\s*([^\n]+?)(?:\s*Location:|$)/gi
  const matches = [...textBefore.matchAll(residentNamePattern)]

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return lastMatch[1].trim()
  }

  const footerMatch = sectionText.match(/([A-Z][A-Z\s,]+)\s+-\s+Page\s+\d+/i)
  if (footerMatch) {
    return footerMatch[1].trim()
  }

  return "N/A"
}

function extractLocationFromPosition(fullText: string, currentPos: number): string {
  const searchStart = Math.max(0, currentPos - 5000)
  const textBefore = fullText.substring(searchStart, currentPos)

  // Strategy 1: Find the most recent "Resident Name: ... Location: ... Admission Date:" pattern
  const fullHeaderPattern = /Resident\s+Name:\s*([^\n]+?)\s+Location:\s*(.+?)\s+Admission\s+Date:/gi
  const headerMatches = [...textBefore.matchAll(fullHeaderPattern)]

  if (headerMatches.length > 0) {
    const lastMatch = headerMatches[headerMatches.length - 1]
    const loc = lastMatch[2].trim()
    return loc === "-" || loc.length === 0 ? "N/A" : loc
  }

  // Strategy 2: Look for "Location:" that comes right after resident name/number pattern
  const afterResidentPattern = /$$\d+$$\s+Location:\s*(.+?)\s+Admission\s+Date:/gi
  const afterResidentMatches = [...textBefore.matchAll(afterResidentPattern)]

  if (afterResidentMatches.length > 0) {
    const lastMatch = afterResidentMatches[afterResidentMatches.length - 1]
    const loc = lastMatch[1].trim()
    return loc === "-" || loc.length === 0 ? "N/A" : loc
  }

  return "N/A"
}

function extractAdmissionDateFromPosition(fullText: string, currentPos: number): string {
  const searchStart = Math.max(0, currentPos - 5000)
  const textBefore = fullText.substring(searchStart, currentPos)

  const admissionPattern = /Admission\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/gi
  const matches = [...textBefore.matchAll(admissionPattern)]

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    return lastMatch[1]
  }

  return "N/A"
}

function cleanParagraphText(raw: string): string {
  let cleaned = raw

  cleaned = cleaned.replace(/^[\s\n]*Note\s+Text\s*:\s*/i, "")

  cleaned = cleaned.replace(/[A-Z][A-Z\s,]+\s+-\s+Page\s+\d+\s+of\s+\d+\s*$/gim, "")

  cleaned = cleaned.replace(/\s+/g, " ")
  cleaned = cleaned.trim()

  return cleaned
}