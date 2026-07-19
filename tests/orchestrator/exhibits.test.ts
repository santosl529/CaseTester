import { describe, it, expect } from 'vitest';
import { resolveExhibit, promisesExhibit } from '@/lib/orchestrator/exhibits';

const EXHIBITS = [
  { id: 'exhibit-a', title: 'Brew & Bean Cost Structure Over Time' },
  { id: 'exhibit-b', title: 'Revenue by Segment' },
];

describe('resolveExhibit', () => {
  it('resolves an exact id', () => {
    expect(resolveExhibit(EXHIBITS, 'exhibit-a')?.id).toBe('exhibit-a');
  });

  it('resolves a fuzzy id ("Exhibit A" with a space)', () => {
    expect(resolveExhibit(EXHIBITS, 'Exhibit A')?.id).toBe('exhibit-a');
  });

  it('resolves by a fragment of the title ("cost structure over time")', () => {
    expect(resolveExhibit(EXHIBITS, 'cost structure over time')?.id).toBe('exhibit-a');
  });

  it('resolves when the id is embedded in a whole spoken sentence', () => {
    expect(resolveExhibit(EXHIBITS, "Here's exhibit A — take a look.")?.id).toBe('exhibit-a');
  });

  it('does not over-match a bare single letter', () => {
    // "a" alone must not match every exhibit
    expect(resolveExhibit(EXHIBITS, 'a')).toBeUndefined();
  });

  it('returns undefined for null/empty/unknown', () => {
    expect(resolveExhibit(EXHIBITS, null)).toBeUndefined();
    expect(resolveExhibit(EXHIBITS, '')).toBeUndefined();
    expect(resolveExhibit(EXHIBITS, 'nonexistent chart')).toBeUndefined();
  });
});

describe('promisesExhibit', () => {
  it('detects an exhibit promise', () => {
    expect(promisesExhibit("Here's exhibit A.")).toBe(true);
    expect(promisesExhibit('Let me put up exhibit A again.')).toBe(true);
  });

  it('does not fire on ordinary speech mentioning an exhibit descriptively', () => {
    expect(promisesExhibit('What did you take from the exhibit?')).toBe(false);
  });

  it('does not fire without an exhibit reference', () => {
    expect(promisesExhibit("Here's the revenue figure: $480M.")).toBe(false);
  });

  it('does not fire when the delivery verb and "exhibit" are in different sentences', () => {
    // Live bug: a closing debrief said "Here's your feedback..." in one
    // sentence and "...you read the exhibit cleanly" in another; a whole-turn
    // co-occurrence check treated that as an undelivered exhibit promise.
    expect(promisesExhibit("Here's your feedback. You read the exhibit cleanly.")).toBe(false);
  });
});
