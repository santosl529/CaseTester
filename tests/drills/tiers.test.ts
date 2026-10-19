// Browse drills: which tiers a student may pick (docs/prd-drills.md "Browse drills").
import { describe, it, expect } from 'vitest';
import { allowedTiers } from '@/lib/drills/program/tiers';

describe('allowed tiers', () => {
  it('first time on a drill: tier 1 or 2', () => {
    expect(allowedTiers(undefined)).toEqual([1, 2]);
  });
  it('up to one above the current tier, never past tier 3', () => {
    expect(allowedTiers(1)).toEqual([1, 2]);
    expect(allowedTiers(2)).toEqual([1, 2, 3]);
    expect(allowedTiers(3)).toEqual([1, 2, 3]);
  });
});
