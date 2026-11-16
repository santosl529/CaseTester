// Prescription reasons (Matt, 15 Nov 2026): one plain-English line per mistake
// tag (the taxonomy's `reason_line`, e.g. "You made an arithmetic slip."), and
// a student's quote set in US punctuation — the closing point inside the
// quotation marks, never doubled. Shared by case, in-drill and diagnostic
// reasons so they read the same.
import { getMistakeTag } from './config';

const MAX_QUOTE_WORDS = 25;

export const reasonLine = (tag: string) => getMistakeTag(tag)!.reason_line;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// "…the last 25 words." in quotation marks: a long quote keeps its last words;
// trailing commas or semicolons go; a sentence end is added only if missing.
export function quoted(evidence: string): string {
  const words = evidence.trim().split(/\s+/);
  let q = words.length > MAX_QUOTE_WORDS ? `…${words.slice(-MAX_QUOTE_WORDS).join(' ')}` : words.join(' ');
  q = q.replace(/[,;:\s]+$/, '');
  if (!/[.!?…]$/.test(q)) q += '.';
  return `“${q}”`;
}

// A case finding: In your last case you said, “Margin fell 18%.” You mixed up percent and percentage points.
export const caseReason = (f: { tag: string; evidence: string } & Record<string, unknown>) => `In your last case you said, ${quoted(f.evidence)} ${reasonLine(f.tag)}`;

// A miss on another skill inside a drill set: In your last Mental math set, you made an arithmetic slip.
export const drillReason = (drillName: string, tag: string) => `In your last ${drillName} set, ${lowerFirst(reasonLine(tag))}`;

// The diagnostic: In the diagnostic: You divided by the wrong base. You made an arithmetic slip.
export const diagnosticReason = (tags: string[]) => `In the diagnostic: ${tags.map(reasonLine).join(' ')}`;
