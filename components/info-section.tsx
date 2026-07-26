"use client"

import type React from "react"
import {
  FileText, Pill, ClipboardList, Droplet, Activity, Syringe, HeartPulse, Candy,
} from "lucide-react"

interface ModuleInfo {
  key: string
  label: string
  icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>
  roles: ("Admin" | "Viewer")[]
  inputFiles: { name: string; hint: string }[]
  conditions: string[]
  parameters: string[]
}

const MODULES: ModuleInfo[] = [
  {
    key: "antibiotics-check",
    label: "Antibiotics Stewardship",
    icon: Syringe,
    roles: ["Admin"],
    inputFiles: [{ name: "1 PDF file", hint: "Resident order report (with Category, Status, and Revision Date columns)" }],
    conditions: [
      "Flags orders through two independent paths — a resident can be flagged by either, and both can appear in the same report.",
      "Path 1 (Urinary/UTI/sepsis/bacteremia clusters): finds antibiotic orders by matching the order text against a built-in list of common antibiotic drug names (generic and brand).",
      "Drops orders that are topical (applied to the skin) or are actually vaccines (e.g. Prevnar, Comirnaty), even if the drug name would otherwise match.",
      "Only looks at residents who have 2 or more antibiotic orders.",
      "Groups a resident's antibiotic orders into clusters where each order is at least 3 days after the one before it — orders closer together than that aren't treated as separate episodes.",
      "Within each cluster, only keeps the orders whose text mentions a urinary/UTI, sepsis, or bacteremia infection.",
      "A cluster is only flagged if it still has 2 or more of those infection-related orders left after that filter.",
      "Path 2 (Wound-related orders): finds any order whose text mentions \"wound\", with no minimum order count and no 3+ day gap requirement — a single wound-related order is enough to be flagged.",
      "For this path, the topical-route exclusion used in Path 1 does not apply, since most legitimate wound orders are applied topically.",
      "The only exclusion for wound orders is if the order is for a basic wound-care/dressing product — Bacitracin, Betadine, Dakin's (also matches \"Dakins\" without the apostrophe), Iodosorb, or Metronidazole — which are dropped since they're not treated as antibiotics of concern for this check.",
    ],
    parameters: [
      "No manual keyword selection — the antibiotic name list, the infection-condition list, and the wound-exclusion list are all built in and not user-editable.",
      "Path 1 only flags orders tied to urinary tract infections/UTI, sepsis, or bacteremia; other infection types aren't checked.",
      "Path 2 flags any order mentioning \"wound\", excluding Bacitracin, Betadine, Dakin's/Dakins, Iodosorb, and Metronidazole orders.",
      "This module doesn't report a resident's location or admission date — both are left blank in the results.",
    ],
  },
  {
    key: "bgm-compliance",
    label: "BGM Compliance Review",
    icon: Droplet,
    roles: ["Admin"],
    inputFiles: [
      { name: "Diagnosis PDF", hint: "Resident diagnosis / condition record" },
      { name: "Blood Sugar PDF", hint: "Blood Glucose Monitor (BGM) readings log" },
    ],
    conditions: [
      "Both the Diagnosis PDF and Blood Sugar PDF must be uploaded before processing can start.",
      "Looks for diabetes diagnoses in the Diagnosis PDF — specifically ICD-10 codes E08–E11 (the codes used for Type 1/Type 2 diabetes and related conditions).",
      "Looks for blood sugar readings in the BGM log PDF — it can read either a bulk multi-resident table or a one-resident-per-report format, and combines both if present.",
      "Matches residents between the two files by name (not ID), so small spacing or capitalization differences don't cause a missed match.",
      "A resident is flagged if they have a qualifying diabetes diagnosis but zero recorded BGM readings — either because they're missing entirely from the blood sugar log, or they're listed there with no readings at all.",
      "Residents with at least one recorded reading are treated as compliant and left out of the results.",
      "Each flagged resident's entries list their diabetes diagnoses (not their blood sugar readings) — the diagnosis text, its date, and its rank/classification (e.g. Primary, Secondary, Dx 4).",
    ],
    parameters: [
      "No manual keyword selection — matching is driven entirely by cross-referencing diagnosis codes against BGM log entries.",
      "Only ICD-10 codes E08, E09, E10, and E11 count as a qualifying diabetes diagnosis; other diagnoses on the same resident are ignored.",
    ],
  },
  {
    key: "diabetes-check-track",
    label: "Diabetes Check and Track",
    icon: Activity,
    roles: ["Admin"],
    inputFiles: [
      { name: "Medication PDF", hint: "eMAR / medication administration record" },
      { name: "Diagnosis PDF", hint: "Resident diagnosis / condition record" },
      { name: "Blood Sugar PDF", hint: "Blood Glucose Monitor (BGM) readings log" },
    ],
    conditions: [
      "All three files (Medication, Diagnosis, Blood Sugar) must be uploaded before processing can start.",
      "Starts from the Medication PDF — an Order Summary already filtered to Medication Class: ANTIDIABETICS — so every resident listed there is confirmed to be on a diabetes medication.",
      "Skips Empagliflozin (Jardiance) orders as evidence, since it's often prescribed for heart failure or kidney disease rather than diabetes, so its presence alone shouldn't count toward flagging.",
      "For each resident on antidiabetic medication, checks two things independently: do they have a matching diabetes diagnosis (ICD-10 E08–E11) on file, and do they have any glucose readings on file?",
      "A resident is flagged if EITHER check fails — missing diagnosis, missing readings, or both — not just missing readings.",
      "If the diagnosis is missing, the flagged entries list their medication orders as evidence. If readings are missing, the entries list their diagnoses (or medications, if there's no diagnosis either).",
      "Residents fully covered — on medication, with a diagnosis on file, and with recorded readings — are left out of the results.",
    ],
    parameters: [
      "No manual keyword selection — the Medication PDF (pre-filtered to ANTIDIABETICS) is the starting list; diagnosis and blood sugar files are checked against it.",
      "Only ICD-10 codes E08–E11 count as a qualifying diabetes diagnosis.",
      "Residents are matched across all three files by name (not ID).",
    ],
  },
  {
    key: "medication",
    label: "Medication Availability",
    icon: Pill,
    roles: ["Admin"],
    inputFiles: [{ name: "1 PDF file", hint: "Same PDF/format as Progress Notes (eMAR)" }],
    conditions: [
      "Looks for entries in the PDF where the type is \"Default PN Type for eMAR\".",
      "Only keeps entries that clearly describe a medication (mentions things like tablet, capsule, mg, dose, injection, insulin, etc.) and are long enough to be a real note — very short entries are skipped.",
      "Skips sliding-scale entries, \"as needed\" (PRN) entries, and conditional hold instructions (e.g. \"Hold for SBP < 100\"), since these aren't true duplicates.",
      "Groups entries for the same resident that start with the same note text.",
      "If two entries in the same group happen within 3 hours of each other, they're treated as one routine administration and dropped rather than counted as a duplicate.",
      "A medication is only flagged as repeated/duplicate if more than one entry is left after that 3-hour check.",
    ],
    parameters: [
      "No keyword selection — the check always looks for note type \"Default PN Type for eMAR\".",
      "Entries are matched to the same group by resident name plus the start of the note text (first 80 characters, cleaned up and lowercased).",
      "No admin/viewer distinction on this module — same logic runs for every role.",
    ],
  },
  {
    key: "order-listing",
    label: "Order Listing",
    icon: ClipboardList,
    roles: ["Admin"],
    inputFiles: [{ name: "1 PDF file", hint: "Order Listing / physician orders report" }],
    conditions: [
      "Splits the PDF into one row per resident by finding name patterns like \"Lastname, Firstname (12345)\" — works whether names are ALL CAPS or Title Case.",
      "Everything between one resident's name and the next becomes that row's order details.",
      "Reads the order status for each row: Active, Completed, or Discontinued (shown as N/A if none of those words are found).",
      "Only keeps a row if there's real order text left after removing the status, category, dates, and Y/N flags — very short leftovers are skipped.",
      "Matches keywords as whole words only, so a keyword won't match text buried inside another word — except \"RAY\", which is also allowed to match \"Xray\"/\"X-ray\".",
      "\"1:1\" won't match if it's immediately followed by another digit, so times like 1:15 aren't picked up.",
      "When exporting, two rows are only treated as duplicates if they came from the exact same spot in the PDF — so two separate orders that happen to read identically (e.g. the same X-ray ordered twice) are both kept, not merged.",
    ],
    parameters: [
      "32 default keywords (e.g. RAY, CXR, ULTRA, EKG, FALL, FRACT, WANDER, ELOP, SUI, DNR, SMOK…) — all turned on by default.",
      "Admins can turn keywords on/off; Viewers always search the full default list.",
      "Unlike Progress Notes, this module doesn't capture a resident's location — only name, order status, and dates.",
    ],
  },
  {
    key: "progress",
    label: "Progress Notes",
    icon: FileText,
    roles: ["Viewer", "Admin"],
    inputFiles: [{ name: "1 PDF file", hint: "Resident progress notes report" }],
    conditions: [
      "Finds every place a selected keyword appears in the PDF, matching only at the start of a word (e.g. \"HIT\" matches \"HIT\"/\"HITTING\" but not \"WHITE\" or \"EXHIBIT\").",
      "Skips \"Default PN Type for eMAR\" note blocks entirely (routine eMAR checklist notes), so they're never surfaced as a keyword match.",
      "30 of the 59 default keywords have their own tailored false-positive filters on top of the whole-word matching:",
      "CONCERN — skips ~40 routine template phrases like \"no concerns\", \"denies any new concern\", \"no behavioral concerns observed during the shift\", and \"concerning for malignancy\".",
      "INJURY — skips \"self injury\" / \"self-injury\".",
      "FOOD — skips administrative/medication contexts like \"give with food\", \"food and nutritional services\", \"food preferences\", \"food intake\".",
      "SWEL (swelling) — skips \"no swelling\", \"no edema or swelling noted\", and other \"no ... swelling\" negations.",
      "BURN — skips the medication name \"Burnoll\", the place name \"Glen Burnie\", and phrases like \"no complaints of burning with voiding\", \"denied pain or burning upon urination\", \"rectal burning\".",
      "DISCOLOR — skips \"no discoloration\", \"maroon discoloration\" (a routine wound-color descriptor), \"toenails discolored\".",
      "HURT — skips the person names \"Carlos Hurt\" and \"Hurt, Carita\".",
      "BRUIS (bruising) — skips \"no bruising\"/\"no bruises\", \"denies easy bruising\", \"monitor for bleeding or bruising\" and similar routine monitoring instructions.",
      "PAIN — skips \"denied pain or burning upon urination\" and \"monitor bony prominences for pain\".",
      "WANDER — skips the care-plan label \"Aggressive Behavior: Wandering\" and \"wandering in diseases\".",
      "SEX — skips the care-history label \"adult physical and sexual abuse\".",
      "ABUSE — skips clinical/administrative labels like \"Alcohol abuse\", \"Cocaine abuse\", \"Substance Abuse\", \"Prior polysubstance abuse\", the sexual-abuse-history label, and standalone \"Abuse:\" / \"Abuse/Neglect:\" fields.",
      "SUICIDE — skips the routine \"resident denies depressive symptoms ... suicidal ideation\" template phrase.",
      "OMBUDSMAN — skips administrative tracking phrases like \"sent to Ombudsman\".",
      "HIT — skips the medical history label \"History of HIT/heparin allergy\".",
      "BREAK — skips \"breakfast\", \"breakthrough\", \"breakdown\", and the clinical term \"break in skin integrity\".",
      "1:1 — skips time formats like \"01:13\" or \"1:15\", and routine activity-template phrases like \"1:1 social and sensory stimulation\".",
      "FIND — skips \"findings\" (plural), \"incidental finding\", \"find under assessment\".",
      "KILL — skips \"skill\"/\"skills\"/\"skilled\" and the proper names \"Killebrew\", \"Killian\", \"Killington\".",
      "CUT — skips \"Acute\", \"Subcutaneous\", \"Cutaneous\", \"Xerosis Cutis\".",
      "PACK — skips \"ice pack\", \"packed\", \"packet\", \"Z-pack\", \"pack per day\", \"packing strip\".",
      "LOS — skips \"losartan\", \"weight loss\"/\"wt loss\", \"hearing loss\", \"visual loss\"/\"vision loss\", \"blood loss\", \"tissue loss\", \"loss of appetite\", \"loss of consciousness\", \"loss of urine\".",
      "SMOK (smoking) — skips \"never smoker\", \"non-smoker\", \"former smoker\", \"quit smoking\", \"current smoker\", \"no history of smoking\", \"smoking status\" labels, and similar negated/administrative phrasing.",
      "LEAVE — skips \"Return from Leave\", \"leave open (to air)\", \"Leave heplock\".",
      "EXIT — skips \"exit communications\" / \"during exit communication\".",
      "MISSING — skips \"no missing teeth\".",
      "15 MIN — skips billing-time notes like \"Physician spent more than 15 mins\".",
      "911 — skips diagnosis codes that end in \"911\" (e.g. G40.911, C50.911, F03.911), device labels like \"Call 911 when used\", wound/diagnosis codes like \"911 NON-PRESSURE\", and any \"911\" written inside parentheses.",
      "CIGARETTE — skips the diagnosis label \"Nicotine Dependence, Cigarettes\".",
      "ALLEG — skips \"Allegra Allergy\" (a medication/allergy label).",
      "Skips any keyword match that falls inside a numbered list item (e.g. \"1) ...\", \"2. ...\"), across all keywords.",
      "Pulls out the full paragraph around each match, plus its page number and date (if there is one).",
      "Reads the resident's name, location, and admission date from labeled fields in the PDF (e.g. \"Resident Name: ...\"). If a field isn't there, it shows as \"Unknown\".",
      "Breaks the PDF into dated entries and labels each one as a Progress Note, Nursing Note, Care Plan, or Assessment when it can tell which. If it can't find dated entries, it treats the whole page as one entry.",
      "Drops near-duplicate entries — blocks with the same date and type whose wording overlaps more than 70% are treated as the same entry and only kept once.",
    ],
    parameters: [
      "59 default keywords (e.g. HIT, ALLEG, ABUSE, ALTERCATION, SUICIDE, WANDER, ELOPEMENT, BRUIS, NARCAN, 911, POLICE…) — all turned on by default.",
      "The built-in false-positive filters (word-boundary rule, per-keyword exclusion phrases, numbered-list skip, near-duplicate merge) are fixed and not user-editable — they apply the same way regardless of which keywords are selected.",
      "Admins can turn keywords on/off; Viewers always search the full default list.",
      "The Word export sorts results by keyword, skips duplicate matches, and shows totals for keywords matched and matches found — with each match highlighted.",
    ],
  },
  {
    key: "sugar-sense",
    label: "Sugar Sense",
    icon: Candy,
    roles: ["Admin"],
    inputFiles: [
      { name: "Medication PDF", hint: "eMAR / medication administration record" },
      { name: "Order Listing Vitals PDF", hint: "Blood glucose / vitals order listing log" },
    ],
    conditions: [
      "Both files (Medication, Order Listing Vitals) must be uploaded before processing can start.",
      "Starts from the Medication PDF — an Order Summary already filtered to Medication Class: ANTIDIABETICS — so every resident listed there is confirmed to be on a diabetes medication.",
      "Skips Empagliflozin (Jardiance) orders as evidence, since it's often prescribed for heart failure or kidney disease rather than diabetes, so its presence alone shouldn't count toward flagging.",
      "Excludes any resident whose medication notes mention \"sliding scale\" — their blood sugar is expected to swing based on the sliding-scale dosing itself, so they're left out of the report entirely.",
      "Excludes any resident whose medication notes mention \"subcutaneously\" — left out of the report entirely, the same as sliding-scale residents.",
      "For every remaining resident, pulls their blood sugar readings from the Order Listing Vitals PDF — it can read either a bulk multi-resident table or a one-resident-per-report format, and combines both if present.",
      "A resident is only included in the results if they have at least one blood sugar reading on file; residents with zero readings are left out.",
      "Only the top 3 highest blood sugar readings on record are surfaced per resident — not every reading, and not the most recent ones.",
    ],
    parameters: [
      "No manual keyword selection — the Medication PDF (pre-filtered to ANTIDIABETICS) is the starting list; the vitals file is checked against it.",
      "Exclusion terms — \"sliding scale\" and \"subcutaneously\" — are matched case-insensitively anywhere in a resident's medication notes and are not user-editable.",
      "Residents are matched across both files by name (not ID).",
      "Ranking is by reading value (highest first), capped at 3 entries per resident.",
    ],
  },
  {
    key: "vital-exception-report",
    label: "Vital Exception Report",
    icon: HeartPulse,
    roles: ["Viewer", "Admin"],
    inputFiles: [{ name: "1 PDF file", hint: "Weights and Vitals Summary report" }],
    conditions: [
      "Vital sign readings for Blood Pressure, Pulse, Respiration, O2 Sats, Blood Sugar, and Temperature are compared against expected threshold ranges. Other sections in the report (Weight, BMI Percentile, Height, Head Circumference, Pain Level, etc.) are present but not evaluated.",
      "A resident is only flagged for a given vital type if the out-of-range reading recurs 3 or more times in the report — a single one-off reading isn't flagged.",
      "Readings outside range are grouped by vital type, with the threshold text and every flagged entry (date/time, value, reason).",
      "Residents are identified by a structural anchor — resident ID, \"Location:\", and \"DOA:\" date — rather than by name pattern alone, so unusual name formatting (accents, suffixes) doesn't cause a resident's readings to be lost or merged into someone else's.",
    ],
    parameters: [
      "Threshold ranges: Blood Pressure — systolic above 170 or below 80 mmHg; Pulse — above 100 or below 55 bpm; Respiration — above 22 or below 14/min; O2 Sats — below 90%; Blood Sugar — above 300 or below 70 mg/dL; Temperature — above 99°F or below 95°F.",
      "Results can be viewed/exported grouped by Resident or by Exception Category.",
      "No manual keyword selection — thresholds are applied automatically per vital type.",
    ],
  },
]

