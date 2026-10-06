// Incremental reader for the interviewer's JSON turn (turn-schema.ts) as it
// streams. Emits each top-level field when its value closes, and the "say"
// text sentence by sentence while it is written — the unit voice hands to
// TTS. Sentences split on . ? ! followed by whitespace (the guards' boundary,
// so "58.5%" never splits); a JSON escape after a sentence end (e.g. "\n")
// does not split, so a "\n\nuser …" continuation stays inside its sentence
// where the fabricated-turn check sees it.

export type TurnStreamEvent =
  | { type: 'field'; key: string; value: unknown }
  | { type: 'sentence'; text: string };

type Expect = 'key' | 'colon' | 'value' | 'after';

export class TurnStreamParser {
  private buf = '';
  private pos = 0;
  private depth = 0;          // nesting of { and [ outside strings
  private inStr = false;
  private expect: Expect = 'key';
  private key = '';
  private keyStart = -1;
  private valueStart = -1;
  private inSay = false;
  private sentence = '';

  get text(): string { return this.buf; }

  push(chunk: string): TurnStreamEvent[] {
    this.buf += chunk;
    const out: TurnStreamEvent[] = [];
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (this.inStr) {
        if (c === '\\') {
          const need = this.buf[this.pos + 1] === 'u' ? 6 : 2;
          if (this.pos + need > this.buf.length) break; // rest of the escape not here yet
          if (this.inSay) this.sentence += JSON.parse(`"${this.buf.slice(this.pos, this.pos + need)}"`) as string;
          this.pos += need;
          continue;
        }
        if (c === '"') {
          this.inStr = false;
          this.pos++;
          if (this.depth === 1 && this.expect === 'key') {
            this.key = JSON.parse(this.buf.slice(this.keyStart, this.pos)) as string;
            this.expect = 'colon';
          } else if (this.inSay) {
            this.flush(out);
            this.inSay = false;
          }
          continue;
        }
        if (this.inSay && /[.?!]/.test(c)) {
          if (this.pos + 1 >= this.buf.length) break; // the next char decides the boundary
          this.sentence += c;
          if (/\s/.test(this.buf[this.pos + 1])) this.flush(out);
          this.pos++;
          continue;
        }
        if (this.inSay) this.sentence += c;
        this.pos++;
        continue;
      }

      // Outside strings.
      if (/\s/.test(c)) { this.pos++; continue; }
      if (this.depth === 1 && this.expect === 'key') {
        if (c === '"') { this.inStr = true; this.keyStart = this.pos; }
        this.pos++;
        continue;
      }
      if (this.depth === 1 && this.expect === 'colon') {
        if (c === ':') { this.expect = 'value'; this.valueStart = -1; }
        this.pos++;
        continue;
      }
      if (this.depth === 1 && this.expect === 'value' && this.valueStart === -1) {
        this.valueStart = this.pos;
        if (c === '"' && this.key === 'say') { this.inSay = true; this.sentence = ''; }
      }
      if (c === '"') { this.inStr = true; this.pos++; continue; }
      if (c === '{' || c === '[') { this.depth++; this.pos++; continue; }
      if (c === '}' || c === ']') {
        if (this.depth === 1 && c === '}') this.endValue(out, this.pos);
        this.depth--;
        this.pos++;
        continue;
      }
      if (c === ',' && this.depth === 1) {
        this.endValue(out, this.pos);
        this.expect = 'key';
        this.pos++;
        continue;
      }
      this.pos++;
    }
    return out;
  }

  private endValue(out: TurnStreamEvent[], end: number): void {
    if (this.expect !== 'value' || this.valueStart === -1) return;
    try {
      out.push({ type: 'field', key: this.key, value: JSON.parse(this.buf.slice(this.valueStart, end)) });
    } catch { /* malformed value: left to the final parse */ }
    this.valueStart = -1;
    this.expect = 'after';
  }

  private flush(out: TurnStreamEvent[]): void {
    const text = this.sentence.trim();
    if (text) out.push({ type: 'sentence', text });
    this.sentence = '';
  }
}
