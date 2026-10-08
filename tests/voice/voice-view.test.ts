// The voice page's view of the agent's messages (spec 2026-10-08-voice-phase-b §6).
import { describe, it, expect } from 'vitest';
import { applyMessage, initialView, type VoiceView } from '@/components/voice-view';
import type { ServerMessage } from '@/lib/voice/protocol';

const run = (msgs: ServerMessage[], v: VoiceView = initialView) => msgs.reduce(applyMessage, v);
const exhibit = (id: string) => ({ id, title: 'Costs', chartType: 'table', data: [] });

describe('voice view', () => {
  it('keeps one interviewer caption per turn and ignores older turns', () => {
    const v = run([
      { type: 'caption', who: 'interviewer', turnSeq: 2, text: 'There are', final: false },
      { type: 'caption', who: 'interviewer', turnSeq: 2, text: 'There are 120 stores.', final: true },
      { type: 'caption', who: 'interviewer', turnSeq: 1, text: 'stale', final: false },
    ]);
    expect(v.captions.filter(c => c.who === 'interviewer').map(c => c.text)).toEqual(['There are 120 stores.']);
  });

  it('replaces a cancelled turn’s candidate caption with the merged one', () => {
    const v = run([
      { type: 'caption', who: 'candidate', turnSeq: 3, text: 'I think the issue is', final: true },
      { type: 'caption', who: 'candidate', turnSeq: 4, text: 'I think the issue is costs.', final: true, replaces: 3 },
    ]);
    expect(v.captions.map(c => c.text)).toEqual(['I think the issue is costs.']);
  });

  it('keeps the last eight captions', () => {
    const v = run(Array.from({ length: 12 }, (_, i): ServerMessage => ({ type: 'caption', who: 'candidate', turnSeq: i + 1, text: `c${i + 1}`, final: true })));
    expect(v.captions.map(c => c.text)).toEqual(['c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12']);
  });

  it('shows exhibits once and removes a withdrawn one', () => {
    const v = run([
      { type: 'exhibit', turnSeq: 2, exhibit: exhibit('exhibit-a') },
      { type: 'exhibit', turnSeq: 2, exhibit: exhibit('exhibit-a') },
    ]);
    expect(v.exhibits.map(e => e.id)).toEqual(['exhibit-a']);
    expect(run([{ type: 'exhibit_withdraw', turnSeq: 2, exhibitId: 'exhibit-a' }], v).exhibits).toEqual([]);
  });

  it('offers scoring only after a natural end', () => {
    expect(run([{ type: 'ended', reason: 'case_complete', scoringSuppressed: false }])).toMatchObject({ phase: 'ended', canScore: true });
    expect(run([{ type: 'ended', reason: 'case_complete', scoringSuppressed: true }]).canScore).toBe(false);
    expect(run([{ type: 'ended', reason: 'time_limit', scoringSuppressed: true }]).canScore).toBe(false);
  });

  it('a hello from the agent changes nothing on screen', () => {
    expect(run([{ type: 'hello' }])).toEqual(initialView);
  });

  it('tracks the state, the last latency and errors', () => {
    const v = run([
      { type: 'state', state: 'thinking', turnSeq: 2 },
      { type: 'latency', turnSeq: 2, firstSoundMs: 900, firstUsefulMs: 2100 },
      { type: 'error', message: 'audio failed' },
    ]);
    expect(v.stateTurnSeq).toBe(2);
    expect(v).toMatchObject({ phase: 'thinking', latency: { turnSeq: 2, firstSoundMs: 900, firstUsefulMs: 2100 }, error: 'audio failed' });
  });
});
