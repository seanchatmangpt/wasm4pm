import { defineNoun } from '@wasm4pm/noun-verb';
import { showVerb } from './show.js';
import { getVerb } from './get.js';
import { setVerb } from './set.js';
import { resetVerb } from './reset.js';
import { envVerb } from './env.js';
import { exportVerb } from './export.js';
import { diffVerb } from './diff.js';
import { checkVerb } from './check.js';
import { initVerb } from './init.js';

export const configNoun = defineNoun({
  name: 'config',
  description: 'Inspect and manage wasm4pm configuration',
  verbs: [showVerb, getVerb, setVerb, resetVerb, envVerb, exportVerb, diffVerb, checkVerb, initVerb],
});
