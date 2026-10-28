// The worksheet (Phase 1 contract §2, docs/superpowers/plans/2026-10-22-phase1-contract.md; Stream 3 builds
// lib/orchestrator/worksheet.ts against these types). Code-side only: kept in the session flags
// (`flags.worksheet`), never in any prompt — lib/agent/prompts/** and prompt-context.ts may not import it
// (tests/cases/phase1-contract.test.ts).
//
// One entry per quantity the candidate has stated: a math step (`step:<id>`) or a pricing result code computes
// (`pricing:<gain|new_margin|needed_for_margin|needed_for_gain|breakeven>@<input>`). The latest value wins; the
// earlier ones stay in `history`. A withdrawn figure ("not X", "instead of X", "earlier I said X", "throw that
// out") is never the current value.
export type WorksheetUnit = 'percent' | 'points' | 'usd' | 'count' | 'ratio';
export type WorksheetScale = 'unit' | 'thousand' | 'million' | 'billion';
export type WorksheetStatus = 'right' | 'wrong' | 'unchecked';
export type WorksheetSource = 'checker' | 'step_binding';

export type WorksheetValue = {
  value: number;              // as said, at `scale`
  unit: WorksheetUnit;
  scale: WorksheetScale | null; // money only; null for shares, counts, ratios
  turn: number;               // the candidate's turnIndex (TurnRecord.turnIndex) it was said in
  span: string;               // the words it was said in
  source: WorksheetSource;    // the checker's quantity tag (codeQuantity) or code's own step binding
  // Against code's own calculation: within the step's tolerance of its answer or an altAnswer → right; outside →
  // wrong; unchecked when code can't compare (a step input not yet revealed, the candidate's own stated base or
  // assumption, a unit or scale code can't read).
  status: WorksheetStatus;
};

export type WorksheetEntry = WorksheetValue & {
  quantity: string;           // `step:<id>` | `pricing:<kind>@<input>`
  history: WorksheetValue[];  // earlier values, oldest first
};

export type WithdrawnFigure = {
  value: number;
  unit: WorksheetUnit | null;
  quantity: string | null;    // the quantity it was withdrawn from, when code can tell
  turn: number;               // the turnIndex of the withdrawal
  phrase: string;             // the withdrawal words ("not 5.8", "throw that out")
};

export type Worksheet = {
  entries: Record<string, WorksheetEntry>;
  withdrawn: WithdrawnFigure[];
  throughTurn: number;        // the last turnIndex folded in
};

export const EMPTY_WORKSHEET: Worksheet = { entries: {}, withdrawn: [], throughTurn: -1 };

// What one candidate message adds: the step bindings code makes as the message arrives, and the checker's tagged
// claims for it when they land (a turn or more later — they update the value said at `turn`, never a newer one).
export type WorksheetInput = {
  turn: number;
  text: string;
  stepBindings: { stepId: string; value: number; span: string }[];
  checkerClaims?: { quantity: string; value: number; span: string; rating: 'correct' | 'error' | 'unverifiable' }[];
};

// Stream 3 implements these in lib/orchestrator/worksheet.ts — pure functions, no I/O.
export interface WorksheetApi {
  update(ws: Worksheet, input: WorksheetInput, caseData: unknown): Worksheet;
  latest(ws: Worksheet, quantity: string): WorksheetEntry | undefined;
  // 3.2: a probe or correction about `quantity` raised on the message at `turn` is stale when this is true.
  hasNewerValue(ws: Worksheet, quantity: string, turn: number): boolean;
  isWithdrawn(ws: Worksheet, value: number, unit?: WorksheetUnit | null): boolean;
  // 3.3: the root of a step's lineage through mathSteps[].dependsOn, and the steps in it.
  lineageOf(caseData: unknown, stepId: string): { root: string; members: string[] };
}
