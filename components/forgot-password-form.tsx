'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { forgotErrorMessage } from '@/lib/site/auth-messages';

// Ask for a reset link (Lorenzo, 10 Nov; lib/site/password-reset.ts). No account for the email is said plainly
// (11 Nov). A second click before the disabled state renders is ignored.
export function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const res = await fetch('/api/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.ok) setSentTo(email.trim());
    else setError(forgotErrorMessage(res ? await res.json().catch(() => ({})) : null));
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
            <div role="status" className="t-body space-y-2 text-ink">
              <p>We&apos;ve emailed a link to reset your password to <span className="font-semibold">{sentTo}</span>. It works once and expires in an hour.</p>
              <p className="t-small text-ink/70">Nothing after a few minutes? Check your spam folder, or ask the CasePace team for a reset link.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {expired && <p role="status" className="t-small text-ink">That reset link has expired or was already used. Request a new one below.</p>}
              <p className="t-small text-ink/70">Enter your account&apos;s email and we&apos;ll send you a link to set a new password.</p>
              <Input placeholder="Email" aria-label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              {error && <p role="alert" className="t-small text-alert">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
            </form>
          )}
          <p className="t-small mt-4 text-center text-ink/70">
            <Link href="/sign-in" className="link">Back to log in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
