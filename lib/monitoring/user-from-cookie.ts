// The student's account id for a server-side error report (M4): read from the Supabase session cookie the request
// carries, without a network call. Decoded, not verified — it only labels the report; nothing is granted by it. Only
// the id (the token's `sub`) is taken; nothing else in the session is kept.
// base64url → text, in Node and the edge runtime alike (no Buffer on the edge).
function decode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export function userIdFromCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const cookies = new Map(cookieHeader.split(/;\s*/).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))] as const; }));
  // @supabase/ssr: sb-<project>-auth-token, split into .0, .1, … when long; "base64-" + base64url JSON.
  const name = [...cookies.keys()].find(k => /^sb-.+-auth-token(\.0)?$/.test(k))?.replace(/\.0$/, '');
  if (!name) return null;
  let raw = cookies.get(name) ?? '';
  for (let i = 0; cookies.has(`${name}.${i}`); i++) raw += cookies.get(`${name}.${i}`);
  try {
    const json = raw.startsWith('base64-') ? decode(raw.slice(7)) : raw;
    const token = (JSON.parse(json) as { access_token?: string }).access_token;
    if (!token) return null;
    const sub = (JSON.parse(decode(token.split('.')[1])) as { sub?: unknown }).sub;
    return typeof sub === 'string' && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}
