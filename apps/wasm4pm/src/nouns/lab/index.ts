/**
 * wpm lab — experimental/advanced command suites, forwarded (not
 * re-derived) to their existing legacy implementations. Every verb here
 * is `stability: 'experimental'`, so the framework prints the
 * `[experimental]` stderr banner automatically on every invocation.
 */
import { defineNoun } from '@wasm4pm/noun-verb';
import { membraneVerb } from './membrane.js';
import { cellVerb } from './cell.js';
import { adversaryVerb } from './adversary.js';
import { cognitionVerb } from './cognition.js';
import { agentVerb } from './agent.js';
import { autoprocessVerb } from './autoprocess.js';
import { oracleVerb } from './oracle.js';
import { truexVerb } from './truex.js';
import { prolog8Verb } from './prolog8.js';
import { replVerb } from './repl.js';
import { claudeVerb } from './claude.js';
import { supabaseVerb } from './supabase.js';
import { wasmServerVerb } from './wasm-server.js';
import { traceVerb } from './trace.js';
import { benchmarkVerb } from './benchmark.js';
import { timeoutVerb } from './timeout.js';
import { feedbackVerb } from './feedback.js';
import { mlVerb } from './ml.js';
import { temporalVerb } from './temporal.js';
import { socialVerb } from './social.js';

export const labNoun = defineNoun({
  name: 'lab',
  description: 'Experimental and advanced command suites (legacy behavior, unchanged)',
  verbs: [
    membraneVerb,
    cellVerb,
    adversaryVerb,
    cognitionVerb,
    agentVerb,
    autoprocessVerb,
    oracleVerb,
    truexVerb,
    prolog8Verb,
    replVerb,
    claudeVerb,
    supabaseVerb,
    wasmServerVerb,
    traceVerb,
    benchmarkVerb,
    timeoutVerb,
    feedbackVerb,
    mlVerb,
    temporalVerb,
    socialVerb,
  ],
});
