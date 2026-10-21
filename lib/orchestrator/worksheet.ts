// The worksheet (Phase 1 contract §2 and Stream 3 task 1, docs/superpowers/plans/2026-10-22-phase1-contract.md;
// Lorenzo: "The worksheet, filled from the math checker's quantity tags, with code owning the updates: the latest value
// per quantity wins; withdrawal phrases ("not X", "instead of X", "earlier I said X", "throw that out") mark X
// withdrawn, not current."). Pure functions, no I/O; the types are the contract's (worksheet-types.ts).
//
// One entry per quantity the candidate has stated — a math step (`step:<id>`) or a pricing result
// (`pricing:<kind>@<input>`) — from two sources: code's own step bindings as the message arrives (`step_binding`), and
// the checker's tagged claims (`checker`, its codeQuantity) when its verdict lands, a turn or more later. A late claim
// updates or confirms the value said at its own turn; it never overwrites a value said later. A figure the candidate
// withdraws is never the current value: a binding of it in the withdrawing message is not taken.
//
// Code-side only (the `worksheet` switch, flags.worksheet): no prompt reads it (tests/cases/phase1-contract.test.ts).
// Read by the stale drop (3.2), the root rules (3.3), the misquote rule (3.4) and the probe guard (3.5).
import { normalizeNumberWords } from '@/lib/number-words';
import type {
  Worksheet, WorksheetApi, WorksheetEntry, WorksheetInput, WorksheetScale, WorksheetStatus, WorksheetUnit, WorksheetValue, WithdrawnFigure,
} from './worksheet-types';
import { EMPTY_WORKSHEET } from './worksheet-types';
import type { CheckerClaim } from './math-checker';
import type { CandidateMath } from './recompute';
import { claimFigures, type VerdictPayload } from './math-checker-live';

type StepDef = {
  id: string; answer: number; tolerance: number; altAnswers?: number[]; inputs?: string[];
  unit?: string | string[]; scale?: 'unit' | 'million'; dependsOn?: string[];
};
type CaseLike = { mathSteps: unknown[] };
const stepsOf = (c: unknown): StepDef[] => ((c as CaseLike | null)?.mathSteps ?? []) as StepDef[];
const stepOf = (c: unknown, id: string) => stepsOf(c).find(s => s.id === id);

// The step a quantity names ("step:starter_ltv" → starter_ltv), or null for a pricing quantity.
export const stepIdOf = (quantity: string): string | null => (quantity.startsWith('step:') ? quantity.slice('step:'.length) : null);
export const stepQuantity = (stepId: string) => `step:${stepId}`;

// What a message adds, with the ledger items the candidate had then (a step whose inputs aren't all out is unchecked),
// and code's own pricing results (pricing-check.ts), status as code computed them.
export type WorksheetMessage = WorksheetInput & {
  revealedIds?: string[];
  pricingBindings?: { quantity: string; value: number; span: string; status: WorksheetStatus }[];
};

// ── status, unit, scale ─────────────────────────────────────────────────────

// Against code's own calculation (contract §2): right within the step's tolerance of its answer or an altAnswer, wrong
// outside it, unchecked when code can't compare (no such step, its inputs not out, a pricing quantity code doesn't
// compute here).
export function statusOf(c: unknown, quantity: string, value: number, revealedIds?: string[]): WorksheetStatus {
  const id = stepIdOf(quantity);
  const st = id === null ? undefined : stepOf(c, id);
  if (!st) return 'unchecked';
  if (revealedIds && (st.inputs ?? []).some(i => !revealedIds.includes(i))) return 'unchecked';
  return [st.answer, ...(st.altAnswers ?? [])].some(a => Math.abs(Math.abs(value) - Math.abs(a)) <= st.tolerance + 1e-9) ? 'right' : 'wrong';
}
const UNITS: readonly WorksheetUnit[] = ['percent', 'points', 'usd', 'count', 'ratio'];
function unitOf(c: unknown, quantity: string): WorksheetUnit {
  const id = stepIdOf(quantity);
  if (id === null) return quantity.startsWith('pricing:needed') ? 'percent' : 'points';
  const u = stepOf(c, id)?.unit;
  const first = Array.isArray(u) ? u[0] : u;
  return UNITS.includes(first as WorksheetUnit) ? first as WorksheetUnit : 'count';
}
function scaleOf(c: unknown, quantity: string, unit: WorksheetUnit): WorksheetScale | null {
  if (unit !== 'usd') return null;
  const id = stepIdOf(quantity);
  const s = id === null ? undefined : stepOf(c, id)?.scale;
  return s === 'million' ? 'million' : 'unit';
}

