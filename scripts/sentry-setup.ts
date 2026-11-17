// Sentry alerts and a delivery check (Matt, 17 Nov, pre-pilot audit M4). Uses SENTRY_ORG, SENTRY_PROJECT and
// SENTRY_AUTH_TOKEN (never printed).
//   npx tsx --env-file=.env.local scripts/sentry-setup.ts            create the two email alerts (once; existing ones are kept)
//   npx tsx --env-file=.env.local scripts/sentry-setup.ts --check    list the deliberate test errors that arrived, with what they carry
// Alerts, by email to the project's members (Matt): any new kind of error, and a spike (more than SPIKE errors in an
// hour across the project; per-issue if the plan has no metric alerts).
const ORG = process.env.SENTRY_ORG;
const PROJECT = process.env.SENTRY_PROJECT;
const TOKEN = process.env.SENTRY_AUTH_TOKEN;
const API = 'https://sentry.io/api/0';
const SPIKE = 20;
if (!ORG || !PROJECT || !TOKEN) throw new Error('set SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN in .env.local');

async function call<T>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) as T };
}

const email = { id: 'sentry.mail.actions.NotifyEmailAction', targetType: 'IssueOwners', fallthroughType: 'ActiveMembers' };

async function setup() {
  const rules = await call<{ name: string }[]>('GET', `/projects/${ORG}/${PROJECT}/rules/`);
  if (!rules.ok) throw new Error(`could not list alert rules: HTTP ${rules.status}`);
  const has = (name: string) => rules.data.some(r => r.name === name);
  if (!has('CasePace: new kind of error')) {
    const r = await call('POST', `/projects/${ORG}/${PROJECT}/rules/`, {
      name: 'CasePace: new kind of error', actionMatch: 'any', filterMatch: 'all', frequency: 5,
      conditions: [{ id: 'sentry.rules.conditions.first_seen_event.FirstSeenEventCondition' }], actions: [email],
    });
    console.log(`new kind of error: ${r.ok ? 'created' : `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`}`);
  } else console.log('new kind of error: already there');

  // A project-wide spike needs a metric alert; on a plan without them, the same threshold per issue.
  const members = await call<{ user?: { id: string } | null; role: string }[]>('GET', `/organizations/${ORG}/members/`);
  const owner = members.ok ? members.data.find(m => m.user && (m.role === 'owner' || m.role === 'manager'))?.user?.id : undefined;
  const metric = await call<{ name: string }[]>('GET', `/organizations/${ORG}/alert-rules/`);
  if (metric.ok && metric.data.some(r => r.name === 'CasePace: error spike')) { console.log('error spike: already there'); return; }
  const m = owner ? await call('POST', `/organizations/${ORG}/alert-rules/`, {
    name: 'CasePace: error spike', dataset: 'events', eventTypes: ['error'], query: '', aggregate: 'count()', timeWindow: 60,
    thresholdType: 0, resolveThreshold: null, projects: [PROJECT], environment: 'production',
    triggers: [{ label: 'critical', alertThreshold: SPIKE, actions: [{ type: 'email', targetType: 'user', targetIdentifier: owner }] }],
  }) : { ok: false, status: 0, data: 'no owner found' };
  if (m.ok) { console.log(`error spike: created (more than ${SPIKE} errors in an hour, project-wide)`); return; }
  console.log(`error spike: a metric alert wasn't accepted (HTTP ${m.status}); using a per-issue alert instead`);
  if (!has('CasePace: error spike (per issue)')) {
    const r = await call('POST', `/projects/${ORG}/${PROJECT}/rules/`, {
      name: 'CasePace: error spike (per issue)', actionMatch: 'any', filterMatch: 'all', frequency: 60,
      conditions: [{ id: 'sentry.rules.conditions.event_frequency.EventFrequencyCondition', value: SPIKE, interval: '1h', comparisonType: 'count' }], actions: [email],
    });
    console.log(`error spike (per issue): ${r.ok ? 'created' : `HTTP ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`}`);
  }
}

async function check() {
  const issues = await call<{ id: string; title: string; count: string; lastSeen: string }[]>('GET', `/projects/${ORG}/${PROJECT}/issues/?query=${encodeURIComponent('Sentry check')}&statsPeriod=24h`);
  if (!issues.ok) throw new Error(`could not list issues: HTTP ${issues.status}`);
  if (issues.data.length === 0) console.log('no "Sentry check" errors have arrived yet');
  for (const i of issues.data) {
    const ev = await call<Record<string, unknown>>('GET', `/organizations/${ORG}/issues/${i.id}/events/latest/`);
    const e = ev.data ?? {};
    const tags = Object.fromEntries(((e.tags as { key: string; value: string }[]) ?? []).map(t => [t.key, t.value]));
    const user = e.user as Record<string, unknown> | null;
    const text = JSON.stringify(e);
    console.log(`${i.title} — ${i.count}×, last ${i.lastSeen}`);
    console.log(`  where: ${tags.runtime ?? tags['runtime.name'] ?? tags.browser ?? '?'}; page tag: ${tags.page ?? 'none'}; user: ${user ? JSON.stringify(Object.keys(user)) + (user.id ? ' (id present)' : '') : 'none'}`);
    console.log(`  personal data in the event: ${/@[a-z0-9-]+\.[a-z]{2,}/i.test(text.replace(/sentry\.io|ingest\.[a-z.]*sentry/g, '')) ? 'AN EMAIL-LIKE STRING (check)' : 'no email-like text'}; request body: ${(e.request as { data?: unknown } | undefined)?.data ? 'PRESENT' : 'none'}`);
  }
}

(process.argv.includes('--check') ? check() : setup()).then(() => process.exit(0), e => { console.error((e as Error).message); process.exit(1); });
