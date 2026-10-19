// The echo guard (Lorenzo, 19 Oct; sessions 97cc44af and f3b07c57, laptop
// speakers): the room hears the interviewer and speech-to-text writes it down
// as the candidate ("chain with" cut the opening). A barge whose words mostly
// follow the interviewer's own recent text, in order, is that echo. A real
// interruption adds its own words ("wait, sorry, I have a question"; "did you
// say twenty four percent?"), so its share in order stays low.
import { normalizeNumberWords } from '@/lib/number-words';

export const ECHO_MIN_SCORE = 0.8;      // share of the barge's words, in order, in the recent text
export const ECHO_WINDOW_MS = 10_000;   // interviewer text playing, or played this recently

// Words as speech-to-text writes them: number words as digits, "%" as "percent", "&" as "and".
export function echoTokens(text: string): string[] {
  const t = normalizeNumberWords(text.toLowerCase().replace(/[‘’]/g, "'").replace(/%/g, ' percent').replace(/&/g, ' and '));
  return t.replace(/(\d),(\d)/g, '$1$2').match(/[a-z0-9]+(?:'[a-z]+)?|\d+(?:\.\d+)?/g) ?? [];
}

// The longest run of the barge's words found in order (not necessarily
// adjacent) in the recent text, over the barge's length.
export function echoScore(transcript: string, recent: string[]): number {
  const a = echoTokens(transcript);
  const b = echoTokens(recent.join(' '));
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length] / a.length;
}

export function isEcho(transcript: string, recent: string[]): boolean {
  return echoTokens(transcript).length > 0 && echoScore(transcript, recent) >= ECHO_MIN_SCORE;
}
