'use client';
import { useEffect } from 'react';

// When even the root layout fails (8 Nov). Replaces the whole document, so it has its own <html> and plain styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 24, textAlign: 'center' }}>
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong on our side</h1>
          <p style={{ fontSize: 14, color: '#525252' }}>CasePace couldn’t load. It’s usually temporary: try again in a moment.</p>
          <button onClick={() => reset()} style={{ padding: '8px 16px', marginRight: 8 }}>Try again</button>
          <a href="/home">Go to home</a>
          {error.digest && <p style={{ fontSize: 12, color: '#a3a3a3' }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
