/**
 * `wpm receipt mine-chain` — Process-mine the receipt chain as an OCEL 2.0 log.
 *
 * Reads all receipts from `.wasm4pm/receipts/`, converts each to OCEL events via
 * receiptToOcelEvents(), loads the aggregated log into WASM, and runs DFG discovery.
 * Prints a DFG summary and saves the model to `.wasm4pm/receipts/lifecycle-model.json`.
 *
 * With --assert-lifecycle, shadow edges (observed but not declared) are reported as
 * warnings against the declared happy path.
 */

import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { receiptToOcelEvents } from '@wasm4pm/contracts';
import type { Receipt } from '@wasm4pm/contracts';
import { WasmLoader } from '@wasm4pm/engine';
import { withSpan } from '../_otel.js';
import { exitWithFlush } from '../../otel/exit.js';
import { EXIT_CODES } from '../../exit-codes.js';

// ---------------------------------------------------------------------------
// Declared lifecycle — the "happy path" edges for --assert-lifecycle
// ---------------------------------------------------------------------------

const DECLARED_LIFECYCLE_EDGES: ReadonlySet<string> = new Set([
  'algorithm.start->algorithm.complete',
  'algorithm.complete->admitted',
  'algorithm.complete->refused',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DFGNode {
  id: string;
  label: string;
  frequency: number;
}

interface DFGEdge {
  source: string;
  target: string;
  frequency: number;
}

interface DFGResult {
  nodes: DFGNode[];
  edges: DFGEdge[];
  start_activities?: string[];
  end_activities?: string[];
}

/**
 * Convert aggregated OcelEvent[] into the OCEL JSON format expected by WASM
 * (wasm4pm's OCEL struct uses `eventTypes`, `events[].type`, `events[].time`).
 */
function buildOcelJson(events: ReturnType<typeof receiptToOcelEvents>): string {
  // Collect unique activity labels as event types
  const eventTypeSet = new Set<string>();
  // Collect unique object IDs as objects
  const objectIdSet = new Set<string>();

  for (const ev of events) {
    eventTypeSet.add(ev['ocel:activity']);
    for (const oid of ev['ocel:omap']) {
      objectIdSet.add(oid);
    }
  }

  const ocelDoc = {
    eventTypes: Array.from(eventTypeSet),
    objectTypes: ['run'],
    events: events.map((ev) => ({
      id: ev['ocel:eid'],
      type: ev['ocel:activity'],
      time: ev['ocel:timestamp'],
      relationships: ev['ocel:omap'].map((oid) => ({ objectId: oid, qualifier: 'run' })),
      attributes: {},
    })),
    objects: Array.from(objectIdSet).map((oid) => ({
      id: oid,
      type: 'run',
      attributes: {},
      relationships: [],
    })),
  };

  return JSON.stringify(ocelDoc);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const mineChain = defineCommand({
  meta: {
    name: 'mine-chain',
    description: 'Mine the receipt chain as an OCEL 2.0 process log and discover a DFG lifecycle model',
  },
  args: {
    dir: {
      type: 'string',
      default: '.wasm4pm/receipts',
      description: 'Directory containing receipt JSON files',
    },
    'assert-lifecycle': {
      type: 'boolean',
      default: false,
      description: 'Warn on shadow edges not in the declared lifecycle',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Machine-readable JSON output',
    },
  },
  async run(ctx) {
    const dir = ctx.args.dir as string;
    const assertLifecycle = Boolean(ctx.args['assert-lifecycle']);
    const jsonOutput = Boolean(ctx.args.json);

    return withSpan('receipt.mine-chain', { dir }, async () => {
      const resolvedDir = path.resolve(dir);

      // ── 1. Glob receipts ───────────────────────────────────────────────────
      if (!fs.existsSync(resolvedDir)) {
        console.log('No receipts found');
        return exitWithFlush(EXIT_CODES.success);
      }

      const receiptFiles = fs
        .readdirSync(resolvedDir)
        .filter((f) => f.endsWith('.json') && f !== 'lifecycle-model.json')
        .map((f) => path.join(resolvedDir, f));

      if (receiptFiles.length === 0) {
        console.log('No receipts found');
        return exitWithFlush(EXIT_CODES.success);
      }

      // ── 2. Parse receipts → OCEL events ───────────────────────────────────
      const allEvents: ReturnType<typeof receiptToOcelEvents> = [];

      for (const file of receiptFiles) {
        try {
          const raw = fs.readFileSync(file, 'utf-8');
          const receipt = JSON.parse(raw) as Receipt;
          // Skip files that don't look like receipts
          if (!receipt.run_id || !receipt.algorithm) continue;
          const events = receiptToOcelEvents(receipt);
          allEvents.push(...events);
        } catch {
          // Skip unreadable or malformed files
        }
      }

      if (allEvents.length === 0) {
        console.log('No valid receipts found');
        return exitWithFlush(EXIT_CODES.success);
      }

      // ── 3. Load OCEL into WASM ─────────────────────────────────────────────
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, (...args: unknown[]) => unknown>;

      const ocelJson = buildOcelJson(allEvents);

      let ocelHandle: string;
      try {
        ocelHandle = wasm['load_ocel2_from_json'](ocelJson) as string;
      } catch (err) {
        console.error('Failed to load OCEL into WASM:', err);
        return exitWithFlush(EXIT_CODES.execution_error);
      }

      // ── 4. Discover DFG ───────────────────────────────────────────────────
      let dfg: DFGResult;
      try {
        const rawDfg = wasm['discover_ocel_dfg'](ocelHandle);
        dfg = (typeof rawDfg === 'string' ? JSON.parse(rawDfg) : rawDfg) as DFGResult;
      } catch (err) {
        console.error('DFG discovery failed:', err);
        return exitWithFlush(EXIT_CODES.execution_error);
      }

      const nodes: DFGNode[] = dfg.nodes ?? [];
      const edges: DFGEdge[] = dfg.edges ?? [];

      // ── 5. Lifecycle summary — top activity sequences by edge frequency ───
      const sortedEdges = [...edges].sort((a, b) => b.frequency - a.frequency);
      const top5 = sortedEdges.slice(0, 5);

      // Happy path: the sequence of highest-frequency edge chain
      const happyPath =
        sortedEdges.length > 0
          ? sortedEdges.map((e) => `${e.source} → ${e.target} (${e.frequency})`).slice(0, 5)
          : ['(no edges discovered)'];

      // ── 6. Save lifecycle model ────────────────────────────────────────────
      const modelPath = path.join(resolvedDir, 'lifecycle-model.json');
      const model = {
        generated_at: new Date().toISOString(),
        receipts_processed: receiptFiles.length,
        events_processed: allEvents.length,
        dfg,
      };
      fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf-8');

      // ── 7. Shadow edge check (--assert-lifecycle) ──────────────────────────
      const shadowEdges: string[] = [];
      if (assertLifecycle) {
        for (const edge of edges) {
          const key = `${edge.source}->${edge.target}`;
          if (!DECLARED_LIFECYCLE_EDGES.has(key)) {
            shadowEdges.push(`  SHADOW: ${edge.source} → ${edge.target} (freq=${edge.frequency})`);
          }
        }
      }

      // ── 8. Output ──────────────────────────────────────────────────────────
      if (jsonOutput) {
        const out = {
          receipts_processed: receiptFiles.length,
          events_processed: allEvents.length,
          node_count: nodes.length,
          edge_count: edges.length,
          top_edges: top5,
          happy_path: happyPath,
          lifecycle_model: modelPath,
          shadow_edges: shadowEdges,
        };
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log('');
        console.log('Receipt Chain Process Mining');
        console.log('============================');
        console.log(`Receipts processed : ${receiptFiles.length}`);
        console.log(`OCEL events        : ${allEvents.length}`);
        console.log(`DFG nodes          : ${nodes.length}`);
        console.log(`DFG edges          : ${edges.length}`);
        console.log('');
        console.log('Top edges by frequency:');
        if (top5.length === 0) {
          console.log('  (none)');
        } else {
          for (const e of top5) {
            console.log(`  ${e.source} → ${e.target}  [freq=${e.frequency}]`);
          }
        }
        console.log('');
        console.log('Happy path (most frequent sequences):');
        for (const line of happyPath) {
          console.log(`  ${line}`);
        }
        console.log('');
        console.log(`Lifecycle model saved to: ${modelPath}`);

        if (assertLifecycle) {
          console.log('');
          if (shadowEdges.length === 0) {
            console.log('Lifecycle assertion PASSED — no shadow edges observed.');
          } else {
            console.log('Lifecycle assertion WARNINGS — shadow edges found:');
            for (const s of shadowEdges) {
              console.log(s);
            }
          }
        }
        console.log('');
      }

      return exitWithFlush(EXIT_CODES.success);
    });
  },
});
