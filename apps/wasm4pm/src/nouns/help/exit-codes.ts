/**
 * wpm help exit-codes — generated from the `EXIT_CODES` contract
 * (`exit-codes.ts`) and the noun-verb framework's own `ErrorCode` ->
 * exit-code mapping, not a hand-maintained handler. Replaces
 * `wpm exit-codes`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { EXIT_CODES, ERROR_CODE_MAP } from '../../exit-codes.js';

export const exitCodesVerb = defineVerb({
  noun: 'help',
  verb: 'exit-codes',
  summary: 'Show the exit-code contract for legacy (bridged) and native noun-verb commands (was: wpm exit-codes)',
  handler: async () => {
    return {
      legacyCommandExitCodes: EXIT_CODES,
      // wpm's OWN ErrorCode -> exit-code map (the one actually wired into the
      // CLI via cli.ts's `errorCodeMap`), NOT the framework default — e.g.
      // INVALID_INPUT maps to source_error(2) here, which is what a native
      // verb actually exits with.
      nativeVerbErrorCodeExitCodes: ERROR_CODE_MAP,
      note:
        'Bridged verbs (wrapping a legacy commands/*.ts body) surface the legacy EXIT_CODES contract. ' +
        'Native verbs (e.g. model discover/check) throw a NounVerbError whose code maps through ' +
        'nativeVerbErrorCodeExitCodes (wpm\'s ERROR_CODE_MAP).',
    };
  },
});
