import { describe, it, expect } from 'vitest';
import { detectNestedPercentConversion, formatUnitCheckHint } from '@/lib/orchestrator/unit-check';

describe('detectNestedPercentConversion', () => {
  it('fires on the exact live-run bean error (share of COGS → points of revenue)', () => {
    const text =
      "If raw beans were, say, 60% of COGS two years ago, a 40% increase would theoretically add ~24 points to COGS % of revenue.";
    expect(detectNestedPercentConversion(text)).toBe(true);
  });

  it('fires when a share of COGS is converted to points of margin', () => {
    expect(detectNestedPercentConversion('Beans are 50% of COGS so that is 20 points of margin.')).toBe(true);
  });

  it('does NOT fire on a plain COGS-as-%-of-revenue statement', () => {
    expect(detectNestedPercentConversion('COGS is 58% of revenue today, up from 42%.')).toBe(false);
  });

  it('does NOT fire on non-nested reasoning', () => {
    expect(detectNestedPercentConversion('The margin fell 18 points while revenue grew 15%.')).toBe(false);
  });

  it('hint tells the interviewer to probe units without handing over the method', () => {
    const hint = formatUnitCheckHint();
    expect(hint).toContain('Points of what?');
    expect(hint).not.toMatch(/×|COGS as a % of revenue/);
  });
});
