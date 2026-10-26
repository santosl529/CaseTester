// Phase 2 C1: the four-slot composer in shadow (design §3; rulings Q5–Q7, 27 Oct), on the record turns it is for.
import { describe, it, expect } from 'vitest';
import { composeShadow, isSetup, type ComposerPieces } from '@/lib/orchestrator/turn-composer';

const pieces = (o: Partial<ComposerPieces>): ComposerPieces => ({ say: '', data: [], question: '', corrections: [], ended: false, ...o });
const rules = (v: { rule: string }[]) => v.map(x => x.rule);
const RAMP = 'New routes typically take 6–12 months to reach their expected load factor, and in the first year the load factor is often around 60%.';

describe('setup sentences travel with their question', () => {
  it('b38l Tyler t20: the "you said $8,800" setup moves after the data, so "that figure" has its referent', () => {
    const c = composeShadow(pieces({
      say: 'Understood. On variable cost, you said $8,800 per flight.',
      data: [{ kind: 'release', text: RAMP, ids: ['new_route_rampup'] }],
      question: 'Where did that figure come from, and what does it include?',
    }), {});
    expect(c.slots.ack).toEqual(['Understood.']);
    expect(c.slots.setup).toEqual(['On variable cost, you said $8,800 per flight.']);
    expect(c.composed.endsWith('On variable cost, you said $8,800 per flight. Where did that figure come from, and what does it include?')).toBe(true);
    expect(rules(c.lintToday)).toContain('L2');
    expect(rules(c.lintComposed)).not.toContain('L2');
  });
  it('a plain acknowledgment is no setup', () => {
    expect(isSetup('Understood.')).toBe(false);
    expect(isSetup('Earlier you said Option B beats A by $40M.')).toBe(true);
    expect(isSetup('On the prevalence input:')).toBe(true);
  });
});

describe('Q5: where a correction goes', () => {
  it('a correction of what the candidate just said goes before the data; an older one after it', () => {
    const c = composeShadow(pieces({
      say: 'Got it.',
      data: [{ kind: 'release', text: RAMP, ids: ['new_route_rampup'] }],
      question: 'Starter value per sign-up is about $1,400, not $1,205. What would you tell the CEO?',
      corrections: [{ text: 'Starter value per sign-up is about $1,400, not $1,205.', justSaid: false }, { text: 'Pro lifetime value is about $4,000, not $2,400.', justSaid: true }],
    }), {});
    expect(c.slots.correctionFirst).toEqual(['Pro lifetime value is about $4,000, not $2,400.']);
    expect(c.slots.correctionAfter).toEqual(['Starter value per sign-up is about $1,400, not $1,205.']);
    expect(c.slots.question).toEqual(['What would you tell the CEO?']);
    expect(c.composed.indexOf('Pro lifetime')).toBeLessThan(c.composed.indexOf('New routes'));
  });
  it('code\'s misquote correction (a data part) corrects the message just said: first', () => {
    const c = composeShadow(pieces({ say: 'Understood.', data: [{ kind: 'correction', text: 'To correct one figure: COGS is 58% of revenue today.', ids: [] }, { kind: 'release', text: RAMP, ids: ['x'] }], question: 'Where next?' }), {});
    expect(c.slots.correctionFirst).toEqual(['To correct one figure: COGS is 58% of revenue today.']);
    expect(c.slots.data).toEqual([RAMP]);
  });
});

describe('Q6 and Q7', () => {
  it('Q7: the last question kept, the earlier withheld (logged)', () => {
    const c = composeShadow(pieces({ say: 'Right.', question: 'Is that MECE, and what\'s missing? Which branch would you prioritize first, and why?' }), {});
    expect(c.slots.question).toEqual(['Which branch would you prioritize first, and why?']);
    expect(c.moves.questionsWithheld).toEqual(['Is that MECE, and what\'s missing?']);
    expect(rules(c.lintToday)).toContain('L5');
    expect(rules(c.lintComposed)).not.toContain('L5');
  });
  it('Q6: a rewritten sentence is withheld whole', () => {
    const c = composeShadow(pieces({ say: 'Right.', question: 'Your 37.5% was applied to the wrong base. Which base should it be?', rewritten: ['Your 37.5% was applied to the wrong base.'] }), {});
    expect(c.composed).not.toContain('37.5%');
    expect(c.moves.rewriteWithheld).toHaveLength(1);
  });
  it('an unchanged turn is reported unchanged', () => {
    const c = composeShadow(pieces({ say: 'Understood.', data: [{ kind: 'release', text: RAMP, ids: ['x'] }], question: 'Where does that leave you?' }), {});
    expect(c.changed).toBe(false);
  });
});

describe('a code-written turn\'s riding correction', () => {
  it('is said once, in the correction slot, not also in the acknowledgment (6a721cdf t16)', () => {
    const LINE = 'Patients on Kelvexa at peak is about 40,000, not 200,000.';
    const c = composeShadow(pieces({ say: LINE, data: [{ kind: 'exhibit', text: 'Now, an exhibit: US specialist survey.', ids: [] }], question: 'What stands out?', corrections: [{ text: LINE, justSaid: false }] }), {});
    expect(c.composed.split(LINE).length - 1).toBe(1);
    expect(c.slots.ack).toEqual([]);
  });
});
