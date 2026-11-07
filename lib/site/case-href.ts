// Where a case session opens (Lorenzo, 6 Nov: voice is the default; text stays one click away). Client-safe: no
// server imports.
export type CaseMode = 'voice' | 'text';
export const DEFAULT_CASE_MODE: CaseMode = 'voice';

export function caseHref(sessionId: string, mode: CaseMode = DEFAULT_CASE_MODE): string {
  const base = `/case/${encodeURIComponent(sessionId)}`;
  return mode === 'voice' ? `${base}/voice` : base;
}
