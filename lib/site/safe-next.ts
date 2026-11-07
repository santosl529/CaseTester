// Where to go after sign-in (homepage, 20 Oct): the homepage's "Take the free
// diagnostic" sends `/sign-in?next=/drills/diagnostic`. Only a path on this
// site is followed; anything else (another origin, `//host`, a backslash
// trick) falls back to /home.
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  try {
    const url = new URL(raw, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid') return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