// ── values ──────────────────────────────────────────────────────────────────

// Two statements of a quantity are the same value within rounding — 2% or 0.05 — or within the step's tolerance (both
// "$405" and "$420" are one wrong Starter LTV against a $60 tolerance; Raj and Marcus, b37q).
function sameValue(c: unknown, quantity: string, a: number, b: number): boolean {
  const id = stepIdOf(quantity);
  const tol = id === null ? 0 : stepOf(c, id)?.tolerance ?? 0;
  return Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(0.05, Math.abs(b) * 0.02, tol);
}
const sameFigure = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(0.05, Math.abs(b) * 0.01);

const allValues = (e: WorksheetEntry): WorksheetValue[] => [...e.history, valueOfEntry(e)];
function valueOfEntry(e: WorksheetEntry): WorksheetValue {
  const { value, unit, scale, turn, span, source, status } = e;
  return { value, unit, scale, turn, span, source, status };
}
const isSameStatement = (a: WorksheetValue, b: WorksheetValue) => a.turn === b.turn && a.source === b.source && sameFigure(a.value, b.value);

// One value into its quantity's entry. The latest turn wins; a value said at the current value's turn by a later
// source (the checker after code's binding) confirms or joins the history, never replaces it; an earlier one joins
// the history in turn order. The same statement folded again changes nothing.
function place(ws: Worksheet, quantity: string, v: WorksheetValue): Worksheet {
  const e = ws.entries[quantity];
  if (!e) return { ...ws, entries: { ...ws.entries, [quantity]: { quantity, ...v, history: [] } } };
  if (allValues(e).some(x => isSameStatement(x, v))) return ws;
  let next: WorksheetEntry;
  if (v.turn > e.turn) next = { quantity, ...v, history: [...e.history, valueOfEntry(e)] };
  else {
    const history = [...e.history, v].sort((a, b) => a.turn - b.turn);
    next = { ...e, history };
  }
  return { ...ws, entries: { ...ws.entries, [quantity]: next } };
}

// ── withdrawals ─────────────────────────────────────────────────────────────

