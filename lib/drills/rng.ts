// Seeded PRNG for item generators (docs/prd-drills.md "Generators"): an
// attempt stores template + version + seed, and the same seed must rebuild the
// same item, so generators never call Math.random. mulberry32: small, fast, and
// good enough for picking numbers in a drill.

export interface Rng {
  next(): number;                        // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: items => {
      if (items.length === 0) throw new Error('pick from an empty list');
      return items[int(0, items.length - 1)];
    },
    shuffle: items => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
