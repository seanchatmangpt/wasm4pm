import { defineNoun } from '@wasm4pm/noun-verb';
import { discoverVerb } from './discover.js';
import { checkVerb } from './check.js';
import { compareVerb } from './compare.js';
import { diffVerb } from './diff.js';
import { explainVerb } from './explain.js';
import { simulateVerb } from './simulate.js';
import { predictVerb } from './predict.js';

export const modelNoun = defineNoun({
  name: 'model',
  description: 'Discover, check, compare, and reason about process models',
  verbs: [discoverVerb, checkVerb, compareVerb, diffVerb, explainVerb, simulateVerb, predictVerb],
});
