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
