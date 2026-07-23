import { defineNoun } from '@wasm4pm/noun-verb';
import { validateVerb } from './validate.js';
import { statsVerb } from './stats.js';
import { dedupeVerb } from './dedupe.js';
import { queryVerb } from './query.js';
import { convertVerb } from './convert.js';
import { sampleVerb } from './sample.js';

export const logNoun = defineNoun({
  name: 'log',
  description: 'Validate, profile, deduplicate, query, convert, and sample event logs',
  verbs: [validateVerb, statsVerb, dedupeVerb, queryVerb, convertVerb, sampleVerb],
});
