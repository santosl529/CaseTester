// Incremental reader for the interviewer's JSON turn ({"actions":[...]}, see
// json-actions.ts) as it streams. Emits each complete sentence of a "say"
// text as soon as it is written — the unit voice hands to TTS — and each
// action when its object closes. Sentences split on . ? ! followed by
// whitespace, or at the end of the string: the same boundary the guards use
// ((?<=[.!?])\s+), so "58.5%" never splits. The final action list is still
// parsed from the whole text (parseResponse) at the end of the stream.
import type { RawAction } from './json-actions';

export type ParsedEvent =
  | { type: 'sentence'; text: string; sayIndex: number; actionIndex: number } // actionIndex: the action the sentence belongs to
  | { type: 'action'; raw: RawAction; index: number };

const ACTION_DEPTH = 3; // { root  [ actions  { action
const TEXT_KEY = /"text"\s*:\s*$/;

export class ActionStreamParser {
  private buf = '';
  private pos = 0;
  private depth = 0;
  private inStr = false;
  private inSayText = false;
  private objStart = -1;
  private actionIndex = 0;
  private sayIndex = -1;
  private sentence = '';

  get text(): string { return this.buf; }

  push(chunk: string): ParsedEvent[] {
    this.buf += chunk;
    const out: ParsedEvent[] = [];
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (this.inStr) {
        if (c === '\\') {
          const need = this.buf[this.pos + 1] === 'u' ? 6 : 2;
          if (this.pos + need > this.buf.length) break; // rest of the escape not here yet
          if (this.inSayText) this.sentence += JSON.parse(`"${this.buf.slice(this.pos, this.pos + need)}"`) as string;
          this.pos += need;
          continue;
        }
        if (c === '"') {
          if (this.inSayText) this.flush(out);
          this.inStr = false;
          this.inSayText = false;
          this.pos++;
          continue;
        }
        if (this.inSayText && /[.?!]/.test(c)) {
          if (this.pos + 1 >= this.buf.length) break; // the next char decides the boundary
          this.sentence += c;
          if (/\s/.test(this.buf[this.pos + 1])) this.flush(out);
          this.pos++;
          continue;
        }
        if (this.inSayText) this.sentence += c;
        this.pos++;
        continue;
      }
      if (c === '"') {
        this.inStr = true;
        this.inSayText = this.depth === ACTION_DEPTH && this.objStart >= 0
          && TEXT_KEY.test(this.buf.slice(this.objStart, this.pos));
        if (this.inSayText) { this.sayIndex++; this.sentence = ''; }
      } else if (c === '{' || c === '[') {
        this.depth++;
        if (c === '{' && this.depth === ACTION_DEPTH) this.objStart = this.pos;
      } else if (c === '}' || c === ']') {
        if (c === '}' && this.depth === ACTION_DEPTH && this.objStart >= 0) {
          try {
            out.push({ type: 'action', raw: JSON.parse(this.buf.slice(this.objStart, this.pos + 1)) as RawAction, index: this.actionIndex++ });
          } catch { /* malformed object: left to the final parse */ }
          this.objStart = -1;
        }
        this.depth--;
      }
      this.pos++;
    }
    return out;
  }

  private flush(out: ParsedEvent[]): void {
    const text = this.sentence.trim();
    if (text) out.push({ type: 'sentence', text, sayIndex: this.sayIndex, actionIndex: this.actionIndex });
    this.sentence = '';
  }
}
