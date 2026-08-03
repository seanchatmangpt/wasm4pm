import { defineNoun } from '@wasm4pm/noun-verb';
import { showVerb } from './show.js';
import { verifyVerb } from './verify.js';
import { chainVerb } from './chain.js';
import { keygenVerb } from './keygen.js';
import { reportVerb } from './report.js';
import { replayVerb } from './replay.js';
import { sessionVerb } from './session.js';
import { liveVerb } from './live.js';

export const evidenceNoun = defineNoun({
  name: 'evidence',
  description:
    'Inspect, verify, replay, and manufacture BLAKE3-bound process evidence and AAT-Live passports',
  verbs: [
    showVerb,
    verifyVerb,
    chainVerb,
    keygenVerb,
    reportVerb,
    replayVerb,
    sessionVerb,
    liveVerb,
  ],
});
