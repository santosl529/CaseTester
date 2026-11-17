// Who may open the pilot reports (Matt, 17 Nov, pre-pilot audit M6). In production: only the founder accounts listed
// in REPORTS_ALLOWED_EMAILS (comma-separated), checked on the server; everyone else gets a 404, as if the page didn't
// exist. Outside production (a developer's machine): any signed-in account, as before.
export function reportsAllowedFor(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  const allowed = (env.REPORTS_ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(email) && allowed.includes(email!.trim().toLowerCase());
}
