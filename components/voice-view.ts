// What the voice page shows, from the agent's messages (spec
// 2026-10-08-voice-phase-b §6). Pure, so it is tested without a browser.
// Interviewer captions: whole sentences while spoken, then what was heard;
// an exhibit withdrawn by the agent leaves the screen.
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import type { ServerMessage, VoiceState } from '@/lib/voice/protocol';
import type { CaptionWord } from '@/lib/voice/caption-timing';

// An interviewer segment shown whole (item 7, 18 Oct): its words, timed from
// `at` (the message's arrival, performance.now()) — the page brightens them.
export type CaptionSegment = { index: number; text: string; words: CaptionWord[]; at: number };
export type Caption = { who: 'interviewer' | 'candidate'; turnSeq: number; text: string; final: boolean; segments?: CaptionSegment[] };
// A message as the page dispatches it: with its arrival time.
export type ArrivedMessage = ServerMessage & { receivedAt?: number };

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

export function applyMessage(v: VoiceView, m: ArrivedMessage): VoiceView {
  switch (m.type) {
    case 'caption_segment': {
      if (m.turnSeq < v.lastInterviewerSeq) return v;
      const at = v.captions.findIndex(c => c.who === 'interviewer' && c.turnSeq === m.turnSeq);
      const prev = at >= 0 ? v.captions[at] : null;
      const segments = [...(prev?.segments ?? []).filter(x => x.index !== m.index), { index: m.index, text: m.text, words: m.words, at: m.receivedAt ?? 0 }]
        .sort((a, b) => a.index - b.index);
      const next: Caption = { who: 'interviewer', turnSeq: m.turnSeq, text: segments.map(x => x.text).join(' '), final: false, segments };
      const captions = at >= 0 ? v.captions.map((c, i) => (i === at ? next : c)) : [...v.captions, next];
      return { ...v, captions: captions.slice(-MAX_CAPTIONS), lastInterviewerSeq: Math.max(v.lastInterviewerSeq, m.turnSeq) };
    }
    case 'caption_words':
      return {
        ...v,
        captions: v.captions.map(c => c.who === 'interviewer' && c.turnSeq === m.turnSeq && c.segments
          ? { ...c, segments: c.segments.map(x => (x.index === m.index ? { ...x, words: m.words } : x)) }
          : c),
      };
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
      return { ...v, phase: 'ended', endedReason: m.reason, canScore: (m.reason === 'case_complete' || m.reason === 'tts_cap') && !m.scoringSuppressed };
    case 'error':
      return { ...v, error: m.message };
  }
}
