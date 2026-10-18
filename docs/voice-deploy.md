# Deploying the voice worker

The voice interview runs in two places: the Next.js app on Vercel (pages, the
token route that dispatches the agent, scoring) and the **voice worker** — a
long-lived LiveKit Agents process (`scripts/voice-agent.ts`, one forked process
per interview) that can't run on serverless (PRD §8.4). Target: LiveKit Cloud
agent hosting. Fallback: a Railway or Render background worker running the
same image.

Written 18 Oct 2026 (branch `voice-deploy`). The LiveKit CLI commands below
were checked against LiveKit's docs that day, not run — `lk` isn't installed on
the dev machine. Run `lk agent --help` once to confirm them.

## Can LiveKit hosting run the worker as is?

Yes, with what this branch adds. What it needed:

- **No disk.** A cloud container's disk is wiped on restart. The monthly TTS
  ledger is now a table (`voice_tts_usage`, atomic increments), the session
  records are a table (`voice_session_lines`; `scripts/voice-export.ts`
  rebuilds the local files), the acknowledgment clips ship in the image
  (`assets/voice/acks`, `VOICE_ACK_SYNTH=0`), and recordings stay off.
- **A production entry and an image.** `npm run voice:agent:start` and the root
  `Dockerfile` (TypeScript under tsx, path aliases working, built and probed
  locally).
