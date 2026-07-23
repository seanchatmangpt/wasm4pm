import { defineNoun } from '@wasm4pm/noun-verb';
import { algorithmsVerb } from './algorithms.js';
import { examplesVerb } from './examples.js';
import { exitCodesVerb } from './exit-codes.js';

export const helpNoun = defineNoun({
  name: 'help',
  description: 'Generated reference topics: algorithms, examples, exit codes',
  verbs: [algorithmsVerb, examplesVerb, exitCodesVerb],
});
