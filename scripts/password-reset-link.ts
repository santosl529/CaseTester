// Make a password-reset link for a student (Lorenzo, 10 Nov), for Lorenzo to send himself while the site has no
// email sender of its own (lib/site/password-reset.ts). Sends nothing. The link signs the student in once and goes to
// /reset-password; it expires per Supabase's email OTP expiry (default an hour). Treat it like a password.
//
//   npm run password:reset-link -- student@example.com
//   npm run password:reset-link -- student@example.com --site=https://casepace.example
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { parseResetEmail, resetLink } from '@/lib/site/password-reset';

const PRODUCTION = 'https://case-tester.vercel.app';

async function main() {
  const args = process.argv.slice(2);
  const site = args.find(a => a.startsWith('--site='))?.slice('--site='.length) ?? PRODUCTION;
  const parsed = parseResetEmail({ email: args.find(a => !a.startsWith('--')) });
  if (!parsed.ok) {
    console.error('Usage: npm run password:reset-link -- <student email> [--site=https://…]');
    process.exit(1);
  }
  const { data, error } = await createAdminSupabaseClient().auth.admin.generateLink({ type: 'recovery', email: parsed.email });
  if (error || !data?.properties?.hashed_token) {
    console.error(error?.code === 'user_not_found' || error?.status === 404
      ? `No account has the email ${parsed.email}.`
      : `Could not make a link: ${error?.message ?? 'no token returned'}`);
    process.exit(1);
  }
  console.log(`Reset link for ${parsed.email} (works once, expires in about an hour):\n\n${resetLink(site, data.properties.hashed_token)}\n`);
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
