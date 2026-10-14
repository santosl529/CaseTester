// Lorenzo, 13 Oct (Larkspur rulings, d; Destiny, persona 6: the simulated
// candidate's call returned no text block and no refusal, and the run was
// lost with no record of why): an empty reply names its stop reason and block
// types, and the run is written as a partial run marked failed.
import { describe, it, expect } from 'vitest';
import { simulatorReplyText, SimulatorReplyError, describeStop } from '@/lib/eval/simulator-reply';
import { planWave, markWaveResults } from '@/lib/eval/batch-manifest';

const reply = (content: { type: string; text?: string }[], stop_reason: string | null = 'end_turn') => ({ content, stop_reason, model: 'claude-opus-5' });

describe("the simulated candidate's reply", () => {
  it('its text blocks, joined', () => {
    expect(simulatorReplyText(reply([{ type: 'thinking' }, { type: 'text', text: 'Revenue first.' }, { type: 'text', text: 'Then costs.' }]))).toBe('Revenue first.\nThen costs.');
  });
  it('only text blocks are the reply (no other block is spoken, whatever it carries)', () => {
    expect(simulatorReplyText(reply([{ type: 'thinking', text: 'planning my answer' }, { type: 'text', text: 'Revenue first.' }]))).toBe('Revenue first.');
  });
  it('no text: an error that names the stop reason, the block types and the model', () => {
    let err: unknown;
    try { simulatorReplyText(reply([{ type: 'thinking' }, { type: 'redacted_thinking' }], 'max_tokens')); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(SimulatorReplyError);
    expect((err as SimulatorReplyError).stop).toEqual({ stopReason: 'max_tokens', blockTypes: ['thinking', 'redacted_thinking'], model: 'claude-opus-5' });
    expect((err as Error).message).toBe('candidate simulator returned no text — stop reason max_tokens, blocks [thinking, redacted_thinking], model claude-opus-5');
  });
  it('whitespace only is no text; no blocks at all is said as such', () => {
    expect(() => simulatorReplyText(reply([{ type: 'text', text: '  \n' }]))).toThrow(/blocks \[text\]/);
    expect(() => simulatorReplyText(reply([], null))).toThrow(/stop reason none, blocks \[none\]/);
  });
  it('a refusal says so, with the same detail', () => {
    expect(() => simulatorReplyText(reply([], 'refusal'))).toThrow(/^candidate simulator refused — stop reason refusal/);
  });
  it('describeStop', () => expect(describeStop({ stopReason: 'end_turn', blockTypes: ['text'], model: 'm' })).toBe('stop reason end_turn, blocks [text], model m'));
});

describe('a partial run is a failed run', () => {
  const base = { commit: 'c1', codeDirty: false, codeChanged: false, date: new Date('2026-10-13T15:00:00'), models: { interviewer: 'claude-sonnet-5-5' }, knownIds: [1, 2] };
  it('its run file exists, but it is marked failed: harness', () => {
    let m = planWave(null, { ...base, personaIds: [1, 2] }).manifest;
    m = markWaveResults(m, m.runs.map(r => ({ ...r, runDir: `dir-${r.personaId}` })), () => true, () => null, dir => (dir === 'dir-2' ? 'candidate simulator returned no text — stop reason end_turn, blocks [thinking], model claude-opus-5' : null));
    expect(m.runs.map(r => [r.status, r.failure ?? null])).toEqual([['done', null], ['failed', 'harness']]);
    expect(m.runs[1].harnessError).toMatch(/no text/);
  });
});
