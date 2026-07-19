import { describe, it, expect } from 'vitest';
import { repairTranscript } from '@/lib/scoring/transcript-artifacts';

const t = (role: string, text: string, turnIndex: number) => ({ role, text, turnIndex });

describe('repairTranscript', () => {
  it('passes a clean transcript through untouched', () => {
    const turns = [
      t('interviewer', 'Your client is Brew & Bean. How would you approach this?', 0),
      t('candidate', 'I would break this into three buckets.', 1),
      t('interviewer', 'Which do you prioritize first?', 2),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toEqual(turns);
    expect(artifacts).toEqual([]);
  });

  it('removes empty turns — run 2 blank final turn', () => {
    const turns = [
      t('interviewer', 'Bring it home.', 0),
      t('candidate', 'My recommendation is to raise prices.', 1),
      t('interviewer', '   ', 2),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(2);
    expect(artifacts).toEqual([{ type: 'empty_turn', turnIndex: 2 }]);
  });

  it('removes a consecutive same-role duplicate — run 3 duplicated opening', () => {
    const opening = 'Your client is Brew & Bean, a specialty coffee chain with 200 locations.';
    const turns = [
      t('interviewer', opening, 0),
      t('interviewer', opening, 1),
      t('candidate', 'Interesting problem.', 2),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(2);
    expect(kept[0].turnIndex).toBe(0);
    expect(artifacts).toEqual([{ type: 'duplicate_turn', turnIndex: 1 }]);
  });

  it('duplicate matching is whitespace/case tolerant but exact on content', () => {
    const turns = [
      t('interviewer', 'Here is the data.', 0),
      t('interviewer', '  here is   the data.  ', 1),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(1);
    expect(artifacts[0].type).toBe('duplicate_turn');
  });

  it('keeps a candidate legitimately repeating themselves non-consecutively', () => {
    const turns = [
      t('candidate', 'I want the vintage split.', 0),
      t('interviewer', 'What would that tell you?', 1),
      t('candidate', 'I want the vintage split.', 2),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(3);
    expect(artifacts).toEqual([]);
  });

  it('keeps same text across different roles (interviewer echoing candidate)', () => {
    const turns = [
      t('candidate', 'Costs are the problem.', 0),
      t('interviewer', 'Costs are the problem.', 1),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(2);
    expect(artifacts).toEqual([]);
  });

  it('flags a truncated close (log-only, text untouched)', () => {
    const turns = [
      t('candidate', 'My recommendation stands.', 0),
      t('interviewer', "That's a strong recommendation. You moved from", 1),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(2);
    expect(kept[1].text).toBe("That's a strong recommendation. You moved from");
    expect(artifacts).toEqual([{ type: 'truncated_close', turnIndex: 1 }]);
  });

  it('does not flag a truncated close on a candidate-final transcript', () => {
    const turns = [
      t('interviewer', 'What is your recommendation?', 0),
      t('candidate', 'Raise prices and hedge bean', 1),
    ];
    const { artifacts } = repairTranscript(turns);
    expect(artifacts).toEqual([]);
  });

  it('an empty turn between duplicates still collapses them', () => {
    // Removal order matters: the empty turn is dropped first, making the
    // duplicates consecutive among KEPT turns.
    const opening = 'Your client is Brew & Bean.';
    const turns = [
      t('interviewer', opening, 0),
      t('interviewer', '', 1),
      t('interviewer', opening, 2),
    ];
    const { turns: kept, artifacts } = repairTranscript(turns);
    expect(kept).toHaveLength(1);
    expect(artifacts.map(a => a.type).sort()).toEqual(['duplicate_turn', 'empty_turn']);
  });
});