function InfoCard({ mod, index }: { mod: ModuleInfo; index: number }) {
  const Icon = mod.icon
  return (
    <div style={{
      background: "rgba(255,255,255,0.92)",
      border: "1px solid rgba(201,168,76,0.28)",
      borderRadius: "18px",
      boxShadow: "0 4px 32px rgba(26,46,110,0.07), 0 1px 0 rgba(201,168,76,0.35) inset",
      backdropFilter: "blur(20px)",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 22px 0" }}>
        <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon style={{ width: "18px", height: "18px", color: "#fbbf24" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "10px", fontWeight: 700, color: "#b8860b", letterSpacing: "0.08em" }}>MODULE {String(index + 1).padStart(2, "0")}</span>
          <h3 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: "19px", color: "#1a2e6e", lineHeight: 1.15 }}>{mod.label}</h3>
        </div>
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {mod.roles.map((role) => (
            <span
              key={role}
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                borderRadius: "999px",
                padding: "3px 10px",
                color: role === "Admin" ? "#1a2e6e" : "#92400e",
                background: role === "Admin" ? "rgba(26,46,110,0.1)" : "rgba(201,168,76,0.15)",
                border: role === "Admin" ? "1px solid rgba(26,46,110,0.18)" : "1px solid rgba(201,168,76,0.3)",
              }}
            >
              {role}
            </span>
          ))}
        </div>
      </div>

      <div style={{ height: "1px", background: "linear-gradient(90deg,rgba(26,46,110,0.1),rgba(201,168,76,0.3),transparent)", margin: "14px 22px 0" }} />

      <div style={{ padding: "16px 22px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Input files */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Input Files Required
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {mod.inputFiles.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#1a2e6e,#4c1d95)", borderRadius: "6px", padding: "2px 8px", flexShrink: 0 }}>{f.name}</span>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>{f.hint}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Conditions
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {mod.conditions.map((c, i) => (
              <li key={i} style={{ fontSize: "13px", color: "#374151", lineHeight: 1.55 }}>{c}</li>
            ))}
          </ul>
        </div>

        {/* Parameters */}
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Parameters
          </div>
          <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {mod.parameters.map((p, i) => (
              <li key={i} style={{ fontSize: "13px", color: "#374151", lineHeight: 1.55 }}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function InfoSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {MODULES.map((mod, i) => (
        <InfoCard key={mod.key} mod={mod} index={i} />
      ))}
    </div>
  )
}