import { describe, it, expect } from 'vitest';
import { planCheckerFlags, lineKey, MATH_CHECKER_CATEGORY, type CheckerPlan, type CheckerPlanInput, type CheckerRow, type VerdictPayload } from '@/lib/orchestrator/math-checker-live';
import type { VettedClaim } from '@/lib/orchestrator/math-checker';
import { candidateFiguresOf } from '@/lib/orchestrator/math-talk';
import { formatCheckerSection } from '@/lib/scoring/checker-record';
import { getCaseById } from '@/lib/cases/loader';
import B33 from './fixtures/derived-once-b33-marisol.json';

// Lorenzo, 20 Oct (round-5b job 1, R7 reversed): "when a root goes to the report without a code line, the derived claim
// gets its own vetted correction once, through own-quantity framing (b33 Marisol 11:0 "about 4.2 points of revenue, not
// 5.8"). The root probe at t12 stays." b33 Marisol 31e33506 (fixtures/derived-once-b33-marisol.json: the transcript to
// message 13 and the vetted verdicts on messages 9 and 11, as the r5-final2 replay served them).
const prof = getCaseById('prof-001');
const ROOT = 'bean_share_of_revenue@14.5';
const OWN = 'bean_points_added@5.8';
const LINE_4_2 = "Bean inflation's contribution to the COGS increase, in points of revenue, is about 4.2 points, not 5.8.";
const T12_PROBE = 'You took beans as 25% of the 58 points of COGS. Which year does that 25% refer to, and what was COGS then?';
const turns = B33.turns as CheckerPlanInput['turnRows'];
const rows = B33.rows as unknown as CheckerRow[];
const textAt = (n: number) => turns.find(t => t.turnIndex === n)!.text;
const figures = (n: number) => candidateFiguresOf(turns.filter(t => t.role === 'candidate' && t.turnIndex <= n).map(t => t.text), [prof.prompt]);
const plan = (n: number, over: Partial<CheckerPlanInput> = {}) => planCheckerFlags({
  rows, handled: [], turnRows: turns.filter(t => t.turnIndex < n), candidateText: textAt(n), candidateTurnIndex: n,
  currentFlags: [], attempts: {}, underTimePressure: false, candidateFigures: figures(n),
  caseData: prof, revealedIds: n >= 13 ? B33.revealedAt13 : B33.revealedAt11,
  ...over,
});
// What plan-turn books when the line is used: the selection and its riders handled, its key raised, its attempt counted,
// and its decisions logged as flag rows on the message (delivered: a flag row decided on message m is spoken on m + 1).
const booked = (n: number, p: CheckerPlan) => {
  const s = p.selected!;
  return {
    rows: [...rows, ...p.decisions.map(d => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: n, payloadJsonb: d }) as CheckerRow)],
    handled: [...p.handledNow, s.id, ...(s.riders ?? []).map(r => r.id)],
    keys: Object.fromEntries(Object.entries(p.keys).filter(([k]) => k === s.key)),
    attempts: { [s.key]: s.attempt },
  };
};
const t11 = plan(11);
const atT13 = booked(11, t11);

