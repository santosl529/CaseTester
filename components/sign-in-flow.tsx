'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { signOut } from '@/app/actions/auth';
import { signInRedirectUrl } from '@/lib/site/url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Sign in, then the club code once (site flow, 19 Oct). /sign-in decides
// where to start: a signed-in student with a valid code on their profile
// never sees this; one without a code starts at the club step. `next` is
// already checked (lib/site/safe-next.ts).
export function SignInFlow({ initialStep, next }: { initialStep: 'auth' | 'club'; next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clubCode, setClubCode] = useState('');
  const [error, setError] = useState('');
  const step = initialStep;
  const router = useRouter();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Try sign up
      // The confirmation email links back to /sign-in (lib/site/url.ts).
      const emailRedirectTo = signInRedirectUrl(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin);
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
      if (signUpError) { setError(signUpError.message); return; }
      if (!data.session) { setError('Check your email to confirm your account, then sign in.'); return; }
    }
    // /sign-in decides: on to `next` when the profile already has a valid code.
    window.location.assign(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  async function handleClubCode(e: React.FormEvent) {
    e.preventDefault();
    if (!clubCode.trim()) {
      setError('Please enter your club code.');
      return;
    }
    setError('');
    const res = await fetch('/api/club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clubCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'Invalid club code' ? 'Invalid club code. Contact your club president.' : 'Could not check your club code. Please try again.');
      return;
    }
    router.push(next);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* The page's heading: the brand, a link home (as on the homepage). */}
          <h1 className="t-title"><Link href="/" className="transition-colors hover:text-cobalt motion-reduce:transition-none">CasePace</Link></h1>
        </CardHeader>
        <CardContent>
          {step === 'auth' && (
            <form onSubmit={handleAuth} className="space-y-3">
              <Input placeholder="Email" aria-label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input placeholder="Password" aria-label="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              {error && <p className="text-alert t-small">{error}</p>}
              <Button type="submit" size="lg" className="w-full">Continue</Button>
            </form>
          )}
          {step === 'club' && (
            <div className="space-y-3">
              <form onSubmit={handleClubCode} className="space-y-3">
                <p className="t-small text-ink/70">Enter your consulting club access code. You only need to do this once.</p>
                <Input placeholder="Club code" aria-label="Club code" autoCapitalize="characters" value={clubCode} onChange={e => setClubCode(e.target.value)} required />
                {error && <p className="text-alert t-small">{error}</p>}
                <Button type="submit" size="lg" className="w-full">Verify</Button>
              </form>
              <form action={signOut} className="text-center">
                <button type="submit" className="link-quiet t-small cursor-pointer">Use a different account</button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
