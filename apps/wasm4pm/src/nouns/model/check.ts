/**
 * wpm model check — conformance checking with four strategies plus a
 * single-shot drift check, all funneled through the fail-closed conformance
 * engine (`engines/conformance/*`).
 *
 * Replaces: `wpm conformance`, `wpm oracle conform`/`attest`,
 * `wpm self-conformance`, `wpm prefix-conformance`, `wpm drift-watch`
 * (as a one-shot check; the continuous watch loop stays at `wpm lab ml`/
 * legacy tooling — see the migration report for what did not move).
 *
 * `--mode oracle` is the direct fix for defect #2: it reads through
 * `engines/conformance/readers` (handles OCEL v1 `ocel:omap` AND v2
 * `relationships[]` identically) and `verdict.ts` (zero episodes checked is
 * `INDETERMINATE`, never a silent `ADMITTED`).
 */
import * as fs from 'node:fs/promises';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import {
  readToEpisodeSet,
  aggregateVerdict,
  isOcelFormat,
  detectFormat,
  type ConformanceWasmModule,
  type Episode,
  type EpisodeVerdict,
} from '../../engines/conformance/index.js';
import { loadPetriNetFromPnml, replayPrefix, replayTokenBased, type PetriWasmModule } from '../../engines/conformance/replayers/petri.js';
import { loadDfgFromJson, type DfgWasmModule } from '../../engines/conformance/replayers/dfg.js';
import { resolveAlgorithm, discover as runDiscoverEngine } from '../../engines/algorithms.js';
import { loadLog } from '../../engines/load-log.js';

type CheckMode = 'replay' | 'prefix' | 'self' | 'oracle' | 'drift';
const MODES: readonly CheckMode[] = ['replay', 'prefix', 'self', 'oracle', 'drift'];

interface CheckWasm extends ConformanceWasmModule, PetriWasmModule, DfgWasmModule {
  detect_drift?(logHandle: string, activityKey: string, windowSize: number): unknown;
}

