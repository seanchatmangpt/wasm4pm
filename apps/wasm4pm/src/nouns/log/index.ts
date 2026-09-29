import { defineNoun } from '@wasm4pm/noun-verb';
import { validateVerb } from './validate.js';
import { statsVerb } from './stats.js';
import { dedupeVerb } from './dedupe.js';
import { queryVerb } from './query.js';
import { convertVerb } from './convert.js';
import { sampleVerb } from './sample.js';
import { batchVerb } from './batch.js';

export const logNoun = defineNoun({
  name: 'log',
  description: 'Validate, profile, deduplicate, query, convert, sample, and batch-discover event logs',
  verbs: [validateVerb, statsVerb, dedupeVerb, queryVerb, convertVerb, sampleVerb, batchVerb],
});
