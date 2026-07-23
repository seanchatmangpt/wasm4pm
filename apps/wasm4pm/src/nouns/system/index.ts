import { defineNoun } from '@wasm4pm/noun-verb';
import { doctorVerb } from './doctor.js';
import { statusVerb } from './status.js';
import { cacheVerb } from './cache.js';
import { modelsVerb } from './models.js';
import { completionsVerb } from './completions.js';

export const systemNoun = defineNoun({
  name: 'system',
  description: 'Environment diagnostics, WASM status, caches, and shell completions',
  verbs: [doctorVerb, statusVerb, cacheVerb, modelsVerb, completionsVerb],
});
