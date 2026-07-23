/**
 * wpm pipeline resume — NEW, small, read-only verb: reports the last saved
 * command receipt (`.wasm4pm/receipts/latest.json`) so an operator can see
 * what a previous `pipeline run` last completed. This does NOT actually
 * resume execution from a checkpoint (the orchestrator does not persist
 * paused-plan state) — see the migration report for this scope boundary.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';

export const resumeVerb = defineVerb({
  noun: 'pipeline',
  verb: 'resume',
  summary: 'Show the last saved receipt so a previous pipeline run can be inspected/continued manually',
  args: {
    'receipts-dir': { type: 'string', description: 'Receipts directory (default: .wasm4pm/receipts)' },
  } as const,
  handler: async (args) => {
    const dir = (args['receipts-dir'] as string | undefined) ?? '.wasm4pm/receipts';
    const latestPath = path.join(dir, 'latest.json');
    let content: string;
    try {
      content = await fs.readFile(latestPath, 'utf-8');
    } catch {
      throw NounVerbError.invalidInput(
        `No receipt found at ${latestPath} — nothing to resume. Run 'wpm pipeline run' first.`
      );
    }
    const receipt = JSON.parse(content);
    return {
      receiptsDir: dir,
      lastReceipt: receipt,
      note: 'This reports the last completed step; it does not automatically re-run remaining steps.',
    };
  },
});
