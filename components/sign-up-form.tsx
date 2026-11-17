'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CONFIRM_EMAIL_MESSAGE, signUpErrorMessage } from '@/lib/site/auth-messages';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';
import { ResendVerification } from '@/components/resend-verification';

// Create an account with a club code (Lorenzo, 8 Nov). The server checks the code and creates the account
// (POST /api/sign-up). Confirm first (11 Nov): when a confirmation email went out, "check your email" with a resend
// button; the link confirms and logs them in. Without an email sender, the server logs them in and they go straight on
// to `next` (Matt, 17 Nov, pre-pilot audit S5); /sign-in only if that failed. /sign-in never asks for the code again.
// A second click before the disabled state renders is ignored.
export function SignUpForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const inFlight = useRef(false);
  const signInHref = `/sign-in?next=${encodeURIComponent(next)}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const res = await fetch('/api/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, clubCode }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.verify) { setSentTo(email.trim()); setBusy(false); inFlight.current = false; return; }
      window.location.assign(data?.signedIn ? next : `/sign-in?created=1&next=${encodeURIComponent(next)}`);
      return;
    }
    setError(signUpErrorMessage(res ? await res.json().catch(() => ({})) : null));
    setBusy(false);
    inFlight.current = false;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* The page's heading: the brand, a link home (as on /sign-in). */}
          <h1 className="t-title"><Link href="/" className="transition-colors hover:text-cobalt motion-reduce:transition-none">CasePace</Link></h1>
        </CardHeader>
        <CardContent>
          {sentTo ? (
            <div className="space-y-3">
              <h2 className="t-heading font-semibold">Check your email</h2>
              <p role="status" className="t-body text-ink">{CONFIRM_EMAIL_MESSAGE}</p>
              <p className="t-small text-ink">We sent the link to <span className="font-semibold">{sentTo}</span>. It works once and expires in an hour.</p>
              <p className="t-small text-ink/70">Not there after a few minutes? Check your spam folder, or send it again.</p>
              <ResendVerification email={sentTo} />
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="t-small text-ink/70">Create your account with your consulting club&apos;s access code.</p>
            <Input placeholder="Email" aria-label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input placeholder={`Password (at least ${PASSWORD_MIN} characters)`} aria-label="Password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={password} onChange={e => setPassword(e.target.value)} required />
            <Input placeholder="Club code" aria-label="Club code" autoCapitalize="characters" autoComplete="off" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
            {error && <p role="alert" className="t-small text-alert">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</Button>
          </form>
          )}
          <p className="t-small mt-4 text-center text-ink/70">
            Already have an account? <Link href={signInHref} className="link">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