describe('R7 reversed: a claim built on a root left for the report gets its own vetted correction once (b33 Marisol 31e33506)', () => {
  it('t12: the root\'s own probe is unchanged — 9:0, the vetted probe, its derived claims riding on it', () => {
    expect(t11.selected).toMatchObject({ id: '9:0', key: ROOT, action: 'probe', line: T12_PROBE });
    expect(t11.selected?.riders?.map(r => r.id)).toEqual(['9:1', '9:2', '9:3']);
  });

  describe('t13: 9:0 goes to the report with no line said; 11:0 ("Beans are 5.8 points of the 16-point COGS increase") is built on it', () => {
    const p = plan(13, atT13);
    it('the root is left for the report, as before', () => {
      expect(p.decisions.find(d => d.id === '9:0')).toMatchObject({ outcome: 'unresolved', key: ROOT, reason: expect.stringMatching(/left for the report/) });
      expect(p.closedNow).toContain(ROOT);
    });
    it('11:0 is corrected on its own key, in own-quantity framing: "about 4.2 points", "not 5.8"', () => {
      expect(p.selected).toMatchObject({ id: '11:0', key: OWN, action: 'correct' });
      expect(p.selected?.line).toMatch(/about 4\.2 points/);
      expect(p.selected?.line).toMatch(/not 5\.8/);
      expect(p.selected?.converted).toBeUndefined();
      // Her quantity is code's (bean inflation's contribution, in points of revenue): the vetted line as the checker wrote it.
      expect(p.selected?.line).toBe(LINE_4_2);
      const d = p.decisions.filter(x => x.id === '11:0');
      expect(d).toEqual([expect.objectContaining({ outcome: 'correct', key: OWN, root: ROOT, line: p.selected!.line, reason: expect.stringContaining(ROOT) })]);
    });
    it('the report: corrected, by the line said', () => {
      const section = formatCheckerSection([...rows.map(r => ({ ...r, category: MATH_CHECKER_CATEGORY })), ...p.decisions.map(x => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 13, payloadJsonb: x }))]);
      expect(section).toContain(`"Beans are 5.8 points of the 16-point COGS increase." — WRONG (wrong_period; changes the conclusion): about 4.2 (computed in code). Corrected: "${LINE_4_2}"`);
    });
    it('11:1 (the 12% margin) waits behind it', () => {
      expect(p.waiting.map(w => w.id)).toContain('11:1');
    });
  });

  describe('the root closed for the report on an earlier turn (p.closed, no p.corrected entry for it)', () => {
    const closed = { ...atT13, keys: { ...atT13.keys }, closed: [ROOT] };
    const p = plan(13, closed);
    it('11:0: its own correction, the decision naming the closed root', () => {
      expect(p.selected).toMatchObject({ id: '11:0', key: OWN, action: 'correct' });
      expect(p.selected?.line).toMatch(/about 4\.2 points/);
      expect(p.selected?.line).toMatch(/not 5\.8/);
      expect(p.decisions.filter(x => x.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'correct', root: ROOT, reason: expect.stringContaining(`built on a closed input (${ROOT})`) })]);
      expect(p.handledNow).not.toContain('11:0');   // booked by plan-turn only when the line is said
    });
    it('the next turn, that line said once: not again — left for the report, once', () => {
      const line = p.selected!.line;
      const next = plan(13, { ...closed, said: { [lineKey(line)]: 1 } });
      expect(next.selected?.id).not.toBe('11:0');
      const d = next.decisions.filter(x => x.id === '11:0');
      expect(d).toEqual([expect.objectContaining({ outcome: 'unresolved', root: ROOT, reason: expect.stringMatching(/left for the report/) })]);
      expect(next.handledNow).toContain('11:0');
      // The report: built on a figure left for the report — never "corrected" by a line it did not hear.
      const section = formatCheckerSection([...rows.map(r => ({ ...r, category: MATH_CHECKER_CATEGORY })), ...next.decisions.map(x => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 13, payloadJsonb: x })),
        { category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 11, payloadJsonb: { id: '9:0', candidateTurnIndex: 9, outcome: 'unresolved', reason: 'attempt 2: no correction code can write, no pointer — left for the report', span: '', candidateValue: '', key: ROOT, changesConclusion: false } }]);
      expect(section).toMatch(/"Beans are 5\.8 points of the 16-point COGS increase\." — WRONG[^\n]*which was probed and left for this report\./);
    });
    it('no true line on her reading (framedCorrection gives none): the report, "built on a closed input" — unchanged', () => {
      const noLine = rows.map(r => {
        const v = r.payloadJsonb as VerdictPayload;
        return v.candidateTurnIndex !== 11 ? r : { ...r, payloadJsonb: { ...v, claims: v.claims.map((c, i) => (i === 0 ? { ...c, correctionLine: null, correctionFigure: null } as VettedClaim : c)) } };
      });
      const q = plan(13, { ...closed, rows: noLine });
      expect(q.selected?.id).not.toBe('11:0');
      expect(q.decisions.filter(x => x.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'unresolved', root: ROOT, reason: `built on a closed input (${ROOT})` })]);
    });
    it('a root corrected live (p.corrected[root].line set): unchanged — the root\'s correction once more (ruling 1), then the report', () => {
      const ROOT_LINE = 'Beans two years ago were about 10.5 points of revenue, not 14.5.';
      const q = plan(13, { ...closed, corrected: { [ROOT]: { line: ROOT_LINE, figure: '10.5' } } });
      expect(q.selected).toMatchObject({ id: '11:0', key: ROOT, action: 'restate', line: ROOT_LINE });
      const after = plan(13, { ...closed, corrected: { [ROOT]: { line: ROOT_LINE, figure: '10.5' } }, restated: [ROOT] });
      expect(after.selected?.id).not.toBe('11:0');
      expect(after.decisions.filter(x => x.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'unresolved', reason: expect.stringMatching(/^built on a corrected input .* restated once already; left for the report/) })]);
    });
    it('under time pressure a minor one is shed, as a flag is', () => {
      const minor = rows.map(r => {
        const v = r.payloadJsonb as VerdictPayload;
        return v.candidateTurnIndex !== 11 ? r : { ...r, payloadJsonb: { ...v, claims: v.claims.map((c, i) => (i === 0 ? { ...c, changesConclusion: false } as VettedClaim : c)) } };
      });
      const q = plan(13, { ...closed, rows: minor, underTimePressure: true });
      expect(q.selected?.id).not.toBe('11:0');
      expect(q.decisions.filter(x => x.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'shed', root: ROOT })]);
    });
  });
});

