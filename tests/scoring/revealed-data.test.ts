import { describe, it, expect } from 'vitest';
import { buildRevealedDataSection } from '@/lib/scoring/judge';
import { getCaseById } from '@/lib/cases/loader';

describe('buildRevealedDataSection', () => {
  const c = getCaseById('prof-001');

  it('lists revealed items (with value) under received and the rest under never-revealed', () => {
    // The run's scenario: ATV + cost percentages revealed, bean price withheld.
    const revealed = ['revenue_total', 'cogs_pct', 'labor_pct', 'overhead_pct', 'avg_ticket'];
    const section = buildRevealedDataSection(c, revealed);

    expect(section).toContain('DATA THE CANDIDATE ACTUALLY RECEIVED');
    expect(section).toContain('DATA NEVER REVEALED');

    // Received block names a revealed item with its value
    const cogs = c.dataLedger.find(d => d.id === 'cogs_pct')!;
    expect(section).toContain(`- ${cogs.label}: ${cogs.value}`);

    // The withheld root-cause bean item appears under never-revealed, label only
    const bean = c.dataLedger.find(d => d.id === 'bean_price_change')!;
    expect(section).toContain(`DATA NEVER REVEALED`);
    const withheldPart = section.split('DATA NEVER REVEALED')[1];
    expect(withheldPart).toContain(bean.label);
    expect(withheldPart).not.toContain(bean.value); // never expose an un-revealed value
  });

  it('handles the nothing-revealed case', () => {
    const section = buildRevealedDataSection(c, []);
    expect(section).toContain('DATA THE CANDIDATE ACTUALLY RECEIVED during the interview:\n- (none)');
  });

  it('splits requested-and-unanswered ledger data into its own coverage-gap section (Rule 11 v4.1)', () => {
    const bean = c.dataLedger.find(d => d.id === 'bean_price_change')!;
    const section = buildRevealedDataSection(c, ['cogs_pct', 'avg_ticket'], {
      requestedUnanswered: [{ ledgerItemId: bean.id, label: bean.label, what: 'is this commodity inflation', turnIndex: 9 }],
      requestedNotInCase: [],
    });

    const gapPart = section.split('REQUESTED BUT NEVER PROVIDED')[1];
    expect(gapPart).toBeDefined();
    expect(gapPart).toContain(bean.label);
    expect(gapPart).toContain('is this commodity inflation');
    expect(gapPart).toContain('turn 9');
    // Directive travels with the section: coverage caveat, never charged, including topFix, verify in transcript.
    expect(gapPart).toContain('coverageCaveat');
    expect(gapPart).toContain('topFix');
    expect(gapPart).toContain('confirm in the transcript');

    // Not double-listed under plain never-revealed
    const neverRevealedPart = section.split('DATA NEVER REVEALED')[1].split('REQUESTED BUT NEVER PROVIDED')[0];
    expect(neverRevealedPart).not.toContain(bean.label);

    expect(section).not.toContain(bean.value);
  });

  it('lists requests for data not in the case as fair game, not a coverage gap', () => {
    const section = buildRevealedDataSection(c, [], {
      requestedUnanswered: [],
      requestedNotInCase: [{ what: 'store-level concentration', response: 'none', turnIndex: 2 }],
    });
    expect(section).not.toContain('REQUESTED BUT NEVER PROVIDED');
    const part = section.split('REQUESTED BUT NOT IN THE CASE DATA')[1];
    expect(part).toContain('store-level concentration');
    expect(part).toContain('not a coverage gap');
  });

  it('with no request data, output is unchanged from the plain two-section form', () => {
    const revealed = ['cogs_pct'];
    expect(buildRevealedDataSection(c, revealed, { requestedUnanswered: [], requestedNotInCase: [] }))
      .toBe(buildRevealedDataSection(c, revealed));
  });

  it('handles the everything-revealed case', () => {
    const allIds = c.dataLedger.map(d => d.id);
    const section = buildRevealedDataSection(c, allIds);
    expect(section).toContain('DATA NEVER REVEALED to the candidate (they could not have seen or used these values):\n- (none)');
  });
});
