// Interviewer-error marking and the wellbeing exclusion
// (docs/interviewer-behavior.md Rule 3 and Rule 17-C5, v4.3;
// docs/scoring-qa.md). Built deterministically from the session's own event
// log and transcript, BEFORE the evidence audit, so no later step treats a
// system-caused turn as candidate evidence. Persona runs 27–28 Sep: Priya's
// report cited a false correction as proof she erred, Omar's called a false
// conduct warning a lapse, Derek was faulted for pointing out an unanswered
// request, and Sam's report scored how she handled her own distress.
//
// Two uses: the judge receives the marks as input (prevention), and
// dropClaimsOnMarkedTurns removes needs-work items whose only evidence is a
// candidate turn responding to a mark (enforcement).

export type MarkKind =
  | 'unbacked_correction'  // correction with no recompute flag behind it (Rule 2)
  | 'empty_release'        // data announced but not delivered (Rule 10)
  | 'unanswered_request'   // available data requested and never provided (Rule 11)
  | 'conduct_warning'      // C2 warning — not the report's call (Rule 17)
  | 'conceded_error'       // interviewer conceded the candidate was right (Rule 16)
  | 'wellbeing';           // C5 disclosure and exchange — excluded entirely

export type InterviewerMark = {
  kind: MarkKind;
  interviewerTurn: number | null;
  candidateTurns: number[]; // candidate turns that may not count against them
  note: string;
};

type Turn = { role: string; text: string; turnIndex: number };
type EventRow = { category: string; subtype: string; turnIndex: number | null };

// A correction of the CANDIDATE (not the interviewer correcting itself — "let me
// correct one thing, I have the data" in run 9a873577).
const CORRECTION = /\b(?:quick|one) correction\b|\bcorrection on\b|\b(?:it|that)'?s closer to\b/i;
const EMPTY_RELEASE_COMPLAINT = /\b(?:don'?t|do not|didn'?t|did not|can'?t)\b(?:\s+\w+){0,3}\s+(?:see|get|have)\s+(?:a |the |any )?(?:number|figure|data)\b|\b(?:did it|didn'?t|did not|doesn'?t|it didn'?t) come through\b|\bcome through on my end\b|\bsame (?:cost )?exhibit again\b/i;
const CONCESSION = /\byou'?re right\b/i;

function nextCandidate(turns: Turn[], afterIndex: number): number[] {
  const t = turns.find(x => x.role === 'candidate' && x.turnIndex > afterIndex);
  return t ? [t.turnIndex] : [];
}

function prevCandidate(turns: Turn[], beforeIndex: number): number[] {
  const t = [...turns].reverse().find(x => x.role === 'candidate' && x.turnIndex < beforeIndex);
  return t ? [t.turnIndex] : [];
}

