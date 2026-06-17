import { defineCommand } from 'citty';
import * as fs from 'node:fs/promises';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { WasmLoader } from '@wasm4pm/engine';
import { createQuietObservabilityLayer } from '../observability-util.js';

/**
 * Structural validation for OCEL JSON output from WASM.
 * The WASM `export_ocel2_to_json` function produces an object with `events` and `objects` arrays.
 * Validates at the boundary before any downstream access.
 */
function parseOcelJson(raw: string, commandName: string): { events: unknown[]; objects: unknown[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${commandName}: WASM returned invalid JSON for OCEL export: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${commandName}: WASM OCEL export must be an object, got: ${typeof parsed}`);
  }
  const o = parsed as Record<string, unknown>;
  if (o['events'] !== undefined && !Array.isArray(o['events'])) {
    throw new Error(`${commandName}: WASM OCEL export 'events' must be an array`);
  }
  if (o['objects'] !== undefined && !Array.isArray(o['objects'])) {
    throw new Error(`${commandName}: WASM OCEL export 'objects' must be an array`);
  }
  return {
    events: Array.isArray(o['events']) ? o['events'] : [],
    objects: Array.isArray(o['objects']) ? o['objects'] : [],
  };
}

export const conform = defineCommand({
  meta: {
    name: 'conform',
    description: 'Check prefix conformance of episodes in an OCEL NDJSON log against a model',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to input OCEL NDJSON file',
      required: true,
    },
    model: {
      type: 'string',
      description: 'Process model name or path (e.g. living_diagnostic_clear_v1)',
      required: true,
      alias: 'm',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const t0 = Date.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const inputPath = ctx.args.input as string;
    const model = ctx.args.model as string;

    return withSpan('oracle.conform', { input: inputPath, model }, async () => {
      try {
        const loaderConfig = format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
        const loader = WasmLoader.getInstance(loaderConfig);
        await loader.init();
        const wasm = loader.get() as any;
        
        const content = await fs.readFile(inputPath, 'utf-8');
        
        const handle = wasm.load_ocel2_from_ndjson(content);
        const ocelJson = wasm.export_ocel2_to_json(handle);
        const ocel = parseOcelJson(ocelJson, 'oracle.conform');

        const episodeGroups: Record<string, any[]> = {};
        for (const event of ocel.events as any[]) {
          let episodeId: string | undefined;
          for (const rel of (event as any).relationships || []) {
            if (rel.qualifier === 'episode') {
              episodeId = rel.objectId;
              break;
            }
            const obj = (ocel.objects as any[])?.find((o: any) => o.id === rel.objectId);
            if (obj && (obj.type === 'episode' || obj.object_type === 'episode')) {
              episodeId = rel.objectId;
              break;
            }
          }
          if (episodeId) {
            if (!episodeGroups[episodeId]) {
              episodeGroups[episodeId] = [];
            }
            episodeGroups[episodeId].push(event);
          }
        }

        let resolvedModel = model;
        try {
          const modelContent = await fs.readFile(model, 'utf-8');
          if (modelContent.includes('<pnml')) {
            const loadResJson = wasm.from_pnml_wasm(modelContent);
            const loadRes = JSON.parse(loadResJson);
            if (loadRes.handle) {
              resolvedModel = loadRes.handle;
            }
          }
        } catch {
          // Not a file, keep as is
        }

        let hasViolations = false;
        const findings: any[] = [];

        for (const [episodeId, group] of Object.entries(episodeGroups)) {
          group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          
          const activities = group.map(e => e.type);

          const resultJson = wasm.check_prefix_conformance(resolvedModel, JSON.stringify(activities));
          const checkResult = JSON.parse(resultJson);

          if (checkResult.report === 'BLOCKED' || checkResult.report === 'FAKE-LIVE') {
            hasViolations = true;
            findings.push({
              episodeId,
              report: checkResult.report,
              andon_reason: checkResult.andon_reason,
              details: checkResult.details,
              activities,
            });
          }
        }

        try {
          wasm.delete_object(handle);
        } catch {
          // Ignore best-effort cleanup failure
        }

        const durationMs = Date.now() - t0;

        if (hasViolations) {
          const result = makeResult(
            'oracle conform',
            { findings, verdict: 'Refused' },
            durationMs,
            EXIT_CODES.conformance_fail,
            'Refused: Prefix conformance failed for some episodes'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.conformance_fail);
        } else {
          const result = makeResult(
            'oracle conform',
            { verdict: 'Admitted', findings: [] },
            durationMs,
            EXIT_CODES.success,
            'Admitted: All episodes conform'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.success);
        }
      } catch (e: any) {
        const err = e instanceof Error ? e : new Error(String(e));
        const result = makeErrorResult(
          'oracle conform',
          err,
          EXIT_CODES.execution_error,
          'EXECUTION_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(EXIT_CODES.execution_error);
      }
    });
  },
});

export const attest = defineCommand({
  meta: {
    name: 'attest',
    description: 'Verify lifecycle constraints and receipt gate results in an OCEL NDJSON log',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to input OCEL NDJSON file',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const t0 = Date.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const inputPath = ctx.args.input as string;

    return withSpan('oracle.attest', { input: inputPath }, async () => {
      try {
        const loaderConfig = format === 'json' ? { observability: createQuietObservabilityLayer() } : {};
        const loader = WasmLoader.getInstance(loaderConfig);
        await loader.init();
        const wasm = loader.get() as any;
        
        const content = await fs.readFile(inputPath, 'utf-8');
        
        const handle = wasm.load_ocel2_from_ndjson(content);
        const ocelJson = wasm.export_ocel2_to_json(handle);
        const ocel = parseOcelJson(ocelJson, 'oracle.attest');

        const episodeGroups: Record<string, any[]> = {};
        for (const event of ocel.events as any[]) {
          let episodeId: string | undefined;
          for (const rel of (event as any).relationships || []) {
            if (rel.qualifier === 'episode') {
              episodeId = rel.objectId;
              break;
            }
            const obj = (ocel.objects as any[])?.find((o: any) => o.id === rel.objectId);
            if (obj && (obj.type === 'episode' || obj.object_type === 'episode')) {
              episodeId = rel.objectId;
              break;
            }
          }
          if (episodeId) {
            if (!episodeGroups[episodeId]) {
              episodeGroups[episodeId] = [];
            }
            episodeGroups[episodeId].push(event);
          }
        }

        let hasViolations = false;
        const findings: any[] = [];

        for (const [episodeId, group] of Object.entries(episodeGroups)) {
          group.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

          const activities = group.map(e => e.type);
          const localViolations: string[] = [];

          if (activities.length === 0 || activities[0] !== 'DiagnosticRaised') {
            localViolations.push(`R4 Violation: Episode must start with DiagnosticRaised (actual: ${activities[0] || 'none'})`);
          }

          const idxOf = (type: string) => activities.indexOf(type);

          const receiptIdx = idxOf('ReceiptEmitted');
          const gatePassedIdx = idxOf('GatePassed');
          if (receiptIdx !== -1 && (gatePassedIdx === -1 || gatePassedIdx > receiptIdx)) {
            localViolations.push(`R1 Violation: ReceiptEmitted requires preceding GatePassed`);
          }

          const repairIdx = idxOf('RepairApplied');
          const routeIdx = idxOf('RouteSelected');
          if (repairIdx !== -1 && (routeIdx === -1 || routeIdx > repairIdx)) {
            localViolations.push(`R2 Violation: RepairApplied requires preceding RouteSelected`);
          }

          const suggestIdx = idxOf('RepairSuggested');
          if (repairIdx !== -1 && (suggestIdx === -1 || suggestIdx > repairIdx)) {
            localViolations.push(`R3 Violation: RepairApplied requires preceding RepairSuggested`);
          }

          if (gatePassedIdx !== -1 && receiptIdx !== -1) {
            const gatePassedEvent = group[gatePassedIdx];
            const receiptEmittedEvent = group[receiptIdx];

            const gatePassedResult = gatePassedEvent.attributes?.find((a: any) => a.name === 'gate_result')?.value;

            let receiptGateResult = receiptEmittedEvent.attributes?.find((a: any) => a.name === 'gate_result')?.value;
            if (receiptGateResult === undefined) {
              for (const rel of receiptEmittedEvent.relationships || []) {
                const obj = (ocel.objects as any[]).find((o: any) => o.id === rel.objectId);
                if (obj && (obj.type?.toLowerCase() === 'receipt' || obj.object_type?.toLowerCase() === 'receipt')) {
                  receiptGateResult = obj.attributes?.find((a: any) => a.name === 'gate_result')?.value;
                  if (receiptGateResult !== undefined) break;
                }
              }
            }

            if (gatePassedResult !== receiptGateResult) {
              localViolations.push(`Gate result mismatch: GatePassed gate_result (${gatePassedResult}) does not match Receipt gate_result (${receiptGateResult})`);
            }
          }

          if (localViolations.length > 0) {
            hasViolations = true;
            findings.push({
              episodeId,
              violations: localViolations,
              activities,
            });
          }
        }

        try {
          wasm.delete_object(handle);
        } catch {
          // Ignore best-effort cleanup failure
        }

        const durationMs = Date.now() - t0;

        if (hasViolations) {
          const result = makeResult(
            'oracle attest',
            { findings, verdict: 'Refused' },
            durationMs,
            EXIT_CODES.conformance_fail,
            'Refused: Attestation failed for some episodes'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.conformance_fail);
        } else {
          const result = makeResult(
            'oracle attest',
            { verdict: 'Admitted', findings: [] },
            durationMs,
            EXIT_CODES.success,
            'Admitted: All episodes conform'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.success);
        }
      } catch (e: any) {
        const err = e instanceof Error ? e : new Error(String(e));
        const result = makeErrorResult(
          'oracle attest',
          err,
          EXIT_CODES.execution_error,
          'EXECUTION_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(EXIT_CODES.execution_error);
      }
    });
  },
});

export const oracle = defineCommand({
  meta: {
    name: 'oracle',
    description: 'Process-Law Oracle commands: conform and attest',
  },
  subCommands: {
    conform,
    attest,
  },
});
