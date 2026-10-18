// A voice session's review files from the database (scripts/voice-export.ts):
// the per-turn jsonl as the agent used to write it, and a turn-by-turn
// transcript. Pure; the script does the reads and writes.
export type ExportedLine = { line: unknown; createdAt: Date | string };
export type ExportedTurn = { turnIndex: number; role: string; text: string; timestampMs: number };

// The day the agent started (its first line), as the old voice-live/<date>/ folder.
export function sessionDate(lines: ExportedLine[], fallback: Date | string): string {
  return new Date(lines[0]?.createdAt ?? fallback).toISOString().slice(0, 10);
}

export const jsonlOf = (lines: ExportedLine[]) => lines.map(l => JSON.stringify(l.line) + '\n').join('');

export function transcriptMd(s: { id: string; caseId: string; status: string; startedAt: Date | string }, turns: ExportedTurn[]): string {
  const sorted = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);
  const t0 = sorted[0]?.timestampMs ?? 0;
  const clock = (ms: number) => { const sec = Math.max(0, Math.round((ms - t0) / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const out = [`# Voice session ${s.id}`, '', `- Case \`${s.caseId}\` · status **${s.status}** · started ${new Date(s.startedAt).toISOString()}`, ''];
  for (const t of sorted) {
    out.push(`**t${t.turnIndex} ${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}** (${clock(t.timestampMs)}): ${t.text}`, '');
  }
  return out.join('\n');
}
