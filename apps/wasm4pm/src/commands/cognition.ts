//! `wpm cognition` — dispatcher for the old-AI cognition kernel.
//! Each verb lives in its own file under ./cognition/.

import { defineCommand } from 'citty';
import { run } from './cognition/run.js';
import { explain } from './cognition/explain.js';
import { verify } from './cognition/verify.js';
import { receipt } from './cognition/receipt.js';
import { adversarial } from './cognition/adversarial.js';
import { replay } from './cognition/replay.js';
import { plan } from './cognition/plan.js';
import { inspect } from './cognition/inspect.js';

export const cognition = defineCommand({
  meta: {
    name: 'cognition',
    description:
      'Old-AI cognition kernel: contracts, breed selection, receipt chains, adversarial gates',
  },
  subCommands: {
    run,
    explain,
    verify,
    receipt,
    adversarial,
    replay,
    plan,
    inspect,
  },
});
