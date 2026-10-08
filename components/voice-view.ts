// What the voice page shows, from the agent's messages (spec
// 2026-10-08-voice-phase-b §6). Pure, so it is tested without a browser.
// Interviewer captions hold only heard words (the agent sends them that way);
// an exhibit withdrawn by the agent leaves the screen.
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import type { ServerMessage, VoiceState } from '@/lib/voice/protocol';

export type Caption = { who: 'interviewer' | 'candidate'; turnSeq: number; text: string; final: boolean };

export type VoiceView = {
  phase: 'idle' | 'connecting' | VoiceState;
  stateTurnSeq: number;   // the turn the current state belongs to (client timing)
  captions: Caption[];
  exhibits: (ExhibitDisplay & { turnSeq: number })[];   // turnSeq: for the browser's confirmation
  latency: { turnSeq: number; firstSoundMs: number | null; firstUsefulMs: number | null } | null;
  canScore: boolean;
  endedReason: string | null;
  error: string | null;
  lastInterviewerSeq: number;
};

export const initialView: VoiceView = {
  phase: 'idle', stateTurnSeq: 0, captions: [], exhibits: [], latency: null, canScore: false, endedReason: null, error: null, lastInterviewerSeq: 0,
};

const MAX_CAPTIONS = 8;

export function applyMessage(v: VoiceView, m: ServerMessage): VoiceView {
  switch (m.type) {
    case 'hello':
      return v;
    case 'state':
      return v.phase === 'ended' ? v : { ...v, phase: m.state, stateTurnSeq: m.turnSeq };
    case 'caption': {
      if (m.who === 'interviewer' && m.turnSeq < v.lastInterviewerSeq) return v;
      let captions = m.replaces !== undefined
        ? v.captions.filter(c => !(c.who === 'candidate' && c.turnSeq === m.replaces))
        : v.captions;
      const next: Caption = { who: m.who, turnSeq: m.turnSeq, text: m.text, final: m.final };
      const at = captions.findIndex(c => c.who === m.who && c.turnSeq === m.turnSeq);
      captions = at >= 0 ? captions.map((c, i) => (i === at ? next : c)) : [...captions, next];
      return {
        ...v,
        captions: captions.slice(-MAX_CAPTIONS),
        lastInterviewerSeq: m.who === 'interviewer' ? Math.max(v.lastInterviewerSeq, m.turnSeq) : v.lastInterviewerSeq,
      };
    }
    case 'exhibit':
      return v.exhibits.some(e => e.id === m.exhibit.id) ? v : { ...v, exhibits: [...v.exhibits, { ...m.exhibit, turnSeq: m.turnSeq }] };
    case 'exhibit_withdraw':
      return { ...v, exhibits: v.exhibits.filter(e => e.id !== m.exhibitId) };
    case 'latency':
      return { ...v, latency: { turnSeq: m.turnSeq, firstSoundMs: m.firstSoundMs, firstUsefulMs: m.firstUsefulMs } };
    case 'ended':
      return { ...v, phase: 'ended', endedReason: m.reason, canScore: m.reason === 'case_complete' && !m.scoringSuppressed };
    case 'error':
      return { ...v, error: m.message };
  }
}
