import { describe, it, expect } from 'vitest';
import { auditTurnStyle, MAX_INTERVIEWER_WORDS } from '@/lib/orchestrator/audit';

describe('auditTurnStyle', () => {
  it('passes a short, plain, single-question turn', () => {
    const r = auditTurnStyle('Okay. Walk me through that calculation?');
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('passes a neutral statement with no question', () => {
    const r = auditTurnStyle('Understood. Take a minute to lay out your structure.');
    expect(r.passed).toBe(true);
  });

  it('fails a turn over the word cap', () => {
    const longTurn = Array(MAX_INTERVIEWER_WORDS + 10).fill('word').join(' ');
    const r = auditTurnStyle(longTurn);
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('too_long');
  });

  it('fails markdown bold', () => {
    const r = auditTurnStyle('Look at the **COGS trend** here.');
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('markdown');
  });

  it('fails markdown bullet lists', () => {
    const r = auditTurnStyle('Consider:\n- revenue\n- costs');
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('markdown');
  });

  it('fails markdown headers', () => {
    const r = auditTurnStyle('## Next steps\nWhat would you do?');
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('markdown');
  });

  it('flags stacked questions as a soft QA signal, not a violation (Rule 4)', () => {
    const r = auditTurnStyle('What drives cost? And is it all stores? What about pricing?');
    expect(r.passed).toBe(true); // soft flag never blocks
    expect(r.flags).toContain('stacked_questions');
  });

  it('allows one question alongside plain sentences', () => {
    const r = auditTurnStyle('Okay. Is that the next data you would pull?');
    expect(r.passed).toBe(true);
    expect(r.flags).toHaveLength(0);
  });

  it('exempts data-delivery turns from the length cap (Rule 5 whitelist)', () => {
    const longReadout = Array(MAX_INTERVIEWER_WORDS + 10).fill('word').join(' ');
    const r = auditTurnStyle(longReadout, { lengthExempt: true });
    expect(r.passed).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('length exemption does not exempt markdown', () => {
    const r = auditTurnStyle('Here is the **data** you asked for.', { lengthExempt: true });
    expect(r.passed).toBe(false);
    expect(r.violations).toContain('markdown');
  });

  it('reports word count', () => {
    const r = auditTurnStyle('Go on.');
    expect(r.wordCount).toBe(2);
  });
});
