# The voice worker (scripts/voice-agent.ts → lib/voice/livekit-agent.ts, one
# forked process per interview) for LiveKit Cloud agent hosting
# (`lk agent create`) or a container host (Railway/Render background worker).
# TypeScript runs as is under tsx (`node --import tsx`, inherited by the job
# processes; `@/` aliases from tsconfig.json), in the CLI's production `start`
# mode. The image holds no secrets — the host injects them — and needs no
# disk: the TTS ledger and session records live in the database, the
# acknowledgment clips ship in assets/voice/acks (VOICE_ACK_SYNTH=0).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production VOICE_ACK_SYNTH=0

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Only what the worker loads: the code it imports, the cases, the clips.
COPY tsconfig.json ./
COPY lib ./lib
COPY db ./db
COPY cases ./cases
COPY assets ./assets
COPY scripts/voice-agent.ts ./scripts/voice-agent.ts

USER node
# The worker's health check (production mode).
EXPOSE 8081
CMD ["node", "--import", "tsx", "scripts/voice-agent.ts", "start"]