export function buildInterviewerMarks(
  turns: Turn[],
  events: EventRow[],
  unanswered: { label: string; turnIndex: number | null }[] = [],
): InterviewerMark[] {
  const marks: InterviewerMark[] = [];
  // Session events are keyed by the candidate turn index; the interviewer
  // reply to that candidate turn is the next index.
  const flaggedCandidateTurns = new Set(events.filter(e => e.subtype === 'recompute_flag').map(e => e.turnIndex));

  for (const t of turns) {
    if (t.role !== 'interviewer') continue;
    if (CORRECTION.test(t.text) && !flaggedCandidateTurns.has(t.turnIndex - 1)) {
      marks.push({ kind: 'unbacked_correction', interviewerTurn: t.turnIndex, candidateTurns: nextCandidate(turns, t.turnIndex),
        note: 'The interviewer issued a correction no deterministic check backed; the correction may be wrong.' });
    }
    if (CONCESSION.test(t.text)) {
      marks.push({ kind: 'conceded_error', interviewerTurn: t.turnIndex, candidateTurns: prevCandidate(turns, t.turnIndex),
        note: 'The interviewer conceded the candidate was right; the candidate\'s challenge was correct, not a mistake.' });
    }
  }

  for (const t of turns) {
    if (t.role === 'candidate' && EMPTY_RELEASE_COMPLAINT.test(t.text)) {
      marks.push({ kind: 'empty_release', interviewerTurn: t.turnIndex - 1, candidateTurns: [t.turnIndex],
        note: 'The interviewer announced data that did not arrive; the candidate had to proceed without it.' });
    }
  }

  for (const e of events) {
    if (e.category === 'conduct' && e.subtype === 'C2' && e.turnIndex !== null) {
      marks.push({ kind: 'conduct_warning', interviewerTurn: e.turnIndex + 1, candidateTurns: [e.turnIndex, ...nextCandidate(turns, e.turnIndex + 1)],
        note: 'A conduct warning was issued by an automated check. Whether the remark was unprofessional is not for the report: do not cite the warning or the candidate\'s reaction to it.' });
    }
    if (e.category === 'conduct' && e.subtype === 'C5' && e.turnIndex !== null) {
      marks.push({ kind: 'wellbeing', interviewerTurn: e.turnIndex + 1, candidateTurns: [e.turnIndex, ...nextCandidate(turns, e.turnIndex + 1)],
        note: 'The candidate disclosed personal distress and the case paused. Exclude the disclosure and this exchange from every dimension — no composure credit or debit — and do not mention it in the report.' });
    }
  }

  for (const u of unanswered) {
    if (u.turnIndex === null) continue;
    marks.push({ kind: 'unanswered_request', interviewerTurn: u.turnIndex + 1, candidateTurns: nextCandidate(turns, u.turnIndex + 1),
      note: `The candidate asked for "${u.label}", which the case holds, and never received it. Their later complaint or assumption about it is not a weakness.` });
  }
  return marks;
}

export function formatInterviewerMarksSection(marks: InterviewerMark[]): string {
  if (marks.length === 0) return '';
  const lines = marks.map(m => {
    const at = m.interviewerTurn !== null ? `interviewer turn ${m.interviewerTurn}` : 'session';
    const cand = m.candidateTurns.length ? `; candidate turn(s) ${m.candidateTurns.join(', ')}` : '';
    return `- [${m.kind}] ${at}${cand}: ${m.note}`;
  });
  return `INTERVIEWER ERRORS AND EXCLUSIONS (from the session's own event log — these are system facts, not judgments):
${lines.join('\n')}
A candidate turn listed here can never be evidence against the candidate, and an interviewer error can never be cited as proof of a candidate mistake. Wellbeing exchanges are excluded from scoring entirely.`;
}

type ItemWithQuotes = { point: string; quotes: string[] };

// Enforcement: a needs-work item whose every quote comes only from marked
// candidate turns rests on a system-caused (or excluded) moment — dropped. A
// quote that also appears in an unmarked turn keeps the item.
export function dropClaimsOnMarkedTurns<R extends Record<string, unknown>>(
  rubric: R,
  dimensionKeys: readonly string[],
  turns: Turn[],
  marks: InterviewerMark[],
): { rubric: R; dropped: { dimension: string; point: string }[] } {
  const marked = new Set(marks.flatMap(m => m.candidateTurns));
  if (marked.size === 0) return { rubric, dropped: [] };
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const candidate = turns.filter(t => t.role === 'candidate');
  const onlyMarked = (quote: string) => {
    const q = norm(quote);
    const hits = candidate.filter(t => norm(t.text).includes(q));
    return hits.length > 0 && hits.every(t => marked.has(t.turnIndex));
  };
  const cleaned = structuredClone(rubric);
  const dropped: { dimension: string; point: string }[] = [];
  for (const key of dimensionKeys) {
    const dim = cleaned[key] as { needsWork: ItemWithQuotes[] } | undefined;
    if (!dim) continue;
    dim.needsWork = dim.needsWork.filter(item => {
      const drop = item.quotes.length > 0 && item.quotes.every(onlyMarked);
      if (drop) dropped.push({ dimension: key, point: item.point });
      return !drop;
    });
  }
  return { rubric: cleaned, dropped };
}
