'use client';
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { downloadFailure } from '@/lib/site/failure-messages';

// The report PDF (8 Nov audit): a plain download link left the browser to show a failed download (or save the JSON
// error) on a 429 or 500. Fetch it, save it when it's a PDF, say why when it isn't.
export function PdfDownloadButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function download() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/report/${sessionId}/pdf`).catch(() => null);
      if (!res || !res.ok) {
        setError(downloadFailure(res?.status ?? 0, res ? await res.json().catch(() => null) : null));
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'casepace-report.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(downloadFailure(500, null));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={download} disabled={busy} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        <Download aria-hidden="true" />{busy ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {error && <span role="alert" className="t-label text-alert">{error}</span>}
    </span>
  );
}
