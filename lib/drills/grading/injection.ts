// Text addressed to the grader (docs/prd-drills.md "Checklist grading
// call"). Code fails checks for it only on a high-confidence match: the
// answer names the grader or the system, or tells whoever grades it to ignore
// the rubric, mark checks passed, or give full marks. An injection the grader
// suspects but this doesn't match is graded normally and flagged for a human
// to review. Pure.

const PATTERNS = [
  // Addressed to the grader or the system: "Grader:", "Note to the AI grader", "SYSTEM NOTE:".
  /\b(grader|grading model|evaluator)\b/i,
  // "SYSTEM:" opening a line or sentence, not "Health system: nurses".
  /(^|[\n.!?[(]\s*)system(\s+note)?\s*:/i,
  // Instructions about the grading.
  /\b(ignore|disregard)\b.{0,30}\b(rubric|instructions|checklist|checks|criteria)\b/i,
  /\b(award|give)\b.{0,20}\b(full|maximum|top)\s+(marks|credit|points|score)\b/i,
  /\b(mark|rate|grade)\b.{0,40}\b(every|all|each)\b.{0,15}\b(checks?|criteria)\b/i,
  /\b(rubric|checklist)\s+(has changed|says)\b/i,
];

export function addressedToGrader(text: string): boolean {
  return PATTERNS.some(p => p.test(text));
}
