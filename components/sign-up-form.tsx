'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { signUpErrorMessage } from '@/lib/site/auth-messages';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/site/sign-up-rules';

// Create an account with a club code (Lorenzo, 8 Nov). The server checks the code and creates the account
// (POST /api/sign-up); then the student logs in at /sign-in, which never asks for the code again. A second click
// before the disabled state renders is ignored.
export function SignUpForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
      window.location.assign(`/sign-in?created=1&next=${encodeURIComponent(next)}`);
      return;
    }
    setError(signUpErrorMessage(res ? await res.json().catch(() => ({})) : null));
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
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-sm text-neutral-600">Create your account with your consulting club&apos;s access code.</p>
            <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input placeholder={`Password (at least ${PASSWORD_MIN} characters)`} type="password" autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} value={password} onChange={e => setPassword(e.target.value)} required />
            <Input placeholder="Club code" autoCapitalize="characters" autoComplete="off" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
            {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</Button>
          </form>
          <p className="mt-4 text-center text-sm text-neutral-600">
            Already have an account? <Link href={signInHref} className="underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
