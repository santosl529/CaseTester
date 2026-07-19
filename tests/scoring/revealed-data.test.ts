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

  it('handles the everything-revealed case', () => {
    const allIds = c.dataLedger.map(d => d.id);
    const section = buildRevealedDataSection(c, allIds);
    expect(section).toContain('DATA NEVER REVEALED to the candidate (they could not have seen or used these values):\n- (none)');
  });
});
