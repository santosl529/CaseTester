// "Assisted ≠ covered" scoring attribution (docs/scoring-qa.md;
// docs/interviewer-behavior.md Rule 13). Stall-ladder assists are candidate
// PERFORMANCE data, not coverage gaps: a stage that was administered,
// laddered, and still failed was covered — it does not get a coverageCaveat.
// This summarizes the intervention event log for the judge so an assisted
// candidate is not scored identically to an independent one.

export type InterventionEvent = {
  subtype: string;              // 'restate_anchor' | 'narrow_frame' | 'directive_rescue' | 'synthesis_unresolved' | 'rung_not_delivered' (never an assist)
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
  // `stuckRescue`'s point cap (Lorenzo, 29 Oct): the interviewer moved on from a point asked twice without convergence.
  const movedOn = events.filter(e => e.subtype === 'stuck_moved_on');

  if (rescues.length === 0 && !synthesisUnresolved && movedOn.length === 0) return '';

  const lines: string[] = [];
  for (const e of rescues) {
    // v4.5: delivered rungs carry the hint text the candidate received.
    const span = (e.payloadJsonb as { span?: string | null } | null)?.span;
    lines.push(`- ${RUNG_LABEL[e.subtype]}${e.phase ? ` during ${e.phase}` : ''}${span ? ` — the interviewer said: "${span}"` : ''}`);
  }
  for (const e of movedOn) {
    const point = (e.payloadJsonb as { point?: string | null } | null)?.point;
    lines.push(`- The candidate did not get to a point after two questions on it${e.phase ? ` during ${e.phase}` : ''}, and the interviewer moved on${point ? ` — the question was: "${point}"` : ''}.`);
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

// The v3 pressure-test waiver (docs/interviewer-behavior.md Rule 7, v4.9):
// code closed an open probe after the reply bound, or moved on when no
// structure was ever given. A record for the judge — whether the probe was
// delivered, the questions and replies, and that code closed it — stated
// neutrally: the closure is a bound on the interview, not an assist, not an
// unanswered question, and not by itself a weakness. With no probe delivered
// the pressure test was not administered.
type WaiverPayload = {
  from?: string; probeDelivered?: boolean; probe?: string; askedAt?: number;
  followUps?: string[]; replyTurns?: number[]; waivedAt?: number;
};
type Line = { role: string; turnIndex: number; text: string };

export function summarizePressureTest(events: InterventionEvent[], transcript: Line[]): string {
  const e = events.find(x => x.subtype === 'pressure_test_waived');
  const nm = events.find(x => x.subtype === 'pressure_test_nothing_missing');
  // "Nothing is missing" closed the probe (Lorenzo, 19 Oct): the report, not the
  // interview, says what the structure leaves out against the case key.
  if (!e && nm) {
    const p = (nm.payloadJsonb ?? {}) as { probe?: string | null; askedAt?: number | null; replyTurn?: number; reply?: string; branchAsked?: boolean };
    return `PRESSURE TEST (Rule 7) — a record of what happened, not a verdict:
- The interviewer's structure probe was delivered${p.askedAt != null ? ` (turn ${p.askedAt})` : ''}: "${(p.probe ?? '').trim()}"
- The candidate's reply: ${p.replyTurn !== undefined ? `turn ${p.replyTurn}: ` : ''}"${(p.reply ?? '').trim()}"
- Code took "nothing is missing" as the answer and did not press for a gap${p.branchAsked ? '; it asked which branch they would start with' : ''}.
Scoring: count the probe as answered (not an assist). Judge the structure's completeness yourself against the case's structure key; if it leaves something out (for example, competitive context), name it in the report as feedback.`;
  }
  if (!e) return '';
  const p = (e.payloadJsonb ?? {}) as WaiverPayload;
  const quote = (s: string) => `"${s.trim()}"`;
  const turnOf = (text: string) => transcript.find(t => t.role === 'interviewer' && t.text.includes(text))?.turnIndex;
  const replies = (p.replyTurns ?? [])
    .map(i => transcript.find(t => t.role === 'candidate' && t.turnIndex === i))
    .filter((t): t is Line => t !== undefined)
    .map(t => `turn ${t.turnIndex}: ${quote(t.text)}`);
  const at = p.waivedAt !== undefined ? ` (turn ${p.waivedAt})` : '';

  if (!p.probeDelivered) {
    return `PRESSURE TEST (Rule 7) — a record of what happened, not a verdict:
- No pressure-test probe was delivered: code's structure check did not find a structure the probe could test.
- Code moved the interview on to the analysis${at} and released the data it had been holding.
Scoring: the pressure test was NOT administered — don't treat it as asked, answered or unanswered. Rate structuring from what the candidate actually said.`;
  }
  const lines = [`- The interviewer's structure probe was delivered${p.askedAt !== undefined ? ` (turn ${p.askedAt})` : ''}: ${quote(p.probe ?? '')}`];
  for (const f of p.followUps ?? []) {
    const t = turnOf(f);
    lines.push(`- Asked again${t !== undefined ? ` (turn ${t})` : ''}: ${quote(f)}`);
  }
  if (replies.length) lines.push(`- The candidate's replies while it was open: ${replies.join('; ')}`);
  lines.push(`- After ${p.replyTurns?.length ?? 0} replies, code closed the probe without a reply its check judged to answer it, and released the data it had been holding${at}.`);
  return `PRESSURE TEST (Rule 7) — a record of what happened, not a verdict:
${lines.join('\n')}
Scoring: rate structuring from these exchanges as they read. The closure is a code bound on the interview — not an assist, not an unanswered question, and not by itself evidence of a weakness.`;
}
