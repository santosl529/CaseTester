'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { signOut } from '@/app/actions/auth';
import { signInErrorMessage, retryWait } from '@/lib/site/auth-messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Log in (site flow, 19 Oct; log-in only since 8 Nov). New accounts are made at /sign-up with a club code, so a
// wrong password says so instead of quietly trying a sign-up. /sign-in decides where to start: a signed-in student
// with a valid code on their profile never sees this; one without a code (an account from before 8 Nov, or a code
// since removed) starts at the club step. `next` is already checked (lib/site/safe-next.ts).
export function SignInFlow({ initialStep, next, created = false, deleted = false }: { initialStep: 'auth' | 'club'; next: string; created?: boolean; deleted?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const step = initialStep;
  const router = useRouter();

  async function guarded(run: () => Promise<boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    // `true` = navigating away: keep the button disabled until the page changes.
    const leaving = await run().catch(() => { setError("Something went wrong. Please try again."); return false; });
    if (!leaving) { setBusy(false); inFlight.current = false; }
  }

  function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    void guarded(async () => {
      let result: Awaited<ReturnType<ReturnType<typeof createBrowserSupabaseClient>['auth']['signInWithPassword']>>;
      try {
        result = await createBrowserSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
      } catch {
        setError(signInErrorMessage(null));
        return false;
      }
      if (result.error) { setError(signInErrorMessage(result.error)); return false; }
      // /sign-in decides: on to `next` when the profile already has a valid code, else the club step.
      window.location.assign(`/sign-in?next=${encodeURIComponent(next)}`);
      return true;
    });
  }

  function handleClubCode(e: React.FormEvent) {
    e.preventDefault();
    if (!clubCode.trim()) { setError('Please enter your club code.'); return; }
    void guarded(async () => {
      const res = await fetch('/api/club', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubCode }),
      }).catch(() => null);
      if (res?.ok) { router.push(next); return true; }
      const data = res ? await res.json().catch(() => ({})) : null;
      setError(
        !res ? "We couldn't reach the server. Check your connection and try again."
          : data?.error === 'Invalid club code' ? "That club code isn't valid. Check it with your club president."
          : data?.error === 'rate_limited' ? `Too many attempts. Try again in ${retryWait(data.retryAfterSec)}.`
          : 'Could not check your club code. Please try again.',
      );
      return false;
    });
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><Link href="/" className="hover:underline underline-offset-4">CasePace</Link></CardTitle>
        </CardHeader>
        <CardContent>
          {step === 'auth' && (
            <>
              <form onSubmit={handleAuth} className="space-y-3">
                {created && <p role="status" className="text-sm text-green-700">Account created. Log in to continue.</p>}
                {deleted && <p role="status" className="text-sm text-neutral-700">Your account and its data have been deleted.</p>}
                <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
                {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</Button>
              </form>
              <p className="mt-4 text-center text-sm text-neutral-600">
                New here? <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="underline">Create an account with your club code</Link>
              </p>
            </>
          )}
          {step === 'club' && (
            <div className="space-y-3">
              <form onSubmit={handleClubCode} className="space-y-3">
                <p className="text-sm text-neutral-600">Enter your consulting club access code. You only need to do this once.</p>
                <Input placeholder="Club code" autoCapitalize="characters" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
                {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</Button>
              </form>
              <form action={signOut} className="text-center">
                <button type="submit" className="text-xs text-neutral-500 underline">Use a different account</button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
