// What reaches Sentry (Matt, 17 Nov, pre-pilot audit M4): the error, the student's account id and the page — no
// personal data and no answer text. Every event and breadcrumb passes through here before it leaves the server or the
// browser: no request bodies (interview turns, drill answers), cookies, headers but the browser's name, query strings,
// console lines or typed input; email addresses in an error's text are blanked. Pure, so it's tested.
type Crumb = { category?: string; message?: string; data?: Record<string, unknown> } & Record<string, unknown>;
type Event = {
  user?: Record<string, unknown> | null;
  request?: { url?: string; data?: unknown; cookies?: unknown; query_string?: unknown; headers?: Record<string, string> } & Record<string, unknown>;
  breadcrumbs?: Crumb[];
  exception?: { values?: { value?: string }[] };
  message?: string;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
} & Record<string, unknown>;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const withoutQuery = (url: string) => url.split(/[?#]/)[0];
const blankEmails = (s: string) => s.replace(EMAIL, '[email]');

export function scrubBreadcrumb<B extends Crumb>(b: B): B | null {
  // Console lines and typed input can hold anything a student wrote.
  if (b.category === 'console' || b.category === 'ui.input') return null;
  const data: Record<string, unknown> = {};
  for (const k of ['url', 'method', 'status_code', 'from', 'to'] as const) {
    const v = b.data?.[k];
    if (v !== undefined) data[k] = typeof v === 'string' ? withoutQuery(v) : v;
  }
  return { ...b, message: b.message ? blankEmails(b.message) : b.message, data };
}

export function scrubEvent<E extends Event>(e: E): E {
  const id = typeof e.user?.id === 'string' ? e.user.id : undefined;
  const out: Event = { ...e, user: id ? { id } : undefined };
  delete out.extra;
  if (e.request) {
    const agent = e.request.headers?.['user-agent'] ?? e.request.headers?.['User-Agent'];
    out.request = { url: e.request.url ? withoutQuery(e.request.url) : undefined, method: e.request.method, ...(agent ? { headers: { 'user-agent': agent } } : {}) };
  }
  if (e.breadcrumbs) out.breadcrumbs = e.breadcrumbs.map(b => scrubBreadcrumb(b)).filter((b): b is Crumb => b !== null);
  if (e.exception?.values) out.exception = { ...e.exception, values: e.exception.values.map(v => ({ ...v, value: v.value ? blankEmails(v.value) : v.value })) };
  if (e.message) out.message = blankEmails(e.message);
  const page = typeof e.tags?.page === 'string' ? withoutQuery(e.tags.page) : out.request?.url ? new URL(out.request.url, 'http://x').pathname : undefined;
  if (page) out.tags = { ...e.tags, page };
  return out as E;
}
