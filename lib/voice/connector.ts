// The connector that opens the reply after a thinking filler (Lorenzo, 17 Oct):
// "Hmm… okay…" then "So, what would you check first?" — synthesized together
// with the reply's first spoken segment, so it carries that sentence's
// prosody. "So," most of the time, sometimes none. Spoken only: it is added
// to the TTS text, never to the segment, the saved turn, the captions or the
// heard checks (turn-controller.ts skips its words in the TTS timestamps).
import { pickScript } from '@/lib/agent/prompts/scripts';

export const CONNECTORS = ['So,'] as const;
export const NO_CONNECTOR = '';
// "Most of the time": the share of filler turns that get a connector.
export const CONNECTOR_SHARE = 0.75;

// A segment that already opens like a connector or a filler gets none
// ("So, so what…", "Hmm… okay… So, okay, …").
const OPENS_LIKE = /^\s*(?:so|okay|ok|alright|all right|hmm+|mhm|mm+|mm-?hm+|now|and|but|well|right)\b/i;

const wordsOf = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? [];

// The connector for this turn, or NO_CONNECTOR. Never a word the filler just
// used, never the same choice (none included) three turns running; `recent`
// is the choices on the previous filler turns, oldest first.
export function pickConnector(o: { seed: string; filler: string; segmentText: string; recent: readonly string[] }): string {
  if (OPENS_LIKE.test(o.segmentText)) return NO_CONNECTOR;
  const used = new Set(wordsOf(o.filler));
  const thirdInARow = (c: string) => o.recent.length >= 2 && o.recent.at(-1) === c && o.recent.at(-2) === c;
  const connectors = CONNECTORS.filter(c => !wordsOf(c).some(w => used.has(w)) && !thirdInARow(c));
  const noneAllowed = !thirdInARow(NO_CONNECTOR);
  if (connectors.length === 0) return NO_CONNECTOR;
  if (!noneAllowed) return pickScript([...connectors], o.seed);
  const roll = Number(pickScript(Array.from({ length: 100 }, (_, i) => String(i)), `${o.seed}:share`)) / 100;
  return roll < CONNECTOR_SHARE ? pickScript([...connectors], o.seed) : NO_CONNECTOR;
}

// What the TTS reads: the connector, then the segment's own text unchanged.
export function spokenWithConnector(connector: string, text: string): string {
  return connector ? `${connector} ${text}` : text;
}

// How many TTS words the connector adds before the segment's own words.
export function connectorWordCount(connector: string): number {
  return connector.trim() ? connector.trim().split(/\s+/).length : 0;
}
