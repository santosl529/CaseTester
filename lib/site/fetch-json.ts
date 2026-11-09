// The browser's calls to our API, never throwing (8 Nov: "make everything fail clearly"): a network failure is
// status 0 and a body that isn't JSON (an HTML error page) is data null, so every screen can always show a message
// and re-enable its buttons.
export type JsonAnswer = { ok: boolean; status: number; data: Record<string, unknown> | null };

export async function requestJson(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<JsonAnswer> {
  let res: Response;
  try { res = await fetchImpl(url, init); } catch { return { ok: false, status: 0, data: null }; }
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  return { ok: res.ok, status: res.status, data: data && typeof data === 'object' ? data : null };
}

export const postJson = (url: string, body?: unknown, fetchImpl?: typeof fetch) =>
  requestJson(url, { method: 'POST', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }, fetchImpl);
