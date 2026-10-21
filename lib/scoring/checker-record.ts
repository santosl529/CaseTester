// The math checker in the report (math checker step 3, 13 Oct 2026; Lorenzo:
// a flag still unresolved goes to the session record for the report). Reads
// the session's math_checker events (lib/orchestrator/math-checker-live.ts):
// each verdict's flagged claims and the turn decisions on them.
//   - the judge is told each flagged claim, the right figure (code's own when
//     code wrote the correction) and what became of it in the interview;
//   - deterministic first: a stamp on a figure the checker found wrong no
//     longer counts as verified, and a doubt on a checker-flagged figure is a
//     supported challenge. Claims the deterministic checks flagged themselves
//     (dedupe) are theirs, and left out here.
import { numbersOf, type CheckerCase, type VettedClaim } from '@/lib/orchestrator/math-checker';
import type { VerdictPayload, CheckerDecision } from '@/lib/orchestrator/math-checker-live';
import { claimFigures, isStale, STEP_ROOT } from '@/lib/orchestrator/math-checker-live';
import type { TurnVerification } from './challenge-marks';

const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.01);

export type CheckerEventRow = { category: string; subtype: string; turnIndex: number | null; payloadJsonb: unknown };


type Flagged = { id: string; turn: number; claim: VettedClaim; outcomes: CheckerDecision[] };

const decisionsOf = (rows: CheckerEventRow[]) => rows.filter(r => r.category === 'math_checker' && r.subtype === 'flag').map(r => r.payloadJsonb as CheckerDecision);
function flaggedClaims(rows: CheckerEventRow[]): Flagged[] {
  const decisions = decisionsOf(rows);
  return rows.filter(r => r.category === 'math_checker' && r.subtype === 'verdict')
    .map(r => r.payloadJsonb as VerdictPayload)
    .sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex)
    .flatMap(v => v.claims.map((claim, i) => ({ id: `${v.candidateTurnIndex}:${i}`, turn: v.candidateTurnIndex, claim, outcomes: decisions.filter(d => d.id === `${v.candidateTurnIndex}:${i}`) })))
    // A conversion: the figure was right on a reading code computes (own-quantity.ts) — no error of theirs.
    .filter(f => f.claim.flag && !f.outcomes.some(d => d.outcome === 'dedupe' || d.outcome === 'disagrees_with_code' || d.outcome === 'converted'));
}

// The candidate figures the checker flagged, by candidate turn (a word
// quantity has none; `caseNumbers`: the case's figures, quoted not derived).
export function checkerFlaggedFigures(rows: CheckerEventRow[], caseNumbers: number[] = []): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const f of flaggedClaims(rows)) out.set(f.turn, [...(out.get(f.turn) ?? []), ...claimFigures(f.claim, caseNumbers)]);
  return out;
}

// Verification without the stamps the checker found wrong.
export function dropCheckerStamps(v: Map<number, TurnVerification>, rows: CheckerEventRow[], caseNumbers: number[] = []): Map<number, TurnVerification> {
  const flagged = checkerFlaggedFigures(rows, caseNumbers);
  return new Map([...v].map(([turn, x]) => [turn, { ...x, verified: x.verified.filter(s => !(flagged.get(turn) ?? []).some(n => same(n, s.value))) }]));
}

// The decisions on a root: on its key — or, for a misread input (E7, `input:…`), on the claims of it sent to the report
// with it ("two probes on its input (input:40%) already, … — left for the report"; their key is the claim's own).
const onRootOf = (root: string | undefined, all: CheckerDecision[]) => (root === undefined ? []
  : all.filter(d => d.key === root || (root.startsWith('input:') && d.reason.includes(`its input (${root})`))));

// A claim built on an earlier wrong figure (Lorenzo, 19 Oct, §15 o): what became of that input in the interview.
// The root's correction said once more for this claim (Lorenzo, 19 Oct, round-2 ruling 1): `restated`.
function builtText(root: string | undefined, all: CheckerDecision[], restated = false): string {
  const onRoot = onRootOf(root, all);
  const fix = onRoot.find(d => d.outcome === 'correct' || d.outcome === 'converted');
  // A root a conversion closed was right on another quantity: not their error, so never "wrong" (round-3 ruling 1, Lorenzo,
  // 19 Oct: "not X" only on code's own quantity; Task 18 review). Its line, as said, on its right basis.
  if (fix?.outcome === 'converted') {
    const basis = `Not raised on its own: it is built on an earlier figure of theirs that the interview restated on its right basis: "${fix.line}"`;
    return restated ? `${basis}; it was still in use here, and that line was said once more.` : basis;
  }
  const lead = 'Not raised on its own: it is built on an earlier wrong figure of theirs';
  if (fix && restated) return `${lead}, which the interview corrected: "${fix.line}"; it was still in use here, and the correction was said once more.`;
  if (fix) return `${lead}, which the interview corrected: "${fix.line}"`;
  if (onRoot.some(d => d.outcome === 'unresolved' && /left for the report/.test(d.reason))) return `${lead}, which was probed and left for this report.`;
  if (onRoot.some(d => ['probe', 'pointer', 'hint'].includes(d.outcome))) return `${lead}, which the interview probed instead; not corrected.`;
  return `${lead}; that figure was not raised in the interview either.`;
}

