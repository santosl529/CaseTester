// Step 3 (`asyncAskJudge`; Lorenzo, 27 Oct): the self-correction rules (lib/orchestrator/self-correct.ts). Pure.
import { describe, it, expect } from 'vitest';
import { selfCorrection, correctionLine, type CorrectionInput } from '@/lib/orchestrator/self-correct';
import { buildFactBase } from '@/lib/orchestrator/fact-check';
import { getCaseById } from '@/lib/cases/loader';

const c = getCaseById('prof-002');
const fb = buildFactBase(c as never);
const items = c.dataLedger.map(i => ({ id: i.id, label: i.label, value: i.value }));
const base: CorrectionInput = { asks: [], items, revealed: new Set(), deferred: new Set(), lastInterviewerText: '', exhibits: [], shownExhibits: new Set(), fb, caseNames: [], gated: () => false, closing: false };

describe('selfCorrection', () => {
  it('(a) a held item rated full, not given and not deferred: "Actually, I do have that"', () => {
    const r = selfCorrection({ ...base, asks: [{ ask: 'ancillary revenue per passenger', items: [{ id: 'extras_revenue', answers: 'full' }], missing: '' }] });
    expect(r).toMatchObject({ kind: 'have', id: 'extras_revenue' });
    expect(correctionLine(r!, { value: 'Extras revenue was $20 per passenger.', spoken: 'extras revenue' })).toMatch(/^Actually, I do have that: /);
  });
  it('never acts on partial, on an item already out, or on one deferred', () => {
    const ask = { ask: 'ancillary revenue per passenger', items: [{ id: 'extras_revenue', answers: 'partial' as const }], missing: 'by type' };
    expect(selfCorrection({ ...base, asks: [ask] })).toBeNull();
    const full = { ...ask, items: [{ id: 'extras_revenue', answers: 'full' as const }] };
    expect(selfCorrection({ ...base, asks: [full], revealed: new Set(['extras_revenue']) })).toBeNull();
    expect(selfCorrection({ ...base, asks: [full], deferred: new Set(['extras_revenue']) })).toBeNull();
  });
  it('a gated item: the deferral instead', () => {
    const r = selfCorrection({ ...base, gated: () => true, asks: [{ ask: 'ancillary revenue per passenger', items: [{ id: 'extras_revenue', answers: 'full' }], missing: '' }] });
    expect(r?.kind).toBe('have_gated');
  });
  it('(b) none, only after a pointer, never with a figure, never at the close', () => {
    const exhibit = { id: 'exhibit-1', title: 'Larkspur Air — Results by route', summary: 'The route table has flights, revenue and contribution for each route', covers: [] };
    const x = { ...base, exhibits: [exhibit], shownExhibits: new Set(['exhibit-1']), lastInterviewerText: "You'll find that on the exhibit — The route table has flights, revenue and contribution for each route.",
      asks: [{ ask: 'whether the routes are seasonal by route', items: [], missing: 'seasonality' }] };
    expect(selfCorrection(x)?.kind).toBe('none');
    expect(selfCorrection({ ...x, lastInterviewerText: 'Go on.' })).toBeNull();
    expect(selfCorrection({ ...x, asks: [{ ask: 'the 2,000 flights by route seasonality', items: [], missing: '' }] })).toBeNull();
    expect(selfCorrection({ ...x, closing: true })).toBeNull();
  });
});
