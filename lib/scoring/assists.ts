// "Assisted ≠ covered" scoring attribution (docs/scoring-qa.md;
// docs/interviewer-behavior.md Rule 13). Stall-ladder assists are candidate
// PERFORMANCE data, not coverage gaps: a stage that was administered,
// laddered, and still failed was covered — it does not get a coverageCaveat.
// This summarizes the intervention event log for the judge so an assisted
// candidate is not scored identically to an independent one.

export type InterventionEvent = {
  subtype: string;              // 'restate_anchor' | 'narrow_frame' | 'directive_rescue' | 'synthesis_unresolved'
  phase: string | null;
  payloadJsonb: unknown;
};

const RUNG_LABEL: Record<string, string> = {
  restate_anchor: 'a Level 1 anchor/restate',
  narrow_frame: 'a Level 2 narrowing hint',
  directive_rescue: 'a Level 3 directive rescue (the interviewer handed them the branch)',
};

export function summarizeAssists(events: InterventionEvent[]): string {
  const rescues = events.filter(e => RUNG_LABEL[e.subtype]);
  const synthesisUnresolved = events.some(e => e.subtype === 'synthesis_unresolved');

  if (rescues.length === 0 && !synthesisUnresolved) return '';

  const lines: string[] = [];
  for (const e of rescues) {
    lines.push(`- ${RUNG_LABEL[e.subtype]}${e.phase ? ` during ${e.phase}` : ''}`);
  }
  if (synthesisUnresolved) {
    lines.push('- The candidate could not produce a recommendation even after narrowing; the case closed without one.');
  }

  return `INTERVIEWER ASSISTS (the candidate needed help to proceed — this is candidate PERFORMANCE data, not a coverage gap):
${lines.join('\n')}

Scoring implications:
- A stage the interviewer had to rescue was still ADMINISTERED — do NOT apply a coverageCaveat to it; the candidate's difficulty is the signal.
- Reflect the assists in the relevant ratings (especially Pushback/Composure & Case Leadership, and Structuring/Synthesis where the rescue occurred). An assisted performance must not read as an independent one.
- Note the reliance on assists in "what needs work" where material — a candidate who reached the answer only after a directive rescue did not demonstrate independent problem-solving on that branch.`;
}

// Time-pressure coverage (Rule 15 → Rule 9 coverageCaveat). The OPPOSITE framing
// from assists: when the interviewer shed probes/stages because time ran out,
// thin later-stage coverage is a session/time artifact, not a candidate failing.
// Deterministic feed from the 'load_shed' event so the judge's coverageCaveat is
// grounded, not purely inferred.
export function summarizeCoverage(events: InterventionEvent[]): string {
  const shed = events.find(e => e.subtype === 'load_shed');
  if (!shed) return '';
  return `TIME-PRESSURE COVERAGE: the interview entered load-shedding${shed.phase ? ` during ${shed.phase}` : ''} — the interviewer intentionally dropped optional probes and later-stage depth to protect the final recommendation.
- Attribute thin coverage of later stages (extended analysis, brainstorm depth) to time pressure, NOT to the candidate: apply a coverageCaveat rather than a low rating where a stage was compressed for time.
- This does not excuse errors the candidate actually made in what they did cover; it only prevents penalizing them for stages the interviewer had no time to run.`;
}
