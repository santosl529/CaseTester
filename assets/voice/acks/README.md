Pre-rendered acknowledgment clips (raw PCM s16le, 24 kHz mono), named
`<tts>-<voice>-<sha1 of the spoken text>.pcm` (lib/voice/ack-audio.ts). They
ship in the voice worker's image, which synthesizes none at cold start
(VOICE_ACK_SYNTH=0). Render after a change of voice, model or ack wording:
`npx tsx --env-file=.env.local scripts/voice-render-acks.ts --dry`, then with
`--cap=<chars>` (paid), and commit the clips.
