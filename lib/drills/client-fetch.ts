// The drills screens' calls (8 Nov: "make everything fail clearly"). A drop-in for fetch that never throws: the
// screens read `res.ok` and show `data.message`, so every failure gets a message there — offline, signed out, the
// club code no longer valid, or a server error — and their buttons come back.
import { OFFLINE } from '@/lib/site/failure-messages';

type Body = Record<string, unknown>;
// json() is typed like fetch's (any), so it drops in for the screens' existing `data.set_id`, `data.message` reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrillResponse = { ok: boolean; status: number; json: () => Promise<any> };

const GENERIC = 'Something went wrong on our side. Please try again in a moment.';

export async function drillFetch(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<DrillResponse> {
  const answer = (ok: boolean, status: number, data: Body): DrillResponse => ({ ok, status, json: async () => data });
  let res: Response;
  try { res = await fetchImpl(url, init); } catch { return answer(false, 0, { error: 'network', message: OFFLINE }); }
  const raw = await res.json().catch(() => null) as Body | null;
  const data: Body = raw && typeof raw === 'object' ? raw : { error: 'server_error' };
  if (res.ok) return answer(true, res.status, data);
  if (res.status === 401) return answer(false, 401, { ...data, message: 'You’ve been signed out. Log in again to keep going; your progress is saved.' });
  if (data.error === 'club_code_required') return answer(false, res.status, { ...data, message: 'Your club code is no longer valid. Enter a new one on your Account page.' });
  if (res.status >= 500 || typeof data.message !== 'string') return answer(false, res.status, { ...data, message: GENERIC });
  return answer(false, res.status, data);
}
