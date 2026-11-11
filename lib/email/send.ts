// The site's own email sender (Lorenzo, 11 Nov: confirm-first sign-up). Resend's HTTP API over fetch — no SDK. The
// key (RESEND_API_KEY) is server-only; EMAIL_FROM must be an address on a domain verified in Resend (casepace.io).
// Without a key the site sends nothing itself: sign-up then confirms accounts at once (lib/site/sign-up.ts).
import 'server-only';

export type EmailConfig = { apiKey: string; from: string };
export type EmailMessage = { to: string; subject: string; text: string; html: string };
const DEFAULT_FROM = 'CasePace <noreply@casepace.io>';

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, from: env.EMAIL_FROM?.trim() || DEFAULT_FROM };
}

export async function sendEmail(cfg: EmailConfig, msg: EmailMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200).replaceAll(cfg.apiKey, '[key]');
    throw new Error(`Resend refused the email: ${res.status} ${detail}`);
  }
}
