// What a student reads when POST /api/session refuses a start (lib/session-limits.ts), in their own locale.
export function limitMessage({ reason, limit, retryAt }: { reason?: string; limit?: number; retryAt?: string }): string {
  const when = retryAt ? new Date(retryAt) : null;
  const at = when ? when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'later';
  if (reason === 'busy') return 'All interview slots are in use right now. Please try again in a few minutes.';
  if (reason === 'daily') return `You've started ${limit} interviews in the last 24 hours, the most allowed. You can start another from ${at}.`;
  if (reason === 'monthly') return `You've used your ${limit} interviews for this month. Your limit resets on ${when ? when.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'the 1st'}.`;
  return "We've reached this month's interview limit for the whole site. Please try again next month.";
}