// Final review M1–M3 (f0fbaf8..5f73bc8), on the same b33 Marisol plan at t13.
const editClaim = (rs: CheckerRow[], turn: number, i: number, patch: Partial<VettedClaim>) => rs.map(r => {
  const v = r.payloadJsonb as VerdictPayload;
  return v.candidateTurnIndex !== turn || !v.claims ? r : { ...r, payloadJsonb: { ...v, claims: v.claims.map((c, j) => (j === i ? { ...c, ...patch } as VettedClaim : c)) } };
});
describe('final review M1: a root whose correction was said twice goes to the report with a code line — its derived claims go to the report too', () => {
  // 9:0 given a vetted correction (its root line), said twice already: spentLine sends 9:0 to the report.
  const ROOT_LINE = 'Beans two years ago were about 10.5 points of revenue, not 14.5.';
  const withLine = editClaim(atT13.rows, 9, 0, { correctionLine: ROOT_LINE, correctionFigure: '10.5' });
  it('the line is 9:0\'s correction (said at t13 when not yet said)', () => {
    expect(plan(13, { ...atT13, rows: withLine }).selected).toMatchObject({ id: '9:0', action: 'correct', line: ROOT_LINE });
  });
  it('said twice: 9:0 to the report, and 11:0 to the report as "already said twice" — not its own correction', () => {
    const p = plan(13, { ...atT13, rows: withLine, said: { [lineKey(ROOT_LINE)]: 2 } });
    expect(p.decisions.find(d => d.id === '9:0')).toMatchObject({ outcome: 'unresolved', reason: 'its correction was already said twice — left for the report' });
    expect(p.selected?.id).not.toBe('11:0');
    expect(p.decisions.filter(d => d.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'unresolved', root: ROOT,
      reason: `built on a corrected input (${ROOT}) — its correction was already said twice; left for the report` })]);
    expect(p.handledNow).toContain('11:0');
  });
});

describe('final review M3: a freed derived claim joins the queue in its order — a minor one never takes the turn from a conclusion-changing claim', () => {
  // 9:0 conclusion-changing (so it is tried before 11:1), 11:0 minor, 11:1 conclusion-changing.
  const rs = editClaim(editClaim(editClaim(atT13.rows, 9, 0, { changesConclusion: true }), 11, 0, { changesConclusion: false }), 11, 1, { changesConclusion: true });
  it('9:0 to the report; 11:1 (conclusion-changing) is this turn\'s line, 11:0\'s own correction waits', () => {
    const p = plan(13, { ...atT13, rows: rs });
    expect(p.decisions.find(d => d.id === '9:0')).toMatchObject({ outcome: 'unresolved' });
    expect(p.selected).toMatchObject({ id: '11:1', action: 'probe' });
    expect(p.waiting.map(w => w.id)).toContain('11:0');
  });
  it('with 11:0 conclusion-changing as recorded, it still goes first (age)', () => {
    const p = plan(13, { ...atT13, rows: editClaim(atT13.rows, 11, 1, { changesConclusion: true }) });
    expect(p.selected).toMatchObject({ id: '11:0', action: 'correct', line: LINE_4_2 });
  });
});

