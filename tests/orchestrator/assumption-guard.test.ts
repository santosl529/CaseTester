import { describe, it, expect } from 'vitest';
import { withholdAssumptionChallenges } from '@/lib/orchestrator/assumption-guard';

const MENU = { ledgerItemId: 'menu_price_change', label: 'Menu price changes over 2 years' };
const TICKET = { ledgerItemId: 'avg_ticket', label: 'Average transaction value' };

describe('assumption-challenge guard (Rule 11 v4.5)', () => {
  it("withholds Maya's 11:30 challenge about the menu prices she asked for", () => {
    const t = "You keep saying 'they haven't raised prices' — but that's the one thing you assumed. Here's the menu price change.";
    const out = withholdAssumptionChallenges(t, [MENU]);
    expect(out.text).toBe("Here's the menu price change.");
    expect(out.withheld).toEqual([{ sentence: expect.stringMatching(/one thing you assumed/), ledgerItemId: 'menu_price_change' }]);
  });

  it('leaves challenges about assumptions the candidate never tried to check', () => {
    const t = "You're assuming volume is flat. What would change if it isn't?";
    expect(withholdAssumptionChallenges(t, [MENU]).text).toBe(t);
  });

  it('leaves non-challenge sentences about the item', () => {
    const t = 'Menu prices are a fair thing to ask about. What would you do with that?';
    expect(withholdAssumptionChallenges(t, [MENU]).text).toBe(t);
  });

  it('matches "haven\'t verified" phrasing and another item', () => {
    const t = "You haven't verified the average transaction. Go on.";
    const out = withholdAssumptionChallenges(t, [MENU, TICKET]);
    expect(out.text).toBe('Go on.');
    expect(out.withheld[0].ledgerItemId).toBe('avg_ticket');
  });

  it('does nothing with no open requests', () => {
    const t = "That's the one thing you assumed about prices.";
    expect(withholdAssumptionChallenges(t, []).text).toBe(t);
  });
});
