import { run } from './commands/run.js';
import { watch } from './commands/watch.js';
import { status } from './commands/status.js';
import { explain } from './commands/explain.js';
import { init } from './commands/init.js';
import { predict } from './commands/predict.js';
import { driftWatch } from './commands/drift-watch.js';
import { doctor } from './commands/doctor.js';
import { diff } from './commands/diff.js';
import { results } from './commands/results.js';
import { compare } from './commands/compare.js';
import { ml } from './commands/ml.js';
import { powl } from './commands/powl.js';
import { conformance } from './commands/conformance.js';
import { simulate } from './commands/simulate.js';
import { temporal } from './commands/temporal.js';
import { social } from './commands/social.js';
import { quality } from './commands/quality.js';
import { validate } from './commands/validate.js';
import { autoprocess } from './commands/autoprocess.js';
export declare const main: import('citty').CommandDef<{
  json: {
    type: 'boolean';
    description: string;
  };
  config: {
    type: 'string';
    description: string;
  };
}>;
/**
 * Export all commands for testing and programmatic use
 */
export {
  run,
  watch,
  status,
  explain,
  init,
  predict,
  driftWatch,
  doctor,
  diff,
  results,
  compare,
  ml,
  powl,
  conformance,
  simulate,
  temporal,
  social,
  quality,
  validate,
  autoprocess,
};
//# sourceMappingURL=cli.d.ts.map