// A figure as said: "$9,000", "about 13.5 months", "$15.8M", "21.5%", "2.5x".
const FIG = String.raw`(?:about\s+|roughly\s+|around\s+|approximately\s+|~\s?)?(-?\$?\s?\d[\d,]*(?:\.\d+)?)(?![\d,]*\d|\.\d)(\s?(?:%|percent\b|points?\b|k\b|m\b|mn\b|million\b|bn\b|billion\b|x\b|months?\b|years?\b))?`;
const num = (s: string) => parseFloat(s.replace(/[$,\s]/g, ''));
const unitOfSaid = (raw: string, after = ''): WorksheetUnit | null => {
  if (/%|percent/i.test(after)) return 'percent';
  if (/points?/i.test(after)) return 'points';
  if (/x\b/i.test(after)) return 'ratio';
  if (/\$/.test(raw) || /^\s?(?:k|m|mn|million|bn|billion)\b/i.test(after)) return 'usd';
  return null;
};
// The figure-bearing withdrawals: "not X" (not "if not X" or "whether or not", and not "not 100% sure"), "earlier I said
// X" / "I said X earlier", "ignore my X", and "instead of X" — only as the candidate's own redo ("I should have used
// $11,000 instead of $9,000"): in batches 30–38 it is nearly always a sensitivity or a comparison ("fails if it's 18%
// instead of 20%", b32 Marcus t11; "acquired for $300 instead of $1,200", b35q Marcus t13), never a withdrawal.
const WITHDRAW_FIG: RegExp[] = [
  new RegExp(String.raw`(?<!\bif\s)(?<!\bor\s)(?<!\bwhether\s)\bnot\s+(?:the\s+|a\s+|an\s+|my\s+)?${FIG}(?!\s*(?:%\s*)?(?:sure|certain|confident)\b)`, 'gi'),
  new RegExp(String.raw`\b(?:earlier|before|previously),?\s+i\s+(?:said|had|used|quoted|put it at|gave|wrote)\s+(?:[^.,;!?\d$]{0,40}?\b(?:was|is|were|at|of|as)\s+)?${FIG}`, 'gi'),
  new RegExp(String.raw`\bi\s+(?:said|had|used|quoted|gave)\s+${FIG}[^.,;!?\d]{0,30}?\s(?:earlier|before|previously)\b`, 'gi'),
  new RegExp(String.raw`\bignore\s+(?:my|the|that)\s+(?:earlier\s+|previous\s+|first\s+)?${FIG}`, 'gi'),
];
const INSTEAD = new RegExp(String.raw`\binstead of\s+(?:the\s+|my\s+|a\s+|an\s+)?${FIG}`, 'gi');
const OWN_REDO = /\b(?:i|i'?d|i'?ve|my|me)\b[^.!?]*\b(?:used|use|using|had|took|should(?: have)?|meant|redo\w*|correct\w*|wrong|mistake|misread|slipped)\b/i;
const HYPOTHETICAL = /\b(?:if|say|assum\w*|would|could|suppose|scenario|sensitivit\w*|what if|were to|might)\b/i;
// The figureless ones: the last figure said before them in the sentence is withdrawn ("= $405 — scratch that, $600").
const WITHDRAW_THAT = /\b(?:throw (?:that|it|this) out|scratch that|ignore (?:that|this)|forget (?:that|this))\b/gi;
const SENTENCES = /(?<=[.!?])\s+|\n+/;
const FIGURE_ANY = /(-?\$?\s?\d[\d,]*(?:\.\d+)?)(\s?(?:%|percent\b|points?\b|k\b|m\b|mn\b|million\b|bn\b|billion\b|x\b))?/gi;

export type Withdrawal = { value: number; unit: WorksheetUnit | null; phrase: string };
export function findWithdrawals(text: string): Withdrawal[] {
  const out: Withdrawal[] = [];
  for (const sentence of normalizeNumberWords(text).split(SENTENCES)) {
    const own = OWN_REDO.test(sentence) && !HYPOTHETICAL.test(sentence);
    for (const re of [...WITHDRAW_FIG, ...(own ? [INSTEAD] : [])]) {
      for (const m of sentence.matchAll(re)) {
        const value = num(m[1]);
        if (Number.isFinite(value)) out.push({ value: Math.abs(value), unit: unitOfSaid(m[1], m[2] ?? ''), phrase: m[0].trim() });
      }
    }
    for (const m of sentence.matchAll(WITHDRAW_THAT)) {
      const before = [...sentence.slice(0, m.index).matchAll(FIGURE_ANY)].at(-1);
      if (!before) continue;
      const value = num(before[1]);
      if (Number.isFinite(value)) out.push({ value: Math.abs(value), unit: unitOfSaid(before[1], before[2] ?? ''), phrase: m[0] });
    }
  }
  return out;
}
const unitsFit = (a: WorksheetUnit | null | undefined, b: WorksheetUnit | null | undefined) => !a || !b || a === b
  || ((a === 'percent' || a === 'points') && (b === 'percent' || b === 'points'));

// ── the API ─────────────────────────────────────────────────────────────────

