/**
 * wpm log query — evaluate an OCPQ query against an OCEL log.
 * Migrated from `commands/query.ts` (logic moved, not bridged).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { withSpan } from '../../commands/_otel.js';

function resolveQueryString(queryArg: string): string {
  if (queryArg.trimStart().startsWith('{')) return queryArg;
  const queryPath = resolve(queryArg);
  if (!existsSync(queryPath)) {
    throw NounVerbError.invalidInput(
      `Query file not found: ${queryPath}. Provide a valid path to a JSON query file, or pass inline JSON starting with '{'.`
    );
  }
  try {
    return readFileSync(queryPath, 'utf-8');
  } catch (err) {
    throw NounVerbError.invalidInput(`Failed to read query file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const queryVerb = defineVerb({
  noun: 'log',
  verb: 'query',
  summary: 'Evaluate an OCPQ (Object-Centric Process Query) against an OCEL event log (was: wpm query)',
  args: {
    ocel: { type: 'string', description: 'Path to the OCEL 2.0 JSON event log file', required: true },
    query: { type: 'string', description: "OCPQ query: inline JSON string (starts with '{') or path to a JSON file", required: true },
  } as const,
  handler: async (args) => {
    const ocelArg = args.ocel as string;
    const queryArg = args.query as string;
    return withSpan('log.query', { 'ocel.file': ocelArg, 'query.source': queryArg.startsWith('{') ? 'inline' : 'file' }, async () => {
      const ocelPath = resolve(ocelArg);
      if (!existsSync(ocelPath)) {
        throw NounVerbError.invalidInput(
          `OCEL file not found: ${ocelPath}. Provide a valid path to an OCEL 2.0 JSON file via --ocel.`
        );
      }
      let ocelContent: string;
      try {
        ocelContent = readFileSync(ocelPath, 'utf-8');
      } catch (err) {
        throw NounVerbError.invalidInput(`Failed to read OCEL file: ${err instanceof Error ? err.message : String(err)}`);
      }

      const queryStr = resolveQueryString(queryArg);

      let verdictRaw: string;
      try {
        const wasm = await import('wasm4pm');
        const wasmDefault = (wasm as unknown as { default?: unknown }).default;
        if (typeof wasmDefault === 'function') {
          await (wasmDefault as () => Promise<void>)();
        }
        const evaluateFn = (wasm as unknown as Record<string, unknown>)['evaluate_ocpq'] as
          | ((ocelJson: string, queryStr: string) => string)
          | undefined;
        if (typeof evaluateFn !== 'function') {
          throw new Error('WASM export evaluate_ocpq not found — rebuild WASM core with the "ocel" feature enabled');
        }
        verdictRaw = evaluateFn(ocelContent, queryStr);
      } catch (err) {
        throw NounVerbError.executionError(err instanceof Error ? err.message : String(err));
      }

      let verdict: unknown;
      try {
        verdict = JSON.parse(verdictRaw);
      } catch {
        verdict = verdictRaw;
      }

      return { ocel_file: ocelPath, verdict };
    });
  },
});
