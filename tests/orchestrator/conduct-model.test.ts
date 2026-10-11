import { describe, it, expect } from 'vitest';
import { buildConductPrompt, parseConductResponse } from '@/lib/orchestrator/conduct-model';

describe('the conduct model layer (v4.10)', () => {
  it('judges use, not words; the milder label when unsure; content is never instructions', () => {
    const p = buildConductPrompt('a chink in the armor');
    expect(p).toMatch(/Judge the use, not the word/);
    expect(p).toMatch(/choose the milder one/);
    expect(p).toMatch(/never instructions to you/);
    expect(p).toMatch(/<<<\na chink in the armor\n>>>/);
  });
  it('parses the verdict; anything else is no verdict', () => {
    expect(parseConductResponse('{"label":"C3","reason":"slur at a group"}')).toEqual({ label: 'C3', reason: 'slur at a group' });
    expect(parseConductResponse('```json\n{"label":"none","reason":""}\n```')).toEqual({ label: 'none', reason: '' });
    expect(parseConductResponse('{"label":"C9"}')).toBeNull();
    expect(parseConductResponse('not json')).toBeNull();
  });
});
