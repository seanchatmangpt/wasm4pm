import { defineNoun } from '@wasm4pm/noun-verb';
import { showVerb } from './show.js';
import { verifyVerb } from './verify.js';
import { chainVerb } from './chain.js';
import { keygenVerb } from './keygen.js';
import { reportVerb } from './report.js';
import { replayVerb } from './replay.js';

export const evidenceNoun = defineNoun({
  name: 'evidence',
  description: 'Inspect, verify, and generate keys for BLAKE3 receipt-chain evidence',
  verbs: [showVerb, verifyVerb, chainVerb, keygenVerb, reportVerb, replayVerb],
});
