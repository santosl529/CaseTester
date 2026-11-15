// Clubs and their codes (lib/club-admin.ts). Writes to the database of the env file it runs with — production's
// from .env.local — so each change is an explicit command. New codes are printed once here to share with the club;
// `list` shows them again.
//
//   npm run clubs -- list
//   npm run clubs -- add everview --name="Everview" [--prefix=EVERVIEW]
//   npm run clubs -- rotate everview
//   npm run clubs -- off everview | on everview
//   npm run clubs -- rename everview --name="Everview Consulting"
//   npm run clubs -- unretire WHARTON2026
import { addClub, dbClubsStore, listClubs, parseClubsArgs, renameClub, rotateCode, setClubActive, unretireCode } from '@/lib/club-admin';

const USAGE = `usage: npm run clubs -- list
       npm run clubs -- add <id> --name="<name>" [--prefix=<PREFIX>]
       npm run clubs -- rotate <id>
       npm run clubs -- on <id> | off <id>
       npm run clubs -- rename <id> --name="<name>"
       npm run clubs -- unretire <CODE>`;

async function main(): Promise<number> {
  const c = parseClubsArgs(process.argv.slice(2));
  const s = dbClubsStore;
  const now = new Date();
  const fail = (e: string) => { console.error(e); return 1; };
  switch (c.cmd) {
    case 'usage': console.log(USAGE); return 1;
    case 'list': {
      const rows = await listClubs(s);
      if (!rows.length) console.log('No clubs yet.');
      for (const r of rows) console.log(`${r.active ? 'on ' : 'OFF'}  ${r.id.padEnd(16)} ${r.name.padEnd(28)} ${r.current.join(', ') || '(no current code)'}${r.retired ? `  (${r.retired} retired)` : ''}`);
      return 0;
    }
    case 'add': {
      const r = await addClub(s, { id: c.id, name: c.name, prefix: c.prefix }, now);
      if (!r.ok) return fail(r.error);
      console.log(`Added ${c.id} ("${c.name}"), switched on. Code: ${r.code}`);
      return 0;
    }
    case 'rotate': {
      const r = await rotateCode(s, c.id, now);
      if (!r.ok) return fail(r.error);
      console.log(`${c.id}: new code ${r.code}${r.retired.length ? `; retired ${r.retired.join(', ')}` : ''}. Members stay in.`);
      return 0;
    }
    case 'on': case 'off': {
      const r = await setClubActive(s, c.id, c.cmd === 'on');
      if (!r.ok) return fail(r.error);
      console.log(`${c.id} switched ${c.cmd}${c.cmd === 'off' ? ': its members are asked for a code until it is switched on again' : ''}.`);
      return 0;
    }
    case 'rename': {
      const r = await renameClub(s, c.id, c.name);
      if (!r.ok) return fail(r.error);
      console.log(`${c.id} is now "${c.name}".`);
      return 0;
    }
    case 'unretire': {
      const r = await unretireCode(s, c.code);
      if (!r.ok) return fail(r.error);
      console.log(`${c.code.trim().toUpperCase()} is accepted again (club ${r.clubId}; switch the club on too if it is off).`);
      return 0;
    }
  }
}

main().then(code => process.exit(code), e => { console.error(e); process.exit(1); });
