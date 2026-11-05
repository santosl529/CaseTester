// The browser tells the server the candidate has left the voice page (voice lifecycle, 5 Nov) — the tab closing,
// navigating away, or giving up on an interviewer that never arrived — so the room is freed and a pending dispatch
// cancelled (app/api/voice/[sessionId]/leave). A beacon survives the page unloading; fetch with keepalive is the
// fallback. Never throws.
export type LeaveTransport = {
  sendBeacon?: (url: string, body?: BodyInit | null) => boolean;
  fetch?: (url: string, init: RequestInit) => Promise<unknown>;
};

export function sendLeave(sessionId: string, t: LeaveTransport): boolean {
  const url = `/api/voice/${sessionId}/leave`;
  try { if (t.sendBeacon?.(url, new Blob([], { type: 'text/plain' }))) return true; } catch { /* fall through */ }
  try { void t.fetch?.(url, { method: 'POST', keepalive: true })?.catch?.(() => {}); return Boolean(t.fetch); } catch { return false; }
}

// Whether leaving the page now should free the room: a session in progress, not one already over.
export function shouldSendLeave(local: 'idle' | 'connecting' | 'live' | 'ended', caseOver: boolean): boolean {
  return (local === 'connecting' || local === 'live') && !caseOver;
}

// Reload-and-resume (Lorenzo, 5 Nov: "a reload mid-session must resume the same interview"). While a voice session
// is live, this tab remembers it (sessionStorage survives a reload, not a new tab); a reloaded page that finds the
// mark reconnects on its own within the leave grace, to the same room, the same agent and the same interview. The
// mark is cleared when the case is over (End, the case ending) — those stay final.
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const resumeKey = (sessionId: string) => `voice-live:${sessionId}`;

export function markLive(store: Store | null, sessionId: string): void {
  try { store?.setItem(resumeKey(sessionId), String(Date.now())); } catch { /* storage blocked: no auto-resume */ }
}
export function clearLive(store: Store | null, sessionId: string): void {
  try { store?.removeItem(resumeKey(sessionId)); } catch { /* ignore */ }
}
// Resume only a mark this recent: older than the grace, the room has been freed and a fresh Start is the honest path.
export const RESUME_WINDOW_MS = 60_000;
export function shouldAutoResume(store: Store | null, sessionId: string, now: number): boolean {
  try {
    const at = Number(store?.getItem(resumeKey(sessionId)));
    return Number.isFinite(at) && at > 0 && now - at < RESUME_WINDOW_MS;
  } catch { return false; }
}
