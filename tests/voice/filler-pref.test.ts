// The filler toggle remembered per browser (item 3, 17 Oct).
import { describe, it, expect } from 'vitest';
import { FILLER_PREF_KEY, readFillerPref, writeFillerPref, fillerPrefStore } from '@/lib/voice/filler-pref';

const memoryStorage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };

describe('the filler preference', () => {
  it('on by default; off only once turned off', () => {
    const s = memoryStorage();
    expect(readFillerPref(s)).toBe(true);
    writeFillerPref(s, false);
    expect(s.getItem(FILLER_PREF_KEY)).toBe('off');
    expect(readFillerPref(s)).toBe(false);
    writeFillerPref(s, true);
    expect(readFillerPref(s)).toBe(true);
  });
  it('no storage or storage that throws: on, never an error', () => {
    expect(readFillerPref(null)).toBe(true);
    expect(readFillerPref(throwing)).toBe(true);
    expect(writeFillerPref(throwing, false)).toBe(false);
  });
  it('the store: remembered in storage, notifies, and falls back to memory when storage fails', () => {
    const s = memoryStorage();
    const a = fillerPrefStore(() => s);
    let calls = 0;
    a.subscribe(() => { calls++; });
    a.set(false);
    expect(a.get()).toBe(false);
    expect(fillerPrefStore(() => s).get()).toBe(false);   // a new page in the same browser
    expect(calls).toBe(1);
    const b = fillerPrefStore(() => throwing);
    b.set(false);
    expect(b.get()).toBe(false);                          // this page still uses it
    expect(fillerPrefStore(() => throwing).get()).toBe(true);
  });
});
