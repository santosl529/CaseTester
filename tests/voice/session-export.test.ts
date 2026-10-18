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