async function readFile(path: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (e) {
    throw NounVerbError.invalidInput(`Cannot read '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Load a model (PNML or DFG-JSON file, or an already-known WASM handle string) into a handle. */
async function resolveModelHandle(wasm: CheckWasm, modelArg: string): Promise<string> {
  let content: string | undefined;
  try {
    content = await fs.readFile(modelArg, 'utf-8');
  } catch {
    // Not a readable file — treat the argument itself as an existing handle.
    return modelArg;
  }
  const trimmed = content.trim();
  if (trimmed.startsWith('<')) {
    return loadPetriNetFromPnml(wasm, content);
  }
  try {
    JSON.parse(trimmed);
  } catch {
    throw NounVerbError.invalidInput(`Model file '${modelArg}' is neither PNML XML nor JSON`);
  }
  return loadDfgFromJson(wasm, trimmed);
}

function requireModel(args: Record<string, unknown>, mode: CheckMode): string {
  const model = args.model as string | undefined;
  if (!model) {
    throw NounVerbError.invalidInput(`--model is required for --mode ${mode}`);
  }
  return model;
}

export const checkVerb = defineVerb({
  noun: 'model',
  verb: 'check',
  summary:
    'Check conformance of a log against a model. Modes: replay (token-based fitness), ' +
    'prefix (per-trace prefix conformance), self (log vs. a model mined from itself), ' +
    'oracle (OCEL episode-grouped prefix conformance, fail-closed), drift (one-shot concept-drift check)',
  args: {
    input: { type: 'positional', description: 'Path to the event log or OCEL log to check', required: true },
    model: { type: 'string', description: 'Path to a PNML/DFG-JSON model file, or an existing WASM handle (required for replay/prefix/oracle)', alias: 'm' },
    mode: { type: 'string', description: `Conformance strategy: ${MODES.join(' | ')} (default: replay)` },
    'activity-key': { type: 'string', description: 'Event attribute key for activity names (default: concept:name)' },
    'object-type': { type: 'string', description: "OCEL object type to group episodes by, for --mode oracle (default: 'episode')" },
    'fitness-threshold': { type: 'string', description: 'Minimum fitness to conform, for replay/self modes (default: 1.0)' },
    'window-size': { type: 'string', description: 'Drift-detection window size, for --mode drift (default: 50)' },
  } as const,
  handler: async (args) => {
    const mode = ((args.mode as string | undefined) ?? 'replay') as CheckMode;
    if (!MODES.includes(mode)) {
      throw NounVerbError.invalidInput(`Unknown --mode '${mode}'. Valid modes: ${MODES.join(', ')}`);
    }

    // NOTE: --fitness-threshold is intentionally NOT config-time validated
    // (no NaN/range check) — see conformance-cli.test.ts's "model check
    // --fitness-threshold" group: a non-numeric value makes every
    // `fitness >= NaN` comparison false, so the log is deterministically
    // REJECTED rather than erroring at parse time. This is a deliberate
    // simplification vs. the old `wpm conformance --threshold` command,
    // which did validate the range up front.
    const fitnessThreshold = args['fitness-threshold'] ? Number(args['fitness-threshold']) : 1.0;

    const inputPath = args.input as string;
    const content = await readFile(inputPath);
    const activityKey = (args['activity-key'] as string | undefined) ?? 'concept:name';

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as unknown as CheckWasm;

    if (mode === 'drift') {
      const format = detectFormat(content);
      if (isOcelFormat(format)) {
        throw NounVerbError.invalidInput('--mode drift requires an XES or CSV event log, not OCEL');
      }
      const loaded = loadLog(wasm as never, content, { format, activityKey });
      if (!wasm.detect_drift) {
        throw NounVerbError.executionError('WASM build has no detect_drift export');
      }
      const windowSize = args['window-size'] ? Number(args['window-size']) : 50;
      const raw = wasm.detect_drift(loaded.handle, activityKey, windowSize);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { mode, format, windowSize, drift: parsed };
    }

    const format = detectFormat(content);

    if (mode === 'oracle' && !isOcelFormat(format)) {
      throw NounVerbError.invalidInput(`--mode oracle requires an OCEL log; detected format was '${format}'. Use --mode prefix for XES/CSV.`);
    }
    if (mode === 'prefix' && isOcelFormat(format)) {
      throw NounVerbError.invalidInput(`--mode prefix expects an XES/CSV log; detected format was '${format}'. Use --mode oracle for OCEL.`);
    }

    if (mode === 'oracle' || mode === 'prefix') {
      const modelArg = requireModel(args, mode);
      const modelHandle = await resolveModelHandle(wasm, modelArg);
      const episodeSet = readToEpisodeSet(content, wasm, {
        format,
        groupByObjectType: (args['object-type'] as string | undefined) ?? 'episode',
      });
      const verdicts: EpisodeVerdict[] = episodeSet.episodes.map((ep: Episode) => replayPrefix(wasm, modelHandle, ep));
      const verdict = aggregateVerdict(verdicts, { ungroupedEventCount: episodeSet.ungroupedEventCount });
      return { mode, format, sourceFormat: episodeSet.sourceFormat, totalEvents: episodeSet.totalEvents, ...verdict };
    }

    // replay / self — both operate on the whole XES/CSV log as one unit.
    if (isOcelFormat(format)) {
      throw NounVerbError.invalidInput(`--mode ${mode} requires an XES/CSV event log; detected format was '${format}'`);
    }
    const loaded = loadLog(wasm as never, content, { format, activityKey });
    const episodeSet = readToEpisodeSet(content, wasm, { format });

    let petriNetHandle: string;
    let algorithmUsed: string | undefined;
    if (mode === 'self') {
      const descriptor = resolveAlgorithm('alpha_plus_plus');
      algorithmUsed = descriptor.id;
      const { raw } = await runDiscoverEngine(wasm as unknown as Record<string, unknown>, descriptor, loaded.handle, activityKey);
      const rawObj = raw as { handle?: string };
      if (!rawObj?.handle) {
        throw NounVerbError.internalError('Self-discovery did not return a model handle');
      }
      petriNetHandle = rawObj.handle;
    } else {
      petriNetHandle = await resolveModelHandle(wasm, requireModel(args, mode));
    }

    const verdicts = replayTokenBased(wasm, loaded.handle, petriNetHandle, activityKey, episodeSet.episodes, fitnessThreshold);
    const verdict = aggregateVerdict(verdicts, { ungroupedEventCount: episodeSet.ungroupedEventCount });
    // `threshold` is echoed back for audit-trail purposes (mcpp-admission-gate.test.ts
    // group B6/D: a rejection must be traceable to the exact threshold that was applied).
    return { mode, format, algorithmUsed, threshold: fitnessThreshold, totalEvents: episodeSet.totalEvents, ...verdict };
  },
  human: (result: Record<string, unknown>) => `[${result.mode}] ${result.message ?? JSON.stringify(result)}`,
});
