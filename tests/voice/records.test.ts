import { it, expect } from 'vitest';
import { classifierWaits, summarize } from '@/lib/voice/records';

it('counts only waits that blocked delivery', () => {
  expect(classifierWaits({ model_first_sentence: 900, distress_verdict: 1100, held_for_distress: 900, pt_judge_start: 1200, pt_judge_end: 1500, hint_check_start: 2000, hint_check_end: 2300 }))
    .toEqual({ distress: 200, ptJudge: 300, structureJudge: 0, hintCheck: 300, codeWrittenChecks: 0 });
  expect(classifierWaits({ model_first_sentence: 900, distress_verdict: 700 }).distress).toBe(0); // never held
});

it('summarizes medians and p90s over turns that were not cancelled', () => {
  const rs = [1, 2, 3, 4, 10].map(v => ({ firstSoundMs: v * 100, firstUsefulMs: v * 200, endpointMs: v, cancelled: false }));
  const s = summarize([...rs, { firstSoundMs: 1, firstUsefulMs: 1, endpointMs: 1, cancelled: true }]);
  expect(s).toMatchObject({ turns: 5, cancelled: 1, firstSoundMs_median: 300, firstUsefulMs_p90: 2000 });
});
