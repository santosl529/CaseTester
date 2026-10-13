// The unit check verifies the conversion numerically (round-3 fixes). Batch
// 18's keyword detector fired in 38 of 62 interviews and "Points of what?" hit
// correct work in 9; these are those candidates' turns, saved verbatim
// (tests/orchestrator/fixtures/batch18-unit-check.json).
import { describe, it, expect } from 'vitest';
import { checkNestedConversions, formatUnitFlagLine } from '@/lib/orchestrator/unit-check';
import { getCaseById } from '@/lib/cases/loader';
import saved from './fixtures/batch18-unit-check.json';

const prof = getCaseById('prof-001');
const run = (text: string, revealed: string[] = ['cogs_pct']) =>
  checkNestedConversions(text, { bases: prof.shareBases, items: prof.dataLedger, revealedIds: revealed });
const turns = saved as Record<string, { text: string; revealed: string[] }>;

describe('correct work is not flagged (batch 18: the doubted conversions)', () => {
  it.each([
    '07-raj-the-slow-burner-t11', '11-brandon-the-fuzzy-talker-t11', '53-fiona-the-hypothesis-reverser-t7',
    '54-owen-the-quiet-dropper-t7', '20-connor-the-exhibit-skimmer-t9', '59-nadia-the-backtracker-t5',
    '17-priya-the-gamer-t5', '18-nikhil-the-data-hoover-t11', '04-hannah-the-apologizer-t7',
  ])('%s', id => {
    expect(run(turns[id].text, turns[id].revealed).flags).toEqual([]);
  });

  it.each([
    // the candidate correcting their own slip (batch 19 Sofia d8ee5c25 t11, Derek 3baae0b8 t11, 140fb90d t11 replays)
    'Beans at 25% of COGS rising 40% raises total COGS by 10% — that\'s 10% of COGS, not 10 points of revenue.',
    '25% of COGS isn\'t 25 points of revenue.',
    '37.5% on 75% of COGS raises total COGS by 28% of COGS, not 28 points of revenue.',
    // quoted, not claimed (batch 20 d8ee5c25 t11)
    'What I did the second time was take 40% of 25% and call the answer "10 percentage points of revenue" — but 25% is a share of COGS, not of revenue.',
  ])('a conversion the candidate denies is no unit error: %s', text => {
    expect(run(text).flags).toEqual([]);
  });

  it('a result in points of COGS is a different quantity, not a unit error', () => {
    expect(run('Beans are 25% of COGS, up 40%, so that contributes 0.25 × 40 = 10 points of COGS growth.').flags).toEqual([]);
  });

  it('verifies a correct conversion at either base (two years ago or today)', () => {
    expect(run('Beans were 25% of COGS, and with COGS at 42% that is 10.5 points of revenue.').verified).toEqual([
      expect.objectContaining({ stated: 10.5, expected: 10.5 }),
    ]);
    expect(run('Beans were 25% of COGS and up 40%, so they add about 4.2 points of revenue.').verified[0]).toMatchObject({ stated: 4.2 });
  });
});

describe('a wrong conversion is flagged with the claim, units, base and timeframe', () => {
  it('batch 18, Sofia t11: 25% × 40% = 10 "percentage points of revenue"', () => {
    const { flags } = run(turns['10-sofia-the-unit-confuser-t11'].text, turns['10-sofia-the-unit-confuser-t11'].revealed);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      kind: 'unit', stated: 10, units: 'points of revenue', unconverted: 10, expected: 4.2,
      quantity: 'the 25% share of COGS, up 40%', base: 'COGS at 42% of revenue (two years ago)', timeframe: 'prior',
    });
  });

  it('batch 2, Derek: his own assumed share, restated as points of margin', () => {
    const { flags } = run("So if beans are 25% of COGS, that's 25 points of margin exposure right there, which more than covers the 16 points we've lost.");
    expect(flags[0]).toMatchObject({ stated: 25, units: 'points of margin', expected: 10.5 });
  });

  it('uses the base the candidate cited', () => {
    const { flags } = run('Waste runs about 4% of COGS, and COGS is 58% of revenue — so call it 4 points of revenue.');
    expect(flags[0]).toMatchObject({ expected: 2.3, timeframe: 'current', base: 'COGS at 58% of revenue (today)' });
  });

  it('no flag before the candidate has the base (they cannot convert yet)', () => {
    expect(run("If beans are 25% of COGS, that's 25 points of revenue.", []).flags).toEqual([]);
  });

  it('the interviewer line names the claim and asks for the units, without the method', () => {
    const line = formatUnitFlagLine(run("If beans are 25% of COGS, that's 25 points of revenue.").flags[0]);
    expect(line).toMatch(/the candidate said 25 points of revenue/);
    expect(line).toMatch(/Points of what\?/);
    expect(line).toMatch(/don't name the method or the figure/);
  });
});
