import { describe, it, expect } from 'vitest';
import { usefulMs, rowsFromLog } from '@/scripts/useful-latency';

const LOG = [
  '[runner] phase: INTRO kind: model stall rung: none',
  '[interviewer-model] raw response: {"say":"Understood.","move":"analysis","requests":[{"what":"a","item_ids":["x"],"explicit":true,"respond":"release"},{"what":"b","item_ids":["y"],"explicit":true,"respond":"release"}],"exhibit":null,"rescue_item":null,"question":"Which first?"}',
  '[timing] model_first_token=1300 first_delivered=1350 model_say_closed=1350 model_rescue_item_closed=1800 data_line_delivered=1810 model_done=2400 tail_delivered=2410',
  '[runner] phase: WRAP kind: close stall rung: none',
  '[timing] first_delivered=40 tail_delivered=40',
  '[runner] phase: ANALYSIS kind: model stall rung: none',
  '[interviewer-model] raw response: {"say":"Mm-hm.","requests":[],"question":"Why?"}',
  '[timing] model_first_token=1200 first_delivered=1250 model_done=2100 tail_delivered=2105',
].join('\n');

describe('useful-latency', () => {
  it('takes the earlier of the data line and the tail, never the say sentence', () => {
    expect(usefulMs({ first_delivered: 1350, data_line_delivered: 1810, tail_delivered: 2410 })).toBe(1810);
    expect(usefulMs({ first_delivered: 1250, tail_delivered: 2105 })).toBe(2105);
  });
  it('prefers the first_useful_delivered mark when the run has it', () => {
    expect(usefulMs({ first_useful_delivered: 900, tail_delivered: 2105 })).toBe(900);
  });
  it('reads one row per model turn, with the declared request count, and skips code-written turns', () => {
    const rows = rowsFromLog(LOG);
    expect(rows.map(r => [r.declarations, r.useful])).toEqual([[2, 1810], [0, 2105]]);
  });
});
