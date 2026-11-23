// The wrong-code alert (Lorenzo, 14 Nov: "do email only for now"). Every wrong club code typed anywhere — sign-up,
// the club step, /account, case start — counts toward one site-wide hourly window in rate_limits (the same atomic
// upsert as the rate limits). The attempt that reaches the threshold emails REPORT_EMAIL_TO once; later ones in the
// window don't. Nothing is blocked: a pause would let anyone shut sign-ups by typing junk, and with six random
// characters per code guessing is hopeless anyway — the email says someone is trying. The codes typed are never
// put in the email. Failures are logged, never thrown: the student only ever sees "invalid code".
import { db } from '@/db/client';
import { logEvent } from '@/lib/analytics';
import { rateLimitUpsertQuery } from '@/lib/rate-limit';
import { emailConfig, sendEmail, type EmailMessage } from '@/lib/email/send';
import { reportRecipient } from '@/lib/site/problem-report';

const HOUR = 3_600_000;
const KEY = 'clubCodeWrong:site';
const DEFAULT_THRESHOLD = 30;

export function wrongCodeThreshold(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CLUB_CODE_ALERT_PER_HOUR);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_THRESHOLD;
}

export function wrongCodeAlertEmail(a: { to: string; hits: number; at: Date }): EmailMessage {
  const subject = `CasePace: ${a.hits} wrong club codes in the last hour`;
  const lines = [
    `${a.hits} wrong club codes were typed on CasePace in the hour up to ${a.at.toISOString()} (all sign-up, club-step and account attempts together).`,
    'Nothing was blocked. Each address is still limited per hour, and a code has six random characters, so guessing one is not realistic.',
    'If a code may have leaked, rotate it: `npm run clubs -- rotate <club>`. Its members stay in; only the new code works for new sign-ups.',
    'You get this at most once an hour.',
  ];
  return {
    to: a.to,
    subject,
    text: lines.join('\n\n'),
    html: lines.map(l => `<p>${l.replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`).join(''),
  };
}

export type WrongCodeDeps = {
  count: () => Promise<number>;          // this window's count, after this attempt
  send: (hits: number) => Promise<void>;
  threshold: number;
  log: (m: string) => void;
  record?: () => Promise<void>;
};

const recordWrongCode = () => logEvent('club_code_rejected', {});

const defaultDeps = (): WrongCodeDeps => ({
  count: async () => (await rateLimitUpsertQuery(db, KEY, new Date(), HOUR))[0].hits,
  send: async hits => {
    const to = reportRecipient();
    const cfg = emailConfig();
    if (!to || !cfg) { console.warn(`[club-alert] ${hits} wrong club codes this hour; no REPORT_EMAIL_TO / RESEND_API_KEY to email`); return; }
    await sendEmail(cfg, wrongCodeAlertEmail({ to, hits, at: new Date() }));
  },
  threshold: wrongCodeThreshold(),
  log: m => console.error(m),
  record: recordWrongCode,
});

export async function noteWrongClubCode(deps: WrongCodeDeps = defaultDeps()): Promise<void> {
  // The pilot dashboard's wrong-code count per week (Matt, 22 Nov): no code text, no account.
  await deps.record?.().catch(() => {});
  let hits: number;
  try {
    hits = await deps.count();
  } catch (e) {
    deps.log(`[club-alert] could not count a wrong club code: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  if (hits !== deps.threshold) return;
  try {
    await deps.send(hits);
  } catch (e) {
    deps.log(`[club-alert] could not send the wrong-code alert: ${e instanceof Error ? e.message : String(e)}`);
  }
}
