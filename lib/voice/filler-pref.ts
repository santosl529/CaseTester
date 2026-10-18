// The filler toggle's per-browser memory (item 3, 17 Oct): on unless this
// browser turned it off. Storage can be missing or throw (private windows,
// blocked site data) — then the setting lives in memory for the page, and a
// new page starts on.
export const FILLER_PREF_KEY = 'casetester.voice.fillers';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function readFillerPref(store: Store | null | undefined): boolean {
  try { return store?.getItem(FILLER_PREF_KEY) !== 'off'; } catch { return true; }
}

// Returns whether it was remembered.
export function writeFillerPref(store: Store | null | undefined, on: boolean): boolean {
  try { store?.setItem(FILLER_PREF_KEY, on ? 'on' : 'off'); return Boolean(store); } catch { return false; }
}

// A store for useSyncExternalStore: storage when it works, memory otherwise.
export function fillerPrefStore(store: () => Store | null | undefined) {
  let memory: boolean | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => memory ?? readFillerPref(store()),
    set: (on: boolean) => {
      memory = writeFillerPref(store(), on) ? null : on;
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
