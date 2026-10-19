import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refreshes the Supabase session on page loads (site flow, 19 Oct). Server
// components can't write cookies (lib/supabase/server.ts), so without this a
// refreshed token is never saved and a returning student is signed out once
// their access token expires. Pages only: the API routes (case turns, voice)
// keep their latency.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  // Refreshes an expired access token and writes the new cookies.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ['/', '/home', '/case/:path*', '/drills/:path*'],
};