- **Two things LiveKit Cloud does its own way.** It injects `LIVEKIT_URL`,
  `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (you can't set them). It also
  overrides a custom load function or load threshold with its defaults, so
  the concurrency cap lives in the token route (`VOICE_MAX_CONCURRENT`), not
  in the worker.

Unverified: per-instance CPU/memory and the plan's concurrent-session and
agent-minute quotas (not in the docs pages I could reach). Each interview is
its own Node process: about 225 MB RSS once the agent module is loaded, and 0.6–0.8s to load it (measured 18 Oct in the local arm64 image, before any network call; pre-warmed processes pay this before a job arrives). Not measured: RSS during a live session.

## Before the first deploy (in this order)

1. **Done 18 Oct: migration 0021** (`voice_tts_usage`, `voice_session_lines`),
   applied as row 24, the latest. It sits on top of Matthew's drills
   migrations 0009–0020 (all applied earlier), which this branch carries
   unchanged as files. See "Migrations" below.
2. **Done 18 Oct (15,847).** Carry October's TTS count into the table (free, one write):
   `npx tsx --env-file=.env.local scripts/voice-tts-seed.ts --dry`, then
   without `--dry`.
3. **Done 18 Oct (`cce400c`).** Render the acknowledgment clips (paid: 7 clips, 77 Cartesia
   characters for voice 533b2990 on sonic-3.6):
   `npx tsx --env-file=.env.local scripts/voice-render-acks.ts --dry`, then
   `--cap=100`. Commit `assets/voice/acks/*.pcm`. Without them the hosted
   worker plays no acknowledgments or thinking fillers, and logs which clips
   are missing at each job start.
4. **Merge and push** (below). Vercel deploys the token route's cap and the
   browser's busy message.
5. **Create the agent** (below).
6. **Stop the local worker** (`npm run voice:agent`) for good once the hosted
   one is live. Both register as `case-interviewer` on the same LiveKit
   project, so dispatches would go to either of them.

## Secrets

### Hosted worker (a file you make, e.g. `.env.voice-worker`)

`.env*` is gitignored and left out of LiveKit's upload. Format: `KEY=VALUE`,
one per line.

Required:

| Name | What |
|---|---|
| `ANTHROPIC_API_KEY` | interviewer, classifiers, math checker |
| `DEEPGRAM_API_KEY` | Flux STT |
| `CARTESIA_API_KEY` | TTS |
| `DATABASE_URL` | the Supabase **pooler, transaction mode** (port 6543), the same URL Vercel uses |
| `SUPABASE_SECRET_KEY` | required by `db/client.ts` at import |

Only on Railway/Render (LiveKit Cloud injects these): `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

Optional (the defaults are in code):

| Name | Default |
|---|---|
| `LLM_BUDGET_USD` | `1.00` — per session (each job is its own process; `lib/voice/session-budget.ts`) |
| `VOICE_TTS_RUN_CAP` | `8000` — Cartesia characters per session (a voice session uses ≈ 3,700–4,000). At the cap the interviewer says a closing line and the session ends like the End button, with a report when assessable — never silence (below) |
| `VOICE_TTS_CHAR_CAP` | `90000` — the monthly cap, shared through the table |
| `VOICE_MAX_SESSION_MIN` | `25` |
| `VOICE_BARGE_MIN_WORDS` | `2` |
| `VOICE_CHECKIN_MS` | `90000` (the silence check-in; `0` = off) |
| `VOICE_FILLER_LONG_WORDS`, `VOICE_FILLER_MAX_RUN`, `VOICE_FILLER_DELAY_MS`, `VOICE_FILLER_GAP_MS`, `VOICE_FILLER_TAIL_MS` | the tuned values |
| `MATH_CHECKER_CONFIG`, `INTERVIEWER_PROVIDER` | production defaults |

Leave unset on the hosted worker: `CARTESIA_VOICE_ID` (another voice has no
shipped clips), `VOICE_TTS` (`fake` = the test tone), `VOICE_RECORD`,
`VOICE_RECORDS_DIR`, `VOICE_STT_KEYTERMS`, `LLM_BUDGET_FILE` (ignored anyway),
`LLM_EXTRA_BUDGET_*`. `VOICE_ACK_SYNTH=0` is set in the image.

### Vercel (separate)

New: `VOICE_MAX_CONCURRENT` (optional, default `1`): the number of live voice
rooms before a new Start gets "Voice is busy right now. Try again in a few
minutes." Already there: `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET` (the token route dispatches and now lists rooms with
them).

## When a session hits its TTS cap

A turn starts only with room left for a whole turn (600 characters; the
longest interviewer turn in batches 30–31 was 478) plus the closing line,
which is held back from every other segment. When there isn't room — or a
segment is refused mid-turn — nothing more of that turn plays; the
interviewer says *"We need to stop here: this session has reached its voice
limit. Thank you for working through the case with me."*; the session ends as
the End button ends it (completed with a partial report when something
assessable was done; `endReason: voice_tts_cap`); the screen shows "This
session reached its voice limit, so it ended here." and, with a report, the
Score button. If even the closing line can't be spoken (the monthly ledger
exhausted), the caption and the message still appear. The monthly cap
(`VOICE_TTS_CHAR_CAP`) ends a session the same way.

## Database: pooler, transaction mode

Use the Supabase pooler in **transaction mode** (`…pooler.supabase.com:6543`).
Why:

- **Connections multiply.** Each interview is its own process with its own
  postgres-js pool (up to 10 connections), and start mode keeps up to 4
  pre-warmed processes. Session mode holds one database connection for each
  client connection for its whole life, so a few processes can use up the
  pooler's session-mode pool. Transaction mode shares connections between
  transactions.
- **We lose nothing.** The worker's queries are single statements or short
  transactions. `db/client.ts` already turns prepared statements off
  (`prepare: false`), and nothing uses LISTEN/NOTIFY, session settings or
  advisory locks. The ledger's increment is one statement.
- **The direct connection** (`db.<ref>.supabase.co:5432`) is IPv6-only without
  Supabase's IPv4 add-on, and container hosts often can't reach IPv6.

Pick the LiveKit agent region closest to the Supabase project's region: every
turn makes several database round trips.

## Migrations

This repo shares one database and one migration sequence with the drills
branch (Matthew's). drizzle's migrator (drizzle-orm 0.45.2,
`pg-core/dialect.js`) reads only the latest row of `drizzle.__drizzle_migrations`.
It then runs only migrations whose journal `when` is later than that row. It
checks no gaps, numbers or hashes. Three rules follow:

1. **Pull before `db:generate`.** Run `git fetch` first, and bring in any
   migration on another branch (main, drills) that isn't in yours yet. Then
   generate. Your new migration then gets the next number and a later date.
2. **Whoever merges second regenerates.** If two branches each added a
   migration with the same number, the branch merged second deletes its own,
   takes the other branch's `db/migrations` (files, snapshots, journal) as they
   are, and runs `drizzle-kit generate` again. Never renumber a file or edit
   the journal or snapshots by hand.
3. **Never apply a migration dated earlier than the latest applied one.** It
   will be skipped silently and its tables will never be created. Before
   `db:migrate`, check the latest applied row (read-only:
   `select id, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`).
   Compare it with the `when` of every migration you expect to run. If one is
   older, regenerate it on top (rule 2) before migrating.

## LiveKit Cloud commands

One-time setup: `brew install livekit-cli`, then `lk cloud auth` (links the
CLI to the project). Run these from the repo root, at the commit you want to
deploy.

```sh
# Create (first time). Writes livekit.toml, uses the existing Dockerfile, builds and deploys.
lk agent create --region <region> --secrets-file .env.voice-worker

# Deploy a new version (later commits).
lk agent deploy

# Status, versions, logs.
lk agent status
lk agent versions
lk agent logs                    # runtime, streams from the latest instance
lk agent logs --log-type=build

# Secrets (each update is a rolling restart).
lk agent secrets                 # list names
lk agent update-secrets --secrets-file=.env.voice-worker
lk agent update-secrets --secrets "VOICE_TTS_RUN_CAP=6000"
lk agent update-secrets --secrets-file=.env.voice-worker --overwrite   # replace the whole set

# Roll back (default: the version before the current one).
lk agent rollback
lk agent rollback --version <version>
```

Commit `livekit.toml` after `create`. It holds the agent id and region, no
secrets.

### Fallback: Railway or Render

Same image: a background worker (no public HTTP), built from the root
`Dockerfile`, with the worker's secrets plus the three `LIVEKIT_*` values. The
worker's health check listens on 8081. Logs, rollback and secrets go through
the host's dashboard or CLI.

## Reviewing a hosted session

```sh
npx tsx --env-file=.env.local scripts/voice-export.ts <sessionId>
```

This writes `Case Interview Runs/voice-live/<date>/<sessionId>.jsonl` (the
per-turn records, as before), `<sessionId>.md` (the transcript) and
`<sessionId>-db-dump.json` (the shape the replay tools read). It's free and
only reads. The transcript marks a filler that was picked but didn't play as
`~~Hmm…~~ *(filler skipped: fillers_off)*` — the saved line still opens with
it, so the db dump and the scorer's transcript show it as said.

## Getting club-beta-2 and this work onto main

`main` is an ancestor of `fact-guards`, and `club-beta-2` (a840663) is on
`fact-guards`. From the main checkout:

```sh
git checkout fact-guards
git merge --no-ff voice-deploy -m "Merge voice-deploy into fact-guards: the hosted voice worker"
git checkout main
git merge --ff-only fact-guards
git push origin main fact-guards
git push origin club-beta-2       # the tag, if you want it on the remote
```

Run the migration before the hosted worker starts. Vercel's code doesn't touch
the new tables.
