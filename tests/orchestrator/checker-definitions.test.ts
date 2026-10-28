// Phase 1 Stream 3 task 7 — the case's definitions in the live checker's prompt (`checkerDefinitions`, contract 3.7).
// Lorenzo, 26 Oct: "Task 7 must be done before the wave, because it is what lets M2's roots be corrected with the
// checker's agreement." The definitions are the case's own words for its quantities (figure-free by the case schema),
// server-side like the rest of the checker's input. Off, the system prompt is byte-identical to before.
// Q5 (Lorenzo, 22 Oct): a recorded-verdict replay cannot show the effect — the lead runs the live re-check at the gate.
import { describe, it, expect, afterEach } from 'vitest';
import { buildCheckerSystem, type CheckerCase } from '@/lib/orchestrator/math-checker';
import { getCaseById } from '@/lib/cases/loader';

const env = process.env.ENGINE_SWITCHES;
afterEach(() => { if (env === undefined) delete process.env.ENGINE_SWITCHES; else process.env.ENGINE_SWITCHES = env; });
const on = (id: string) => { process.env.ENGINE_SWITCHES = `${id}=checkerDefinitions`; };

const CASES = ['prof-001', 'prof-002', 'entry-001', 'pricing-001', 'launch-001'];

describe('checkerDefinitions: off', () => {
  it('no DEFINITIONS block on any case, and the prompt is the one built with no definitions at all', () => {
    delete process.env.ENGINE_SWITCHES;
    for (const id of CASES) {
      const c = getCaseById(id) as CheckerCase;
      expect(c.definitions?.length ?? 0, `${id} has definitions to pass`).toBeGreaterThan(0);
      expect(buildCheckerSystem(c)).not.toContain('DEFINITIONS');
      // Byte-identical to the prompt of the same case without the field: the block is the only change.
      expect(buildCheckerSystem(c)).toBe(buildCheckerSystem({ ...c, definitions: undefined }));
    }
  });
  it('another case\'s switch leaves this one alone', () => {
    on('prof-001');
    expect(buildCheckerSystem(getCaseById('pricing-001') as CheckerCase)).not.toContain('DEFINITIONS');
    expect(buildCheckerSystem(getCaseById('prof-001') as CheckerCase)).toContain('DEFINITIONS');
  });
});

describe('checkerDefinitions: on', () => {
  it('every definition, its wording, and the steps and data lines it covers', () => {
    on('pricing-001');
    const c = getCaseById('pricing-001') as CheckerCase;
    const s = buildCheckerSystem(c);
    for (const d of c.definitions ?? []) {
      expect(s).toContain(`- ${d.term}: ${d.text}`);
      for (const st of d.steps ?? []) expect(s).toContain(st);
      for (const it of d.items ?? []) expect(s).toContain(it);
    }
    // The definition M2 turns on: the checker read "14 months on plan" its own way before.
    expect(s).toContain('- lifetime value: Lifetime value is monthly gross margin times expected lifetime in months, and expected lifetime is about one divided by the monthly cancellation rate. (steps: pro_ltv, starter_ltv; data: ltv_definition)');
  });
  it('after the math steps and before the pricing model, with the instruction to judge by it', () => {
    on('prof-001');   // the case with a pricing model and share bases: the block goes between
    const c = getCaseById('prof-001') as CheckerCase;
    const s = buildCheckerSystem(c);
    expect(s).toMatch(/MATH STEPS[\s\S]*\n\nDEFINITIONS \(the case's own terms — judge each claim's quantity by the definition below, not by another reading of the words\):\n/);
    expect(s.indexOf('DEFINITIONS')).toBeLessThan(s.indexOf('PRICING MODEL'));
    expect(s.indexOf('DEFINITIONS')).toBeLessThan(s.indexOf('SHARE BASES'));
    // Nothing else moves: the case's own data is still all there.
    for (const d of c.dataLedger) expect(s).toContain(d.value);
  });
  it('builds on every case, and says nothing where a case has no definitions', () => {
    for (const id of CASES) {
      on(id);
      const c = getCaseById(id) as CheckerCase;
      expect(buildCheckerSystem(c)).toContain('DEFINITIONS');
      expect(buildCheckerSystem({ ...c, definitions: [] })).not.toContain('DEFINITIONS');
      expect(buildCheckerSystem({ ...c, definitions: undefined })).not.toContain('DEFINITIONS');
    }
  });
  it('a definition with no steps or items is listed as its term and text alone', () => {
    on('prof-001');
    const c = getCaseById('prof-001') as CheckerCase;
    const s = buildCheckerSystem({ ...c, definitions: [{ term: 'contribution', text: 'Contribution is revenue less the variable costs of serving a customer.' }] });
    expect(s).toContain('- contribution: Contribution is revenue less the variable costs of serving a customer.\n');
    expect(s).not.toContain('(steps:');
  });
});