const RESTATED = 'Restated after it had been probed or corrected.';

// One derived correction per root (Lorenzo, 20 Oct, ruling 3): another claim built on the same root had it — its line, as
// said (that claim's own correction, once: a `correct` or `converted` decision naming the root).
function perRoot(root: string | undefined, all: CheckerDecision[]): string {
  const said = all.find(d => d.root === root && (d.outcome === 'correct' || d.outcome === 'converted') && /its own correction, once/.test(d.reason) && d.line);
  return ` One correction built on that figure was said, on another claim${said ? `: "${said.line}"` : ''}; this one was left for this report (one correction per root).`;
}

function outcomeText(outcomes: CheckerDecision[], all: CheckerDecision[] = outcomes): string {
  const has = (o: CheckerDecision['outcome']) => outcomes.find(d => d.outcome === o);
  const corrected = has('correct');
  if (corrected) return `Corrected: "${corrected.line}"`;
  // Said once more for this claim, built on a root corrected live (ruling 1) — whatever line took the question on an earlier try.
  const restate = has('restate');
  if (restate) return builtText(restate.root, all, true);
  // Linked to a step root (round 6 Task 72; Lorenzo, 21 Oct, the step-check ruling): built on a figure the deterministic
  // step check found wrong — not probed in the interview, left for this report.
  const linked = outcomes.find(d => d.outcome === 'unresolved' && d.root?.startsWith(STEP_ROOT));
  if (linked) return `Not raised on its own: ${linked.reason.replace(/; left for the report$/, '')} — left for this report.`;
  if (has('stale')) return 'The candidate revised or withdrew it since.';
  if (has('pointer')) return 'Probed twice (the second time against the data); not corrected.';
  if (has('hint')) return 'Probed twice (the second time with a hint); not corrected.';
  if (has('probe')) return 'Probed; not corrected.';
  // A claim built on a root a live correction closed that ended unsaid (shed, expired, cut off by the close) carries
  // that root: what became of it, not a bare "not raised" (round-2 final review, Minor 2; Lorenzo, 19 Oct, round-3 ruling 2).
  // So does one on a root probed and left for the report (round-5b Task 54's review).
  const unsaid = outcomes.find(d => ['expired', 'shed', 'unresolved_at_close'].includes(d.outcome) && d.root !== undefined
    && onRootOf(d.root, all).some(r => r.outcome === 'correct' || r.outcome === 'converted' || (r.outcome === 'unresolved' && /left for the report/.test(r.reason))));
  if (unsaid) return builtText(unsaid.root, all);
  if (has('expired')) return 'Not raised in the interview (it waited behind other checks and expired).';
  if (has('shed')) return 'Not raised in the interview (minor, under time pressure).';
  if (has('unresolved_at_close')) return 'Not raised in the interview (the case closed first).';
  if (has('undelivered')) return 'Not raised in the interview (another line took the question).';
  // Built on another wrong figure (Lorenzo, 19 Oct, §15 o): the input's outcome, said as it went.
  const built = outcomes.find(d => d.outcome === 'derived' || (d.outcome === 'unresolved' && /^built on a (?:closed|corrected) input/.test(d.reason)));
  // …whose correction was already said twice: not again (the controller's ruling on Task 19's concern 1).
  const spent = built && /already said twice/.test(built.reason) ? '; that correction had already been said twice, so it was not said again.' : '';
  if (built) {
    const root = built.root ?? /^built on (?:a (?:closed|corrected) input \()?([^ )']+)/.exec(built.reason)?.[1];
    return `${builtText(root, all)}${spent}${built.outcome === 'unresolved' && /one correction per root/.test(built.reason) ? perRoot(root, all) : ''}`;
  }
  const twice = outcomes.find(d => d.outcome === 'unresolved' && /already said twice/.test(d.reason));
  if (twice) return `Not corrected again: its correction had already been said twice in the interview: "${twice.line}"`;
  // Past Rule 14 (Lorenzo, 13 Oct): probed twice with nothing code could correct, or a restatement of an error already handled.
  const unresolved = has('unresolved');
  if (unresolved && /restated after the flag closed/.test(unresolved.reason)) return RESTATED;
  if (unresolved && /left for the report/.test(unresolved.reason)) return 'Probed twice; not corrected — left for this report.';
  return 'Not raised in the interview (the check landed after the case moved on).';
}

function figureText(c: VettedClaim): string {
  if (c.correctionFigure) return `about ${c.correctionFigure} (computed in code)`;
  if (c.correctValue !== null) return `about ${c.correctValue} by the checker`;
  if (c.correctLow !== null && c.correctHigh !== null) return `about ${c.correctLow}–${c.correctHigh} by the checker`;
  if (c.actualShare !== null) return `about ${Math.round(c.actualShare * 100)}% of the whole by the checker`;
  return 'no figure';
}

// The candidate's messages after the flags closed, for a redo the interview never read (Lorenzo, 20 Oct, round-5b job 2).
export type RedoContext = { candidateTurns: { turnIndex: number; text: string }[]; caseData: CheckerCase; revealedIds: string[] };

// isStale's reason for a redo to the right figure, stated for the claim's own quantity (E6) — not a withdrawal, a
// revision with no figure read, a restatement, or the right figure on another base.
const RIGHT_STATED = /^the right figure \((-?\d[\d,]*(?:\.\d+)?)\) stated since$/;
const sentencesSaid = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean);

// A flagged claim the interview closed unsaid-right — left for the report or restated after its flag closed
// (`unresolved`, any reason), or expired or shed after a probe — that the candidate redid to the right figure in a
// later message (b33 Marisol 31e33506 13:0, "0.25 × 58 = 14.5", redone at t19 as "0.25 × 42 = 10.5"). The first such
// message after the decision, read with isStale (as E6 binds: the right figure for another quantity is no redo); its
// sentence carrying the figure, quoted. Null when none.
function laterRedo(f: Flagged, rows: CheckerEventRow[], redo: RedoContext): string | null {
  if (f.outcomes.some(d => d.outcome === 'correct' || d.outcome === 'converted' || d.outcome === 'stale')) return null;
  const probed = f.outcomes.some(d => ['probe', 'pointer', 'hint'].includes(d.outcome));
  const closedAt = rows.filter(r => r.category === 'math_checker' && r.subtype === 'flag' && r.turnIndex !== null).filter(r => {
    const d = r.payloadJsonb as CheckerDecision;
    return d.id === f.id && (d.outcome === 'unresolved' || (probed && (d.outcome === 'expired' || d.outcome === 'shed')));
  }).map(r => r.turnIndex as number);
  if (closedAt.length === 0) return null;
  const after = Math.max(...closedAt);
  for (const t of redo.candidateTurns.filter(x => x.turnIndex > after).sort((a, b) => a.turnIndex - b.turnIndex)) {
    const m = RIGHT_STATED.exec(isStale(f.claim, [t.text], redo.caseData, redo.revealedIds) ?? '');
    if (!m) continue;
    const v = Number(m[1].replace(/,/g, ''));
    // The sentence the redo is bound in: the one isStale credits on its own (figure-binding.ts binds within a
    // sentence), not the first that holds the number ("The other inputs added 10.5 points. Beans were … = 10.5.").
    const holding = sentencesSaid(t.text).filter(x => numbersOf(x).some(n => same(n, v)));
    const sentence = holding.find(x => RIGHT_STATED.test(isStale(f.claim, [x], redo.caseData, redo.revealedIds) ?? '')) ?? holding[0];
    if (sentence) return `The candidate redid it correctly later (turn ${t.turnIndex}): "${sentence}"`;
  }
  return null;
}

export function formatCheckerSection(rows: CheckerEventRow[], redo?: RedoContext): string {
  const flagged = flaggedClaims(rows);
  if (flagged.length === 0) return '';
  const all = decisionsOf(rows);
  const lines = flagged.map(f => {
    const { turn, claim: c, outcomes } = f;
    const said = outcomeText(outcomes, all);
    const credit = redo ? laterRedo(f, rows, redo) : null;
    // A restatement the redo answered is no longer the last word on it; any other outcome stays, the redo after it.
    const text = credit === null ? said : said === RESTATED ? credit : `${said} ${credit}`;
    return `- turn ${turn}: "${c.span}" — WRONG (${c.errorType ?? 'error'}${c.changesConclusion ? '; changes the conclusion' : ''}): ${figureText(c)}. ${text}`;
  });
  return `MATH CHECKER (a model's check of the candidate's claims, vetted in code; a figure "computed in code" is code's own):
${lines.join('\n')}
Treat a WRONG claim as the candidate's error unless they revised it — and cite it only where the transcript bears it out. One they revised or withdrew is a self-correction.`;
}
