'use client';
import { useEffect, useState } from 'react';

// The preview pages' network guard (Matt, 7 Nov 2026: sample data only, never
// a database write, no real interview or voice session). Installed when this
// module loads in the browser, before any screen mounts:
// - a request a preview registered (PreviewApi) gets its sample answer here,
//   and never reaches the server;
// - the preview's own pages and Next's assets load as usual;
// - everything else is refused: other API calls, server actions, Supabase
//   and every other site, beacons, and navigation to the real app's pages.

export interface Canned {
  method: string;
  // Matched against the path (no query string).
  path: string;
  status?: number;
  // One body, or one per call in turn (the last repeats).
  body?: unknown;
  sequence?: unknown[];
  // An answer that depends on the request: the values at these JSON paths of
  // its body, joined with ":" ("none" for a missing one), pick from `map`.
  byBody?: { paths: string[]; map: Record<string, unknown> };
  delayMs?: number;
}

const routes: Canned[] = [];
const calls = new Map<Canned, number>();
const listeners = new Set<(note: string) => void>();
const say = (note: string) => { console.info(`[ui-preview] ${note}`); listeners.forEach(l => l(note)); };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
const isPreview = (path: string) => path === '/dev/ui-preview' || path.startsWith('/dev/ui-preview/');

function install() {
  const w = window as typeof window & { __uiPreview?: boolean };
  if (w.__uiPreview) return;
  w.__uiPreview = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    if (url.origin === location.origin) {
      const hit = routes.find(r => r.method === method && new RegExp(`^${r.path}$`).test(url.pathname));
      if (hit) {
        const n = calls.get(hit) ?? 0;
        calls.set(hit, n + 1);
        if (hit.delayMs) await new Promise(r => setTimeout(r, hit.delayMs));
        let body = hit.sequence ? hit.sequence[Math.min(n, hit.sequence.length - 1)] : hit.body;
        if (hit.byBody) {
          const sent = JSON.parse((await req.text()) || '{}') as Record<string, unknown>;
          const at = (path: string) => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), sent);
          const key = hit.byBody.paths.map(path => String(at(path) ?? 'none')).join(':');
          body = key in hit.byBody.map ? hit.byBody.map[key] : body;
        }
        return json(body, hit.status);
      }
      const rsc = req.headers.has('RSC') || url.searchParams.has('_rsc');
      const action = req.headers.has('Next-Action');
      if (method === 'GET' && !action && (isPreview(url.pathname) || (!rsc && !url.pathname.startsWith('/api/')))) return real(input, init);
      if (method === 'GET' && rsc) {
        say(`Stayed on the preview: ${url.pathname}`);
        return new Promise<Response>(() => {});
      }
    }
    say(`Blocked: ${method} ${url.origin === location.origin ? url.pathname : url.href}`);
    return json({ error: 'preview', message: 'Preview: nothing is sent.' }, 403);
  };
  navigator.sendBeacon = () => true;
  // Links stay on the preview: a click on one to the real app goes nowhere.
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && isPreview(url.pathname)) return;
    if (url.origin === location.origin && url.pathname === location.pathname && url.hash) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    say(`Stayed on the preview: ${url.pathname}`);
  }, true);
}

if (typeof window !== 'undefined') install();

// Registers a screen's sample answers while it renders, before its
// components can call anything.
export function PreviewApi({ routes: mine }: { routes: Canned[] }) {
  for (const r of mine) if (!routes.some(x => x.method === r.method && x.path === r.path)) routes.push(r);
  return null;
}

// A small note in the corner when the guard holds something back.
export function PreviewNotes() {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const on = (n: string) => { setNote(n); window.clearTimeout(t); t = window.setTimeout(() => setNote(null), 2500); };
    listeners.add(on);
    return () => { listeners.delete(on); window.clearTimeout(t); };
  }, []);
  if (!note) return null;
  return (
    <p role="status" data-preview-note className="fixed bottom-3 left-3 z-50 rounded-md bg-black/80 px-3 py-1.5 text-xs text-white">{note}</p>
  );
}
