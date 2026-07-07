import { defineNoun } from '@wasm4pm/noun-verb';
import { runVerb } from './run.js';
import { planVerb } from './plan.js';
import { suggestVerb } from './suggest.js';
import { watchVerb } from './watch.js';
import { resumeVerb } from './resume.js';

export const pipelineNoun = defineNoun({
  name: 'pipeline',
  description: 'Plan, run, watch, and resume multi-step analysis pipelines',
  verbs: [runVerb, planVerb, suggestVerb, watchVerb, resumeVerb],
});
