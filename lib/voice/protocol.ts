// The data-channel protocol between the voice agent and the browser (spec
// 2026-10-08-voice-phase-b §5, §6). Types only plus one parser, so the client
// can import it; the exhibit display is what the text UI already shows.
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import type { CaptionWord } from './caption-timing';

export const AGENT_NAME = 'case-interviewer';
export const DATA_TOPIC = 'case';

export type VoiceState = 'waiting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export type ServerMessage =
  // The agent is in the room and listening for `ready` — sent whenever it
  // (re)joins, because a `ready` sent before it joined is lost (§5.1).
  | { type: 'hello' }
  | { type: 'state'; state: VoiceState; turnSeq: number }
  // A candidate caption with `replaces` supersedes a cancelled turn's (its
  // text was carried). An interviewer caption is what was heard: sent at a cut
  // and at the turn's end, replacing the whole sentences shown.
  | { type: 'caption'; who: 'interviewer' | 'candidate'; turnSeq: number; text: string; final: boolean; replaces?: number }
  // An interviewer segment's audio has started (18 Oct, item 7): its whole text
  // and each word's start (ms from the segment's first audio; null while not
  // timed), for the browser to show dimmed and brighten as it is spoken.
  | { type: 'caption_segment'; turnSeq: number; index: number; text: string; words: CaptionWord[] }
  // The word starts that arrived after the audio started (Cartesia streams them with it): at most one per segment.
  | { type: 'caption_words'; turnSeq: number; index: number; words: CaptionWord[] }
  | { type: 'exhibit'; turnSeq: number; exhibit: ExhibitDisplay }
  | { type: 'exhibit_withdraw'; turnSeq: number; exhibitId: string }
  | { type: 'latency'; turnSeq: number; firstSoundMs: number | null; firstUsefulMs: number | null }
  | { type: 'ended'; reason: 'case_complete' | 'tts_cap' | 'time_limit' | 'error'; scoringSuppressed: boolean }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'ready' }                                            // audio can play (§5.1)
  | { type: 'audio_blocked' }                                    // it no longer can
  | { type: 'exhibit_shown'; turnSeq: number; exhibitId: string } // rendered (§5.3)
  | { type: 'timing'; turnSeq: number; clientFirstSoundMs: number }
  // The interview screen's toggle for the thinking sounds and the "So,"
  // connector (item 3, 17 Oct): sent when changed and with every `ready`, so an
  // agent that (re)joins learns it; the agent applies it from the next turn.
  | { type: 'fillers'; on: boolean };

// A browser message, or null for anything else.
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  if (m.type === 'ready' || m.type === 'audio_blocked') return { type: m.type };
  if (m.type === 'exhibit_shown' && Number.isInteger(m.turnSeq) && typeof m.exhibitId === 'string') {
    return { type: 'exhibit_shown', turnSeq: m.turnSeq as number, exhibitId: m.exhibitId };
  }
  if (m.type === 'fillers' && typeof m.on === 'boolean') return { type: 'fillers', on: m.on };
  if (m.type === 'timing' && Number.isInteger(m.turnSeq) && typeof m.clientFirstSoundMs === 'number') {
    return { type: 'timing', turnSeq: m.turnSeq as number, clientFirstSoundMs: m.clientFirstSoundMs };
  }
  return null;
}
