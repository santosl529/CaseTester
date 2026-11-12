// The sign-up confirmation email's redirect (site launch, Lorenzo 1 Nov): the
// site's /sign-in, so a student who confirms lands on the sign-in form, not
// the homepage. The origin comes from NEXT_PUBLIC_SITE_URL (its path, if any,
// is dropped); unset or invalid, the page's own origin. The URL must be in
// Supabase's Redirect URLs, or Supabase falls back to its Site URL.
export function signInRedirectUrl(configured: string | undefined, pageOrigin: string | undefined): string | undefined {
  const origin = siteOrigin(configured, pageOrigin);
  return origin && `${origin}/sign-in`;
}

// The site's origin: NEXT_PUBLIC_SITE_URL's when valid, else the page's or request's own.
export function siteOrigin(configured: string | undefined, pageOrigin: string | undefined): string | undefined {
  return originOf(configured) ?? originOf(pageOrigin);
}

export function originOf(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