// Ruling 3 (Lorenzo, 20 Oct, round-5b review): "Ruling 11 changed: one derived correction per root, not per derived
// claim; the root's other derived claims go to the report." Keyed by the root (flags.mathChecker.derivedOnce: the root →
// the claim its one correction went to, booked by plan-turn when the line is said). b33 Marisol's t14 line is the root's
// first, so it stands; ruling 1's restatement and the root's own line are never silenced by it (Review Focus 3).
describe('ruling 3: one derived correction per root (b33 Marisol 31e33506)', () => {
  const PER_ROOT = `built on a closed input (${ROOT}) — one correction per root, said already (9:3); left for the report`;
  it('t13: 11:0\'s "about 4.2 points, not 5.8" is unchanged — the root\'s first, its selection naming the root', () => {
    const p = plan(13, atT13);
    expect(p.selected).toMatchObject({ id: '11:0', key: OWN, action: 'correct', line: LINE_4_2, onceRoot: ROOT });
  });
  it('the root\'s one correction said already for another claim: 11:0 goes to the report as it closes (toReport), and 11:1\'s probe takes the turn', () => {
    const p = plan(13, { ...atT13, derivedOnce: { [ROOT]: '9:3' } });
    expect(p.selected).toMatchObject({ id: '11:1', action: 'probe' });
    expect(p.decisions.filter(d => d.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'unresolved', root: ROOT, reason: PER_ROOT })]);
    expect(p.handledNow).toContain('11:0');
  });
  it('…and on a root closed on an earlier turn (onClosedRoot): the report too — the report text reads the root\'s outcome', () => {
    const closed = { ...atT13, keys: { ...atT13.keys }, closed: [ROOT], derivedOnce: { [ROOT]: '9:3' } };
    const p = plan(13, closed);
    expect(p.selected?.id).not.toBe('11:0');
    expect(p.decisions.filter(d => d.id === '11:0')).toEqual([expect.objectContaining({ outcome: 'unresolved', root: ROOT, reason: PER_ROOT })]);
    const section = formatCheckerSection([...rows.map(r => ({ ...r, category: MATH_CHECKER_CATEGORY })), ...p.decisions.map(x => ({ category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 13, payloadJsonb: x })),
      { category: MATH_CHECKER_CATEGORY, subtype: 'flag', turnIndex: 11, payloadJsonb: { id: '9:0', candidateTurnIndex: 9, outcome: 'unresolved', reason: 'attempt 2: no correction code can write, no pointer — left for the report', span: '', candidateValue: '', key: ROOT, changesConclusion: false } }]);
    expect(section).toMatch(/"Beans are 5\.8 points of the 16-point COGS increase\." — WRONG[^\n]*which was probed and left for this report\. One correction built on that figure was said, on another claim; this one was left for this report \(one correction per root\)\./);
  });
  it('Review Focus 3: a root corrected live still has its correction said once more (ruling 1), whatever the record says', () => {
    const ROOT_LINE = 'Beans two years ago were about 10.5 points of revenue, not 14.5.';
    const q = plan(13, { ...atT13, closed: [ROOT], corrected: { [ROOT]: { line: ROOT_LINE, figure: '10.5' } }, derivedOnce: { [ROOT]: '9:3' } });
    expect(q.selected).toMatchObject({ id: '11:0', key: ROOT, action: 'restate', line: ROOT_LINE });
  });
  it('Review Focus 3: the root\'s own correction is said, whatever the record says', () => {
    const ROOT_LINE = 'Beans two years ago were about 10.5 points of revenue, not 14.5.';
    const q = plan(13, { ...atT13, rows: editClaim(atT13.rows, 9, 0, { correctionLine: ROOT_LINE, correctionFigure: '10.5' }), derivedOnce: { [ROOT]: '9:3' } });
    expect(q.selected).toMatchObject({ id: '9:0', action: 'correct', line: ROOT_LINE });
    expect(q.selected?.onceRoot).toBeUndefined();
  });
});
