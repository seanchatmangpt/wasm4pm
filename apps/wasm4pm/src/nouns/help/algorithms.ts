/**
 * wpm help algorithms — generated from the algorithm registry engine
 * (`engines/algorithms.ts` -> `wasm4pm`'s `getRegistry()`), not a
 * hand-maintained handler. Replaces `wpm algorithms`.
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { listAlgorithms } from '../../engines/algorithms.js';

export const algorithmsVerb = defineVerb({
  noun: 'help',
  verb: 'algorithms',
  summary: 'List all algorithms with their formats, model type, and WASM export (was: wpm algorithms)',
  handler: async () => {
    const algorithms = listAlgorithms();
    return {
      count: algorithms.length,
      algorithms: algorithms.map((a) => ({
        id: a.id,
        category: a.category,
        modelType: a.modelType,
        formats: a.formats,
        wasmExport: a.wasmExport,
      })),
    };
  },
});
