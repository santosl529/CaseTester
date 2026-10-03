import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkRecomputeForTurn, checkVerifiedForTurn } from '@/lib/orchestrator/recompute';
import { withholdProbesOnVerified } from '@/lib/orchestrator/probe-guard';
import { evaluateStall, INITIAL_STALL_STATE, type StallState } from '@/lib/orchestrator/stall';
import { isClosingTurn } from '@/lib/orchestrator/spoken-close';
import { createLedger, reveal, resolveItemsFromText, handoffSentences } from '@/lib/orchestrator/data-ledger';
import { withholdAssumptionChallenges } from '@/lib/orchestrator/assumption-guard';
import { rewriteSystemLanguage } from '@/lib/orchestrator/audit';
import { checkTimeframes } from '@/lib/orchestrator/timeframe-check';
import { applyAnswerKeyPass } from '@/lib/scoring/answer-key-pass';
import { summarizeDataRequests } from '@/lib/scoring/data-coverage';
import { getCaseById } from '@/lib/cases/loader';
import type { Phase } from '@/lib/orchestrator/state-machine';

// Replay suite: the deterministic checks re-run over the saved persona-run
// records (batches 1–4). Every assertion here was first established by a
// one-off replay while fixing that check; keeping them stops a later change
// from silently re-introducing the failure (e.g. the "margin" cue's false
// flags, or a refusal read as a handoff). No model calls — free to run.
//
// The records live in "Case Interview Runs/" (not committed); without them
// this suite skips. Batches are named explicitly so new batches don't change
// the expected results.

const ROOT = 'Case Interview Runs/test runs';
const BATCHES = ['batch-1-sep-27-28', 'batch-2-sep-29', 'batch-3-oct-02', 'batch-4-oct-02'] as const;
const available = BATCHES.every(b => existsSync(path.join(ROOT, b)));

type Turn = { role: string; text: string; turnIndex: number; timestampMs: number };
type Run = {
  batch: string;
  persona: string;
  turns: Turn[];
  revealed: { ledgerItemId: string; revealedAtMs: number }[];
  events: { category: string; subtype: string; turnIndex: number; phase: string; payloadJsonb: unknown }[];
  score: { rubricJsonb: unknown } | null;
};

function loadRuns(batches: readonly string[]): Run[] {
  const runs: Run[] = [];
  for (const batch of batches) {
    for (const persona of readdirSync(path.join(ROOT, batch)).sort()) {
      const dir = path.join(ROOT, batch, persona);
      let file: string | undefined;
      try { file = readdirSync(dir).find(f => f.endsWith('.json')); } catch { continue; }
      if (!file) continue;
      const j = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
      runs.push({ batch, persona, turns: j.turns, revealed: j.revealed, events: j.events, score: j.score });
    }
  }
  return runs;
}

const prof = getCaseById('prof-001');
const candidateBefore = (run: Run, t: Turn) => run.turns.filter(x => x.role === 'candidate' && x.turnIndex < t.turnIndex).at(-1);
const revealedBefore = (run: Run, ms: number) => run.revealed.filter(r => r.revealedAtMs < ms).map(r => r.ledgerItemId);

