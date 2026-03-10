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
        if (keywordLower === "concern") {
          if (
            paragraphLower.includes("questions regarding any part of the document") ||
            paragraphLower.includes("has questions concerning any part of the document") ||
            paragraphLower.includes("no behavioral concern observed during the shift") ||
            paragraphLower.includes("no behavioral concerns observed during the shift") ||
            paragraphLower.includes("no behavioral concern(s) observed during the shift") ||
            paragraphLower.includes("denies any new concern") ||
            paragraphLower.includes("no new concerns") ||
            paragraphLower.includes("the nurse did not voice any concerns") ||
            paragraphLower.includes("notify wound team of any concerns") ||
            /\bno\s+concern\b/i.test(paragraphLower) ||
            /\bno\s+behavioral\s+concerns?\b/i.test(paragraphLower)
          ) {
            continue
          }
        }

        const dedupedOccurrences = deduplicateOccurrencesByDistance(occurrences, 200)

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

  // --- Special validation for the FIND keyword ---
  // "find", "finding", "finds" etc. should match, but "findings" should NOT.
  if (keywordLower === "find") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^ings\b/i.test(afterKeyword)) {
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
  // "HEARING LOSS", "VISUAL LOSS", "Visual loss" should NOT.
  if (keywordLower === "los") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^artan/i.test(afterKeyword)) {
      return false
    }
    // Exclude "weight loss", "weight lose", "weight losing", "air loss", "hearing loss", "visual loss" etc.
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 20), matchIndex)
    if (/weight\s+$/i.test(textBeforeMatch) || /air\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/hearing\s+$/i.test(textBeforeMatch) || /visual\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the BRUIS keyword ---
  // "bruis", "bruise", "bruised", "bruising" etc. should match,
  // but "no bruising", "no bruise", "no easy bruising", "no easy bruise", "monitor for bleeding or bruising",
  // "monitor for bruising/bleeding", "Monitor for bruises/bleeding" etc. should NOT.
  if (keywordLower === "bruis") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 35), matchIndex)
    if (/no\s+$/i.test(textBeforeMatch) || /no\s+easy\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/monitor\s+for\s+bleeding\s+or\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "monitor for bruising/bleeding" and "Monitor for bruises/bleeding"
    if (/monitor\s+for\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the DISCOLOR keyword ---
  // "discolor", "discolored", "discoloration" etc. should match,
  // but "no skin discoloration", "no skin discolored" etc. should NOT.
  if (keywordLower === "discolor") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 25), matchIndex)
    if (/no\s+skin\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the SMOK keyword ---
  // "smok", "smoke", "smoking", "smoked" etc. should match,
  // but "never smok", "never smoke", "never smoking", "never smoked" etc. should NOT.
  // Also exclude "non-smoker within the past 30 days", "Former remote smoker", and "Former Smoker"
  if (keywordLower === "smok") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 40), matchIndex)
    if (/never\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/non-$/i.test(textBeforeMatch) || /non\s*$/i.test(textBeforeMatch)) {
      return false
    }
    if (/former\s+remote\s+$/i.test(textBeforeMatch)) {
      return false
    }
    // Exclude "Former Smoker"
    if (/former\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the SWEL keyword ---
  // "swel", "swell", "swelling", "swelled" etc. should match,
  // but "no swelling", "no swell" etc. should NOT.
  if (keywordLower === "swel") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 15), matchIndex)
    if (/no\s+$/i.test(textBeforeMatch)) {
      return false
    }
  }

  // --- Special validation for the LEAVE keyword ---
  // "leave", "leaving", "leaves" etc. should match,
  // but "Return from Leave", "leave open to air", "Leave open" etc. should NOT.
  if (keywordLower === "leave") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 20), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 20)
    if (/return\s+from\s+$/i.test(textBeforeMatch)) {
      return false
    }
    if (/^\s+open/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the PACK keyword (additional rules) ---
  // Exclude "packed" and "packet" as well
  if (keywordLower === "pack") {
    const afterKeyword = text.substring(matchIndex + keyword.length)
    if (/^ed\b/i.test(afterKeyword) || /^et/i.test(afterKeyword)) {
      return false
    }
  }

  // --- Special validation for the ABUSE keyword ---
  // "abuse", "abused", "abusing", "abusive" etc. should match,
  // but specific medical phrases should NOT:
  // "Alcohol abuse with intoxication", "Prior polysubstance abuse", "Other psychoactive substance abuse",
  // "Abuse :", "Abuse/Neglect :", "abuse," and "abuse ," should NOT match.
  if (keywordLower === "abuse") {
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 40), matchIndex)
    const afterKeyword = text.substring(matchIndex + keyword.length, matchIndex + keyword.length + 30)
    
    // Exclude "Alcohol abuse with intoxication"
    if (/alcohol\s+$/i.test(textBeforeMatch) && /^\s+with\s+intoxication/i.test(afterKeyword)) {
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
    const textBeforeMatch = text.substring(Math.max(0, matchIndex - 25), matchIndex)
    if (/physician\s+spent\s+$/i.test(textBeforeMatch)) {
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

    const typeMatch = sectionText.match(/Type:\s*([^\n]+?)(?:\s{2,}|Note\s+Text\s*:|Resident|Author:|Signature:|$)/i)
    const type = typeMatch ? typeMatch[1].trim() : lastType

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
