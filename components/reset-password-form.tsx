'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { resetErrorMessage } from '@/lib/site/auth-messages';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';

// Set a new password after opening a reset link (Lorenzo, 10 Nov). The link already signed the student in, so on
// success they go on to /sign-in, which sends them home (or to the club step). Double clicks ignored.
export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const res = await fetch('/api/password/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      setDone(true);
      window.location.assign('/sign-in');
      return;
    }
    setError(resetErrorMessage(res ? await res.json().catch(() => ({})) : null));
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
          {done ? (
            <p role="status" className="t-body text-ink">Password changed. Taking you to your home page…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="t-small text-ink/70">Choose a new password.</p>
              <Input placeholder={`New password (at least ${PASSWORD_MIN} characters)`} aria-label="New password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={password} onChange={e => setPassword(e.target.value)} required />
              <Input placeholder="Type it again" aria-label="New password, again" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={confirm} onChange={e => setConfirm(e.target.value)} required />
              {error && <p role="alert" className="t-small text-alert">{error}</p>}
              {error === resetErrorMessage({ error: 'Unauthorized' }) && <p className="t-small"><Link href="/forgot-password" className="link">Request a new link</Link></p>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
