// A voice session's record lines (turn records, client timing lines, the
// closing summary): written to the database (voice_session_lines) — a cloud
// worker's disk is wiped on restart — and, when a directory is given
// (VOICE_RECORDS_DIR; `npm run voice:agent` sets it), also appended to
// <dir>/<date>/<sessionId>.jsonl as before. Writes go one at a time, so the
// rows keep the order the lines were made in; a failed write is logged and
// the session goes on.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type LineWriter = (line: object) => Promise<void>;

export class SessionLines {
  readonly file: string | null;
  writeErrors = 0;
  private chain: Promise<void> = Promise.resolve();
  private held: object[] = [];
  private log: (msg: string) => void;

  constructor(private write: LineWriter, o: { sessionId: string; dir?: string | null; date?: Date; log?: (msg: string) => void }) {
    this.file = o.dir ? path.join(o.dir, (o.date ?? new Date()).toISOString().slice(0, 10), `${o.sessionId}.jsonl`) : null;
    if (this.file) mkdirSync(path.dirname(this.file), { recursive: true });
    this.log = o.log ?? (m => console.warn(m));
  }

  add(line: object): void {
    if (this.file) appendFileSync(this.file, JSON.stringify(line) + '\n');
    this.chain = this.chain.then(() => this.write(line)).catch(e => {
      this.writeErrors++;
      this.log(`[voice-records] database write failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  // A line kept back until release() (the jobStart line waits for the opener's
  // end: no record write while it streams; 19 Oct). Released lines go once, in order.
  hold(line: object): void { this.held.push(line); }

  release(): void {
    for (const l of this.held.splice(0)) this.add(l);
  }

  flush(): Promise<void> { return this.chain; }
}
