// Phase 1 contract plumbing (docs/superpowers/plans/2026-10-22-phase1-contract.md §1–§4): the switches, the
// overlay merge, the fault-bank record, the worksheet boundary. Every switch off = today's case, unchanged.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { switchOn, parseEngineSwitches, engineSwitchesOf, PHASE1_SWITCHES, assertNoEngineSwitchesInProduction } from '@/lib/cases/engine-switches';
import { applyPhase1Overlay, Phase1OverlaySchema, overlayProblems } from '@/lib/cases/phase1-overlay';
import { CaseSchema, noFigure } from '@/lib/cases/schema';
import { getCaseById } from '@/lib/cases/loader';
import { FaultRecordSchema } from '@/lib/eval/fault-bank';

const raw = (id: string) => CaseSchema.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')));

describe('engine switches', () => {
  it('are off with no env and no pin', () => {
    for (const s of PHASE1_SWITCHES) expect(switchOn({ id: 'prof-001' }, s, {})).toBe(false);
  });
  it('read the env per case after "*", the "phase1" preset and "-name"', () => {
    const env = { ENGINE_SWITCHES: '*=phase1; prof-001=-ackRotation' };
    expect(switchOn({ id: 'prof-002' }, 'ackRotation', env)).toBe(true);
    expect(switchOn({ id: 'prof-001' }, 'ackRotation', env)).toBe(false);
    expect(switchOn({ id: 'prof-001' }, 'worksheet', env)).toBe(true);
    expect(Object.keys(engineSwitchesOf({ id: 'prof-002' }, env))).toHaveLength(PHASE1_SWITCHES.length);
  });
  it('the env beats the case pin; the pin beats the default', () => {
    expect(switchOn({ id: 'x-001', engine: { worksheet: true } }, 'worksheet', {})).toBe(true);
    expect(switchOn({ id: 'x-001', engine: { worksheet: true } }, 'worksheet', { ENGINE_SWITCHES: 'x-001=-worksheet' })).toBe(false);
  });
  it('refuse to start in production mode with ENGINE_SWITCHES set (D2 guard)', () => {
    expect(() => assertNoEngineSwitchesInProduction({ NODE_ENV: 'production', ENGINE_SWITCHES: '*=phase1' })).toThrow(/refusing to start/);
    expect(() => assertNoEngineSwitchesInProduction({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertNoEngineSwitchesInProduction({ NODE_ENV: 'test', ENGINE_SWITCHES: '*=phase1' })).not.toThrow();
  });
  it('refuse an unknown name', () => {
    expect(() => parseEngineSwitches('*=wrokSheet')).toThrow(/unknown switch/);
  });
});

describe('the overlay', () => {
  const prof2 = raw('prof-002');
  const overlay = Phase1OverlaySchema.parse({
    caseId: 'prof-002',
    items: { competitor_costs: { tags: { entity: prof2.factAnchors!.tags!.entities[0].id, period: ['current'], quantityKind: ['level'] }, askPhrases: ['the entrant cost base', 'their cost per seat', 'what the rival spends'], covers: ['entrant cost per seat', 'competitor unit costs'], coverExcludes: ['our'] } },
    exhibits: { [prof2.exhibits[0].id]: { summary: 'Network revenue and costs by year.' } },
    definitions: [{ term: 'contribution', text: 'Route revenue less the costs that vary with flights.' }],
  });
  it('with every switch off, changes only the descriptive fields', () => {
    const out = applyPhase1Overlay(prof2, overlay, {});
    expect(out.factAnchors).toEqual(prof2.factAnchors);
    expect(out.mathSteps).toEqual(prof2.mathSteps);
    expect(out.quoteAnchors).toEqual(prof2.quoteAnchors);
    expect(out.mustReach).toEqual(prof2.mustReach);
    const item = out.dataLedger.find(d => d.id === 'competitor_costs')!;
    expect(item.askPhrases).toHaveLength(3);
    expect(item.coverExcludes).toBeUndefined();
    expect(out.exhibits[0].summary).toMatch(/Network/);
  });
  it('merges covers under itemCovers', () => {
    const out = applyPhase1Overlay(prof2, overlay, { ENGINE_SWITCHES: 'prof-002=itemCovers' });
    expect(out.factAnchors!.covers.competitor_costs).toContain('entrant cost per seat');
    expect(out.dataLedger.find(d => d.id === 'competitor_costs')!.coverExcludes).toEqual(['our']);
  });
  it('refuses unknown ids, a fourth must-reach item, figures in spoken text, one-word covers', () => {
    expect(overlayProblems(prof2, Phase1OverlaySchema.parse({ caseId: 'prof-002', items: { nope: {} } })).join()).toMatch(/unknown ledger item/);
    expect(overlayProblems(prof2, Phase1OverlaySchema.parse({ caseId: 'prof-002', mustReach: [{ item: 'competitor_costs', before: 'recommendation', why: 'b36 Jasmine' }, { item: 'competitor_costs', before: 'recommendation', why: 'b36 Jasmine' }] })).join()).toMatch(/more than 3/);
    expect(Phase1OverlaySchema.safeParse({ caseId: 'x', exhibits: { e: { summary: 'Revenue fell 12% a year.' } } }).success).toBe(false);
    expect(Phase1OverlaySchema.safeParse({ caseId: 'x', items: { a: { covers: ['cost'] } } }).success).toBe(false);
    expect(noFigure('twenty routes')).toBe(false);
    expect(noFigure('the one-off charge')).toBe(true);
  });
});

describe('today\'s cases', () => {
  it('load unchanged with no overlay and no switches', () => {
    for (const f of readdirSync('cases').filter(x => x.endsWith('.json'))) {
      const id = f.replace(/\.json$/, '');
      expect(getCaseById(id)).toEqual(raw(id));
    }
  });
});

describe('the fault-bank record', () => {
  it('parses a fault with assertions', () => {
    expect(FaultRecordSchema.safeParse({
      id: 'b38l-tyler-t24-hollow', kind: 'fault', batch: 'batch-38-larkspur', wave: 'batch-38-larkspur-oct-21-runs-1-5', run: 'cee7d399',
      turnFile: 'test runs/batch-38-larkspur-oct-21-runs-1-5/64-tyler-the-misquoter-case-neutral/live-run-2026-10-21-cee7d399.turns.jsonl.gz',
      caseId: 'prof-002', persona: 64, turn: 24,
      grade: { severity: 'firm', class: 'hollow_deferral', source: 'batch-38-larkspur/hand-grading.md', note: 'model-said "I\'ll check what we have", never followed' },
      state: { phase: 'ANALYSIS', elapsedMs: 1000, revealedIds: [], shownExhibitIds: [], openDataRequests: [] },
      candidateText: 'Do we have price elasticity on the four protected routes?', said: '…',
      assertions: [{ kind: 'restatement', item: 'route_results_other', must: false }, { kind: 'deferral', about: 'elasticity', must: true, scope: { fromTurn: 24 } }],
      replayable: true, stream: 4,
    }).success).toBe(true);
  });
});

describe('the worksheet boundary', () => {
  it('no prompt code imports the worksheet', () => {
    const files = [...readdirSync('lib/agent/prompts', { recursive: true })].map(String).filter(f => f.endsWith('.ts')).map(f => path.join('lib/agent/prompts', f));
    for (const f of [...files, 'lib/orchestrator/prompt-context.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/worksheet/);
    }
  });
});
