'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><Link href="/" className="hover:underline underline-offset-4">CasePace</Link></CardTitle>
        </CardHeader>
        <CardContent>
          {sentTo ? (
            <div role="status" className="space-y-2 text-sm text-neutral-700">
              <p>We&apos;ve emailed a link to reset your password to <span className="font-medium">{sentTo}</span>. It works once and expires in an hour.</p>
              <p>Nothing after a few minutes? Check your spam folder, or ask the CasePace team for a reset link.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {expired && <p role="status" className="text-sm text-amber-700">That reset link has expired or was already used. Request a new one below.</p>}
              <p className="text-sm text-neutral-600">Enter your account&apos;s email and we&apos;ll send you a link to set a new password.</p>
              <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-neutral-600">
            <Link href="/sign-in" className="underline">Back to log in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