export function update(ws: Worksheet, input: WorksheetMessage, caseData: unknown): Worksheet {
  let out: Worksheet = ws;
  // Withdrawals are read once per message, when it first arrives (a late checker verdict carries no text of its own).
  const fresh = input.turn > ws.throughTurn;
  const withdrawals = fresh ? findWithdrawals(input.text) : [];
  const withdrawnHere = (value: number, unit: WorksheetUnit) => withdrawals.some(w => sameFigure(value, w.value) && unitsFit(w.unit, unit));
  for (const b of input.stepBindings) {
    const quantity = stepQuantity(b.stepId);
    const unit = unitOf(caseData, quantity);
    if (withdrawnHere(b.value, unit)) continue;
    out = place(out, quantity, {
      value: b.value, unit, scale: scaleOf(caseData, quantity, unit), turn: input.turn, span: b.span, source: 'step_binding',
      status: statusOf(caseData, quantity, b.value, input.revealedIds),
    });
  }
  for (const p of input.pricingBindings ?? []) {
    const unit = unitOf(caseData, p.quantity);
    if (withdrawnHere(p.value, unit)) continue;
    out = place(out, p.quantity, { value: p.value, unit, scale: null, turn: input.turn, span: p.span, source: 'step_binding', status: p.status });
  }
  for (const c of input.checkerClaims ?? []) {
    const unit = unitOf(caseData, c.quantity);
    if (withdrawnHere(c.value, unit)) continue;
    out = place(out, c.quantity, {
      value: c.value, unit, scale: scaleOf(caseData, c.quantity, unit), turn: input.turn, span: c.span, source: 'checker',
      status: statusOf(caseData, c.quantity, c.value, input.revealedIds),
    });
  }
  if (withdrawals.length > 0) {
    const added: WithdrawnFigure[] = withdrawals.map(w => {
      // The quantity it was withdrawn from, when code can tell: an entry that held it, by unit.
      const from = Object.values(out.entries).find(e => unitsFit(w.unit, e.unit) && allValues(e).some(v => v.turn <= input.turn && sameFigure(v.value, w.value)));
      return { value: w.value, unit: w.unit, quantity: from?.quantity ?? null, turn: input.turn, phrase: w.phrase };
    });
    out = { ...out, withdrawn: [...out.withdrawn, ...added.filter(a => !out.withdrawn.some(x => x.turn === a.turn && sameFigure(x.value, a.value)))] };
  }
  if (fresh) out = { ...out, throughTurn: input.turn };
  return out;
}

export function latest(ws: Worksheet, quantity: string): WorksheetEntry | undefined {
  return ws.entries[quantity];
}

export function isWithdrawn(ws: Worksheet, value: number, unit?: WorksheetUnit | null, since = -Infinity): boolean {
  return ws.withdrawn.some(w => w.turn >= since && sameFigure(value, w.value) && unitsFit(w.unit, unit));
}

// 3.2: a probe or correction about `quantity`, raised on the message at `turn` (about the figure `value`, when given),
// is stale when the candidate has since stated another value for it that still stands — said after their last
// restatement of the probed figure, or the step's right answer said in the same message as that restatement (b38
// Marisol t21: "$14.0M minus -$1.8M = $15.8M … the swing is $11.8M", the right improvement beside her explanation of the
// old one) — or when the probed figure was withdrawn since. Without a value, the probed one is what the worksheet holds
// for that turn; with none there either, nothing is known to be newer (false).
export function hasNewerValue(ws: Worksheet, quantity: string, turn: number, value?: number, caseData?: unknown): boolean {
  const e = ws.entries[quantity];
  const values = e ? allValues(e) : [];
  const probed = value ?? values.filter(v => v.turn === turn).at(-1)?.value;
  if (probed === undefined) return false;
  if (ws.withdrawn.some(w => w.turn >= turn && sameFigure(probed, w.value) && (w.quantity === null || w.quantity === quantity) && unitsFit(w.unit, e?.unit))) return true;
  const later = values.filter(v => v.turn > turn);
  if (later.length === 0) return false;
  const same = (v: WorksheetValue) => sameValue(caseData, quantity, v.value, probed);
  const lastProbed = Math.max(-Infinity, ...later.filter(same).map(v => v.turn));
  return later.some(v => !same(v) && (v.turn > lastProbed || (v.turn === lastProbed && v.status === 'right')));
}

