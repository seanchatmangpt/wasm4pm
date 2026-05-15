import { defineCommand } from 'citty';
import { watch } from './cognition/watch.js';

/**
 * `wpm cognition` — Cognition stack commands.
 *
 * Subcommands:
 *   watch   — Watch a BreedInput JSON file and re-run a contract on every change.
 */
export const cognition = defineCommand({
  meta: {
    name: 'cognition',
    description: 'Cognition stack: contract evaluation, adversarial probing, watch mode',
  },
  subCommands: {
    watch,
  },
});

export { watch };
