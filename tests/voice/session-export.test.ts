import { it, expect } from 'vitest';
import { jsonlOf, sessionDate, transcriptMd } from '@/lib/voice/session-export';

it('rebuilds the jsonl line for line, dated by the agent’s first line', () => {
  const lines = [
    { line: { turnSeq: 1, candidateText: 'Hi' }, createdAt: new Date('2026-10-17T23:59:00Z') },
    { line: { turnSeq: 1, clientFirstSoundMs: 900 }, createdAt: '2026-10-18T00:00:01Z' },
    { line: { summary: { why: 'candidate_left' } }, createdAt: '2026-10-18T00:10:00Z' },
  ];
  expect(jsonlOf(lines)).toBe('{"turnSeq":1,"candidateText":"Hi"}\n{"turnSeq":1,"clientFirstSoundMs":900}\n{"summary":{"why":"candidate_left"}}\n');
  expect(sessionDate(lines, '2026-01-01')).toBe('2026-10-17');
  expect(sessionDate([], '2026-10-16T08:00:00Z')).toBe('2026-10-16');
});

it('writes a turn-by-turn transcript with the clock from the first turn', () => {
  const md = transcriptMd({ id: 's1', caseId: 'prof-001', status: 'completed', startedAt: '2026-10-18T09:00:00Z' }, [
    { turnIndex: 1, role: 'candidate', text: 'Revenue first.', timestampMs: 1_065_000 },
    { turnIndex: 0, role: 'interviewer', text: 'Your client is a coffee chain.', timestampMs: 1_000_000 },
  ]);
  expect(md).toContain('**t0 Interviewer** (0:00): Your client is a coffee chain.\n\n**t1 Candidate** (1:05): Revenue first.');
  expect(md).toContain('Case `prof-001` · status **completed**');
});

// Session 9813d6ce (18 Oct, thinking sounds off): the saved interviewer lines
// open with the filler code picked, though none played — the transcript showed
// "Hmm… okay… Is that MECE…" as spoken. The agent's records say which were
// skipped and why; the transcript marks those as skipped.
it('marks a skipped filler as skipped, matched to its turn by the candidate message in order', () => {
  const s = { id: 's1', caseId: 'prof-001', status: 'completed', startedAt: '2026-10-18T09:00:00Z' };
  const turns = [
    { turnIndex: 0, role: 'interviewer', text: 'Your client is a coffee chain.', timestampMs: 0 },
    { turnIndex: 1, role: 'candidate', text: 'Okay.', timestampMs: 1000 },
    { turnIndex: 2, role: 'interviewer', text: 'Mhm… okay… What first?', timestampMs: 2000 },
    { turnIndex: 3, role: 'candidate', text: 'Okay.', timestampMs: 3000 },
    { turnIndex: 4, role: 'interviewer', text: 'Hmm… Why that?', timestampMs: 4000 },
    { turnIndex: 5, role: 'candidate', text: 'Costs.', timestampMs: 5000 },
    { turnIndex: 6, role: 'interviewer', text: 'Okay… Which costs?', timestampMs: 6000 },
  ];
  const at = '2026-10-18T09:00:00Z';
  const lines = [
    { line: { turnSeq: 2, candidateText: 'Okay.', ack: 'Mhm… okay…', ackSkipped: null }, createdAt: at },
    { line: { turnSeq: 3, candidateText: 'Costs', cancelled: true, ack: null, ackSkipped: { ack: 'Okay…', why: 'cut' } }, createdAt: at },
    { line: { turnSeq: 4, candidateText: 'Okay.', ack: null, ackSkipped: { ack: 'Hmm…', why: 'fillers_off' } }, createdAt: at },
    { line: { turnSeq: 4, clientFirstSoundMs: 900 }, createdAt: at },
    { line: { turnSeq: 5, candidateText: 'Costs.', ack: null, ackSkipped: { ack: 'Okay…', why: 'reply_ready' } }, createdAt: at },
  ];
  const md = transcriptMd(s, turns, lines);
  expect(md).toContain('**t2 Interviewer** (0:02): Mhm… okay… What first?');                       // played: as said
  expect(md).toContain('**t4 Interviewer** (0:04): ~~Hmm…~~ *(filler skipped: fillers_off)* Why that?');
  expect(md).toContain('**t6 Interviewer** (0:06): ~~Okay…~~ *(filler skipped: reply_ready)* Which costs?');
  expect(transcriptMd(s, turns)).toContain('**t4 Interviewer** (0:04): Hmm… Why that?');            // no records: as saved
});

// Lorenzo, 18 Oct (ruling 2): the voice check-in shows in the transcript where
// it was said, marked as a check-in (it is not a turn).
it('shows each check-in at its time, marked, with only what was heard', () => {
  const s = { id: 's1', caseId: 'prof-001', status: 'completed', startedAt: '2026-10-18T09:00:00Z' };
  const turns = [
    { turnIndex: 0, role: 'interviewer', text: 'How would you approach this?', timestampMs: 0 },
    { turnIndex: 1, role: 'candidate', text: 'Costs first.', timestampMs: 200_000 },
    { turnIndex: 2, role: 'interviewer', text: 'Which costs?', timestampMs: 203_000 },
  ];
  const at = '2026-10-18T09:00:00Z';
  const lines = [
    { line: { turnSeq: 1, afterTurnSeq: 0, checkIn: { line: 'Take your time — feel free to think out loud.', playback: 'played', heardText: 'Take your time — feel free to think out loud.', startedAtMs: 180_000 } }, createdAt: at },
    { line: { turnSeq: 4, afterTurnSeq: 3, checkIn: { line: 'No hurry. Feel free to share your thinking as you go.', playback: 'partial', heardText: 'No hurry.', startedAtMs: 300_000 } }, createdAt: at },
    { line: { turnSeq: 5, afterTurnSeq: 4, checkIn: { line: 'Take your time.', playback: 'unplayed', heardText: '', startedAtMs: 400_000 } }, createdAt: at },
  ];
  const md = transcriptMd(s, turns, lines);
  expect(md).toContain('**t0 Interviewer** (0:00): How would you approach this?\n\n**Interviewer — check-in** (3:00): Take your time — feel free to think out loud.\n\n**t1 Candidate** (3:20)');
  expect(md).toContain('**t2 Interviewer** (3:23): Which costs?\n\n**Interviewer — check-in** (5:00): No hurry. *(cut off)*');
  expect(md.match(/check-in/g)).toHaveLength(2);
});