describe.skipIf(!available)('replay suite — saved persona runs, batches 1–4', () => {
  const all = available ? loadRuns(BATCHES) : [];
  const batch = (b: string) => all.filter(r => r.batch === b);
  const tag = (r: Run, t?: number) => `${r.batch.slice(0, 7)} ${r.persona.slice(0, 12)}${t === undefined ? '' : ` t${t}`}`;

  it('loads every batch', () => {
    expect(all.length).toBeGreaterThanOrEqual(40);
  });

  // Rule 2/14 (v4.3 + batch 4): no false live math flags anywhere. Batch 4's
  // three (Tobias target-margin math, Derek's revenue base) came from the
  // dollar-impact step's "margin" cue.
  it('raises zero live math flags across every candidate turn', () => {
    const flags: string[] = [];
    for (const r of all) for (const t of r.turns.filter(x => x.role === 'candidate')) {
      for (const f of checkRecomputeForTurn(t.text, prof.mathSteps, revealedBefore(r, t.timestampMs))) {
        flags.push(`${tag(r, t.turnIndex)} ${f.stepId} ${f.candidateValue}`);
      }
    }
    expect(flags).toEqual([]);
  });

  // Rule 2 v4.5: the probe guard withholds exactly batch 2's doubt probes on
  // correct math, and nothing legitimate (Carmen's explain probe, Derek's
  // probe on a real error).
  it('withholds exactly the batch-2 probes on verified figures', () => {
    const withheld: string[] = [];
    for (const r of batch('batch-2-sep-29')) {
      let prev: ReturnType<typeof checkVerifiedForTurn> = [];
      let probed = new Set<string>();
      for (const t of r.turns.filter(x => x.role === 'interviewer')) {
        const c = r.turns.find(x => x.turnIndex === t.turnIndex - 1);
        if (!c || c.role !== 'candidate') continue;
        const ids = revealedBefore(r, c.timestampMs);
        const now = checkVerifiedForTurn(c.text, prof.mathSteps, ids);
        const out = withholdProbesOnVerified(t.text, {
          verified: [...now, ...prev], alreadyProbed: probed,
          flaggedThisTurn: checkRecomputeForTurn(c.text, prof.mathSteps, ids).length > 0,
        });
        for (const w of out.withheld) withheld.push(`${r.persona.slice(0, 8)}:${w.test}`);
        probed = new Set([...probed, ...out.explainProbed]);
        prev = now;
      }
    }
    expect(withheld.sort()).toEqual([
      '01-maya-:doubt_on_verified', '02-tobia:explain_work_shown', '03-ines-:doubt_on_verified',
      '32-sam-t:doubt_on_verified', '33-omar-:doubt_on_verified',
    ]);
  });

  // Rule 13 v4.5/v4.6: Yuki's phantom rung (worded numbers) is gone; Maya's
  // two real rungs remain.
  it('reproduces the batch-2 stall ladder without the phantom rung', () => {
    const rungs: string[] = [];
    for (const r of batch('batch-2-sep-29')) {
      let state: StallState = { ...INITIAL_STALL_STATE };
      for (const t of r.turns.filter(x => x.role === 'candidate')) {
        const phase = (r.events.find(e => e.turnIndex === t.turnIndex && e.phase)?.phase ?? 'ANALYSIS') as Phase;
        const d = evaluateStall(t.text, phase, state);
        state = d.state;
        if (d.intervene) rungs.push(`${r.persona.slice(0, 8)}:L${d.rung}`);
      }
    }
    expect(rungs.filter(x => x.startsWith('35-yuki'))).toEqual([]);
    expect(rungs.filter(x => x.startsWith('01-maya')).length).toBeGreaterThanOrEqual(2);
  });

  // Rule 12 v4.6: the goodbye detector fires only on real goodbyes. Mid-case
  // detections are all known genuine early goodbyes; Priya's meta-answer
  // ("…written report afterward. Let's keep to the case.") is not one.
  it('detects goodbyes only where they really happened', () => {
    const midCase: string[] = [];
    for (const r of all) {
      const iv = r.turns.filter(x => x.role === 'interviewer');
      iv.forEach((t, k) => { if (k < iv.length - 1 && isClosingTurn(t.text)) midCase.push(tag(r, t.turnIndex)); });
    }
    // Every one is a real goodbye the old code let through (Maya's four in
    // batch 2 — three mid-case — is the v4.6 case). Batches 3–4: none.
    expect(midCase).toEqual([
      'batch-1 33-omar-the- t18',
      'batch-2 01-maya-the- t63', 'batch-2 01-maya-the- t65', 'batch-2 01-maya-the- t67',
      'batch-2 35-yuki-the- t20',
    ]);
  });

  // Round-3 fix 2: multi-fact recovery fills exactly the three known partial
  // deliveries and never names an extra item.
  it('recovers exactly the known partial deliveries in batches 2–4', () => {
    const recovered: string[] = [];
    for (const r of [...batch('batch-2-sep-29'), ...batch('batch-3-oct-02'), ...batch('batch-4-oct-02')]) {
      for (const t of r.turns.filter(x => x.role === 'interviewer' && x.turnIndex > 0)) {
        const c = candidateBefore(r, t); if (!c) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ledger = createLedger(prof.dataLedger as any);
        for (const rv of r.revealed) if (rv.revealedAtMs <= c.timestampMs) reveal(ledger, rv.ledgerItemId);
        for (const h of handoffSentences(t.text)) for (const id of resolveItemsFromText(ledger, h)) recovered.push(`${tag(r, t.turnIndex)} ${id}`);
      }
    }
    expect(recovered.sort()).toEqual([
      'batch-2 03-ines-the- t14 non_bean_input_change',
      'batch-2 17-priya-the t10 menu_price_change',
      'batch-3 02-tobias-th t14 non_bean_input_change',
    ]);
  });

  // Batch 4: the interviewer's own refusals are never read as handoffs.
  it('never reads a refusal as a handoff', () => {
    for (const t of ["That's not a cut I have.", "The split of the other inputs bucket isn't in the information I have."]) {
      expect(handoffSentences(t)).toEqual([]);
    }
  });

  // Rule 11 v4.5: the assumption guard catches the four batch-2 challenges on
  // requested menu prices, with the open-request set as of each turn.
  it('withholds the batch-2 assumption challenges on requested data', () => {
    const catalog = prof.dataLedger.map(d => ({ id: d.id, label: d.label }));
    const hits: string[] = [];
    for (const r of batch('batch-2-sep-29')) {
      const rows = r.events.filter(e => e.category === 'data_request').map(e => ({ subtype: e.subtype, turnIndex: e.turnIndex, payloadJsonb: e.payloadJsonb }));
      for (const t of r.turns.filter(x => x.role === 'interviewer')) {
        const c = r.turns.find(x => x.turnIndex === t.turnIndex - 1);
        if (!c || c.role !== 'candidate') continue;
        const open = summarizeDataRequests(rows.filter(x => x.turnIndex < c.turnIndex), catalog, revealedBefore(r, c.timestampMs)).requestedUnanswered;
        for (const w of withholdAssumptionChallenges(t.text, open.map(o => ({ ledgerItemId: o.ledgerItemId, label: o.label }))).withheld) {
          hits.push(`${r.persona.slice(0, 8)}:${w.ledgerItemId}`);
        }
      }
    }
    expect(hits.sort()).toEqual(['01-maya-:menu_price_change', '02-tobia:menu_price_change', '13-micah:menu_price_change', '17-priya:menu_price_change']);
  });

  // Rule 3 v4.5: the answer-key pass finds the three batch-2 Creativity
  // penalties for the commodity blend.
  it('removes the batch-2 answer-key penalties', () => {
    const removed: string[] = [];
    for (const r of batch('batch-2-sep-29')) {
      if (!r.score) continue;
      const out = applyAnswerKeyPass(r.score.rubricJsonb as never, {
        ideas: prof.answerKeyIdeas,
        candidateTexts: r.turns.filter(t => t.role === 'candidate').map(t => t.text),
      });
      for (const x of out.removed) removed.push(`${r.persona.slice(0, 8)}:${x.dimension}`);
    }
    expect(removed.sort()).toEqual(['02-tobia:creativity', '13-micah:creativity', '45-camil:creativity']);
  });

  // Round-3 fix 5: system vocabulary — Ines's batch-3 sentence is the only hit.
  it('rewrites system language only where it occurred', () => {
    const hits: string[] = [];
    for (const r of all) for (const t of r.turns.filter(x => x.role === 'interviewer')) {
      if (rewriteSystemLanguage(t.text).rewrites.length > 0) hits.push(tag(r));
    }
    expect(hits).toEqual(['batch-3 03-ines-the-']);
  });

  // Rule 6 v4.6: the timeframe check (log-only) has no hits in any batch.
  it('finds no cross-period arithmetic', () => {
    const hits: string[] = [];
    for (const r of all) for (const t of r.turns.filter(x => x.role === 'interviewer')) {
      const ids = new Set(r.revealed.filter(rv => rv.revealedAtMs <= t.timestampMs).map(rv => rv.ledgerItemId));
      if (checkTimeframes(t.text, prof.dataLedger.filter(d => ids.has(d.id))).length > 0) hits.push(tag(r, t.turnIndex));
    }
    expect(hits).toEqual([]);
  });
});
