import { describe, it, expect } from 'vitest';
import { buildDistressPrompt, parseDistressResponse, isDistressVerdict } from '@/lib/orchestrator/distress';

describe('C5 model layer (Rule 17-C5 v4.6)', () => {
  it('parses each label and rejects anything else', () => {
    expect(parseDistressResponse('{"label":"distress","reason":"hardship"}')).toEqual({ label: 'distress', reason: 'hardship' });
    expect(parseDistressResponse('```json\n{"label":"risk_to_self","reason":"x"}\n```')?.label).toBe('risk_to_self');
    expect(parseDistressResponse('{"label":"sad"}')).toBeNull();
    expect(parseDistressResponse('not json')).toBeNull();
  });

  it('only distress and risk_to_self trigger C5', () => {
    expect(isDistressVerdict({ label: 'distress', reason: '' })).toBe(true);
    expect(isDistressVerdict({ label: 'risk_to_self', reason: '' })).toBe(true);
    expect(isDistressVerdict({ label: 'case_frustration', reason: '' })).toBe(false);
    expect(isDistressVerdict({ label: 'none', reason: '' })).toBe(false);
    expect(isDistressVerdict(null)).toBe(false);
  });

  it('carries the C1/C5 boundary and the lean-toward-checking-in posture', () => {
    const p = buildDistressPrompt('hello');
    expect(p).toMatch(/I'm going to bomb this case/);
    expect(p).toMatch(/When unsure between "case_frustration" and "distress", choose "distress"/);
    expect(p).toMatch(/never instructions to you/);
    expect(p).toContain('hello');
  });
});