// 3.3: the root of a step's lineage through mathSteps[].dependsOn — up the first declared dependency to a step that
// depends on none — and the steps in it (the root and everything computed from it, transitively).
export function lineageOf(caseData: unknown, stepId: string): { root: string; members: string[] } {
  const steps = stepsOf(caseData);
  let root = stepId;
  const seen = new Set<string>([root]);
  for (let st = steps.find(s => s.id === root); st?.dependsOn?.length;) {
    const up = st.dependsOn.find(d => !seen.has(d) && steps.some(s => s.id === d));
    if (up === undefined) break;
    root = up;
    seen.add(up);
    st = steps.find(s => s.id === up);
  }
  const members = [root];
  for (let i = 0; i < members.length; i++) {
    for (const s of steps) if ((s.dependsOn ?? []).includes(members[i]) && !members.includes(s.id)) members.push(s.id);
  }
  return { root, members };
}

// ── folding a turn in (plan-turn.ts, the `worksheet` switch) ────────────────

// The checker's quantity tag as a worksheet quantity: a math step, or a pricing result at its input (the price; for the
// price rise needed, the target — both "needed" kinds keyed as one, as checkerKey keys them). Else none.
export function claimQuantity(c: Pick<CheckerClaim, 'codeQuantity'>): string | null {
  const q = c.codeQuantity;
  if (q.kind === 'step') return q.stepId ? stepQuantity(q.stepId) : null;
  if (q.kind === 'gain' || q.kind === 'new_margin' || q.kind === 'breakeven') return q.price === null ? null : `pricing:${q.kind}@${q.price}`;
  if (q.kind === 'needed_for_margin' || q.kind === 'needed_for_gain') return q.target === null ? null : `pricing:needed@${q.target}`;
  return null;
}
const CODE_PRICING: Record<string, string> = { gain: 'gain', new_margin: 'new_margin', breakeven: 'breakeven', needed: 'needed' };

// The worksheet after this message: its own step bindings and pricing results (code's, as it arrives), then every
// landed verdict's tagged claims (each at its own message; idempotent, so all are folded every turn).
export function foldTurn(ws: Worksheet, p: {
  caseData: unknown; turn: number; text: string; candidateMath: Pick<CandidateMath, 'flags' | 'reportOnly' | 'verified' | 'pricing'>;
  verdicts: Pick<VerdictPayload, 'candidateTurnIndex' | 'claims'>[]; revealedIds: string[];
}): Worksheet {
  const known = (id: string) => stepOf(p.caseData, id) !== undefined;
  const stepBindings = [
    ...[...p.candidateMath.flags.filter(f => (f.kind ?? 'step') === 'step'), ...p.candidateMath.reportOnly].map(f => ({ stepId: f.stepId, value: f.candidateValue, span: f.span })),
    ...p.candidateMath.verified.map(v => ({ stepId: v.stepId, value: v.value, span: v.span })),
  ].filter(b => known(b.stepId));
  const pricingBindings = p.candidateMath.pricing.flatMap(c => {
    const kind = CODE_PRICING[c.kind];
    if (!kind) return [];
    const quantity = kind === 'needed' ? `pricing:needed@${c.stated}` : `pricing:${kind}@${c.price}`;
    return [{ quantity, value: kind === 'needed' ? c.price : c.stated, span: c.span, status: (c.verdict === 'correct' ? 'right' : 'wrong') as WorksheetStatus }];
  });
  let out = update(ws, { turn: p.turn, text: p.text, stepBindings, pricingBindings, revealedIds: p.revealedIds }, p.caseData);
  for (const v of [...p.verdicts].sort((a, b) => a.candidateTurnIndex - b.candidateTurnIndex)) {
    const checkerClaims = v.claims.flatMap(c => {
      const quantity = claimQuantity(c);
      const value = quantity === null ? undefined : claimFigures(c)[0];
      return quantity === null || value === undefined ? [] : [{ quantity, value, span: c.span, rating: c.verdict }];
    });
    if (checkerClaims.length > 0) out = update(out, { turn: v.candidateTurnIndex, text: '', stepBindings: [], checkerClaims, revealedIds: p.revealedIds }, p.caseData);
  }
  return out;
}

export const worksheetApi: WorksheetApi & {
  update(ws: Worksheet, input: WorksheetMessage, caseData: unknown): Worksheet;
  hasNewerValue(ws: Worksheet, quantity: string, turn: number, value?: number, caseData?: unknown): boolean;
} = { update, latest, hasNewerValue, isWithdrawn, lineageOf };

export { EMPTY_WORKSHEET };
