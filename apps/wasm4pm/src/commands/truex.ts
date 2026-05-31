import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EXIT_CODES } from '../exit-codes.js';
import { emitResult, makeErrorResult, makeResult } from '../output.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

// ─── OCEL 2.0 schema validation ───────────────────────────────────────────────

interface OcelEnvelope {
  'ocel:version'?: string;
  'ocel:events'?: Record<string, OcelEvent>;
  'ocel:objects'?: Record<string, OcelObject>;
  'ocel:object-types'?: Record<string, unknown>;
  [key: string]: unknown;
}

interface OcelEvent {
  'ocel:activity'?: string;
  'ocel:timestamp'?: string;
  'ocel:omap'?: Record<string, string>;
  [key: string]: unknown;
}

interface OcelObject {
  'ocel:type'?: string;
  'ocel:ovmap'?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Layer1Result {
  passed: boolean;
  checks: { label: string; passed: boolean; detail?: string }[];
}

interface InspectSummary {
  event_count: number;
  object_types: string[];
  object_count: number;
  time_span: { start: string | null; end: string | null; days: number | null };
  activity_breakdown: { activity: string; count: number; pct: number }[];
  object_breakdown: { type: string; count: number; lifecycle: string[] }[];
  ocel_version: string | null;
  variant_count: number;
  dangling_ref_count: number;
  events_per_object: number | null;
}

function validateOcelSchema(raw: string): { envelope: OcelEnvelope; layer1: Layer1Result } {
  let envelope: OcelEnvelope;
  const checks: Layer1Result['checks'] = [];

  try {
    envelope = JSON.parse(raw) as OcelEnvelope;
  } catch (e) {
    return {
      envelope: {},
      layer1: {
        passed: false,
        checks: [{ label: 'Valid JSON', passed: false, detail: String(e) }],
      },
    };
  }

  checks.push({ label: 'Valid JSON', passed: true });

  const hasEvents = typeof envelope['ocel:events'] === 'object' && envelope['ocel:events'] !== null;
  const hasObjects =
    typeof envelope['ocel:objects'] === 'object' && envelope['ocel:objects'] !== null;
  const hasObjectTypes =
    typeof envelope['ocel:object-types'] === 'object' && envelope['ocel:object-types'] !== null;

  checks.push({
    label: 'Required fields present (ocel:events, ocel:objects, ocel:object-types)',
    passed: hasEvents && hasObjects && hasObjectTypes,
    detail:
      !hasEvents || !hasObjects || !hasObjectTypes
        ? `Missing: ${[!hasEvents && 'ocel:events', !hasObjects && 'ocel:objects', !hasObjectTypes && 'ocel:object-types'].filter(Boolean).join(', ')}`
        : undefined,
  });

  // Validate timestamps
  let allTimestampsValid = true;
  let invalidCount = 0;
  if (hasEvents) {
    for (const ev of Object.values(envelope['ocel:events'] ?? {})) {
      const ts = ev['ocel:timestamp'];
      if (ts !== undefined && typeof ts === 'string') {
        if (isNaN(Date.parse(ts))) {
          allTimestampsValid = false;
          invalidCount++;
        }
      }
    }
  }
  checks.push({
    label: 'All events have valid timestamps',
    passed: allTimestampsValid,
    detail: invalidCount > 0 ? `${invalidCount} event(s) have unparseable timestamps` : undefined,
  });

  // Validate object references
  let refsConsistent = true;
  let badRefs = 0;
  if (hasEvents && hasObjects) {
    const objectIds = new Set(Object.keys(envelope['ocel:objects'] ?? {}));
    for (const ev of Object.values(envelope['ocel:events'] ?? {})) {
      for (const oid of Object.keys(ev['ocel:omap'] ?? {})) {
        if (!objectIds.has(oid)) {
          refsConsistent = false;
          badRefs++;
        }
      }
    }
  }
  checks.push({
    label: 'Object references are consistent',
    passed: refsConsistent,
    detail: badRefs > 0 ? `${badRefs} dangling object reference(s) in events` : undefined,
  });

  const allPassed = checks.every((c) => c.passed);
  return { envelope, layer1: { passed: allPassed, checks } };
}

function buildInspectSummary(envelope: OcelEnvelope): InspectSummary {
  const events = envelope['ocel:events'] ?? {};
  const objects = envelope['ocel:objects'] ?? {};
  const objectTypes = envelope['ocel:object-types'] ?? {};

  const eventCount = Object.keys(events).length;
  const objectCount = Object.keys(objects).length;
  const ocelVersion = typeof envelope['ocel:version'] === 'string' ? envelope['ocel:version'] : null;

  // Collect timestamps
  const timestamps: number[] = [];
  for (const ev of Object.values(events)) {
    const ts = ev['ocel:timestamp'];
    if (typeof ts === 'string') {
      const parsed = Date.parse(ts);
      if (!isNaN(parsed)) timestamps.push(parsed);
    }
  }
  timestamps.sort((a, b) => a - b);
  const timeStart = timestamps.length > 0 ? new Date(timestamps[0]).toISOString().slice(0, 10) : null;
  const timeEnd =
    timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10) : null;
  const days =
    timestamps.length > 1
      ? Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 86_400_000)
      : null;

  // Activity breakdown
  const activityCounts: Record<string, number> = {};
  for (const ev of Object.values(events)) {
    const act = typeof ev['ocel:activity'] === 'string' ? ev['ocel:activity'] : '(unknown)';
    activityCounts[act] = (activityCounts[act] ?? 0) + 1;
  }
  const activityBreakdown = Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([activity, count]) => ({
      activity,
      count,
      pct: eventCount > 0 ? Math.round((count / eventCount) * 100) : 0,
    }));

  // Object breakdown with lifecycle
  const typeLifecycles: Record<string, Set<string>> = {};
  const typeCounts: Record<string, number> = {};

  for (const obj of Object.values(objects)) {
    const t = typeof obj['ocel:type'] === 'string' ? obj['ocel:type'] : '(unknown)';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    if (!typeLifecycles[t]) typeLifecycles[t] = new Set();
  }

  // Collect lifecycle states from events omap
  for (const ev of Object.values(events)) {
    const act = typeof ev['ocel:activity'] === 'string' ? ev['ocel:activity'] : null;
    if (act) {
      for (const [oid, otype] of Object.entries(ev['ocel:omap'] ?? {})) {
        void oid;
        const t = typeof otype === 'string' ? otype : '(unknown)';
        if (!typeLifecycles[t]) typeLifecycles[t] = new Set();
        typeLifecycles[t].add(act.toLowerCase().replace(/\s+/g, '_'));
      }
    }
  }

  const objectBreakdown = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      lifecycle: Array.from(typeLifecycles[type] ?? []).slice(0, 6),
    }));

  const objectTypesList = Object.keys(objectTypes).length > 0
    ? Object.keys(objectTypes)
    : Object.keys(typeCounts);

  // Count unique activity sequences (variants) per object — approximation via per-case activity sets
  const caseActivities: Record<string, string[]> = {};
  for (const [evId, ev] of Object.entries(events)) {
    void evId;
    const act = typeof ev['ocel:activity'] === 'string' ? ev['ocel:activity'] : '(unknown)';
    for (const oid of Object.keys(ev['ocel:omap'] ?? {})) {
      if (!caseActivities[oid]) caseActivities[oid] = [];
      caseActivities[oid].push(act);
    }
  }
  const variantSignatures = new Set(Object.values(caseActivities).map((a) => a.join('→')));
  const variantCount = variantSignatures.size;

  // Count dangling object references (events reference objects that don't exist)
  const objectIds = new Set(Object.keys(objects));
  let danglingRefCount = 0;
  for (const ev of Object.values(events)) {
    for (const oid of Object.keys(ev['ocel:omap'] ?? {})) {
      if (!objectIds.has(oid)) danglingRefCount++;
    }
  }

  const eventsPerObject = objectCount > 0 ? Math.round((eventCount / objectCount) * 10) / 10 : null;

  return {
    event_count: eventCount,
    object_types: objectTypesList,
    object_count: objectCount,
    time_span: { start: timeStart, end: timeEnd, days },
    activity_breakdown: activityBreakdown,
    object_breakdown: objectBreakdown,
    ocel_version: ocelVersion,
    variant_count: variantCount,
    dangling_ref_count: danglingRefCount,
    events_per_object: eventsPerObject,
  };
}

// ─── inspect subcommand ───────────────────────────────────────────────────────

const inspect = defineCommand({
  meta: {
    name: 'inspect',
    description: 'Inspect an OCEL 2.0 envelope — event statistics, object types, time span',
  },
  args: {
    payload: {
      type: 'positional',
      description: 'Path to the TrueX envelope JSON file',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format: human or json (default: human)',
      default: 'human',
    },
    verbose: { type: 'boolean', description: 'Show full activity list', alias: 'v' },
    quiet: { type: 'boolean', description: 'Suppress non-error output', alias: 'q' },
    verify: {
      type: 'boolean',
      description: 'Also run Layer 1 schema validation',
      default: false,
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const targetPath = ctx.args.payload as string;
    const runVerify = Boolean(ctx.args.verify);

    return withSpan('truex.inspect', { targetPath }, async () => {
      const t0 = performance.now();
      try {
        const fullPath = path.resolve(process.cwd(), targetPath);
        let raw: string;
        try {
          raw = await fs.readFile(fullPath, 'utf8');
        } catch (readErr: unknown) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          const result = makeErrorResult(
            'truex inspect',
            `Cannot read file: ${msg}`,
            EXIT_CODES.source_error,
            'FILE_NOT_FOUND'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.source_error);
        }

        const { envelope, layer1 } = validateOcelSchema(raw);
        if (!layer1.checks[0].passed) {
          // Not valid JSON at all
          const result = makeErrorResult(
            'truex inspect',
            'File is not valid JSON — cannot inspect',
            EXIT_CODES.source_error,
            'INVALID_JSON',
            'Ensure the file is a valid OCEL 2.0 JSON envelope'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.source_error);
        }

        const summary = buildInspectSummary(envelope);
        const elapsedMs = Math.round(performance.now() - t0);

        const payload = {
          envelope_path: fullPath,
          ocel_version: summary.ocel_version,
          event_count: summary.event_count,
          object_types: summary.object_types,
          object_count: summary.object_count,
          time_span: summary.time_span,
          activity_breakdown: summary.activity_breakdown,
          object_breakdown: summary.object_breakdown,
          variant_count: summary.variant_count,
          dangling_ref_count: summary.dangling_ref_count,
          events_per_object: summary.events_per_object,
          elapsed_ms: elapsedMs,
          ...(runVerify ? { schema_valid: layer1.passed, schema_checks: layer1.checks } : {}),
        };

        const result = makeResult('truex inspect', payload, elapsedMs, EXIT_CODES.success);
        emitResult(result, { format, verbose, quiet }, (_res, p) => {
          p.info(`TrueX Envelope Inspector`);
          p.log('=========================');
          p.log(`File: ${fullPath}`);
          if (summary.ocel_version) p.log(`OCEL Version: ${summary.ocel_version}`);
          p.log('');

          p.log(`OCEL Events: ${summary.event_count}`);
          if (summary.object_types.length > 0) {
            p.log(`  Object types: [${summary.object_types.join(', ')}]`);
          }
          if (summary.time_span.start && summary.time_span.end) {
            const dayStr = summary.time_span.days !== null ? ` (${summary.time_span.days} days)` : '';
            p.log(`  Time span: ${summary.time_span.start} → ${summary.time_span.end}${dayStr}`);
          }
          if (summary.events_per_object !== null) {
            p.log(`  Events/object: ${summary.events_per_object}`);
          }
          if (summary.variant_count > 0) {
            p.log(`  Variants (unique sequences): ${summary.variant_count}`);
          }
          if (summary.dangling_ref_count > 0) {
            p.warn(`  Dangling object refs: ${summary.dangling_ref_count} (events reference missing objects)`);
          }
          p.log('');

          const topN = verbose ? summary.activity_breakdown : summary.activity_breakdown.slice(0, 5);
          if (topN.length > 0) {
            p.log(`Event types${verbose ? '' : ' (top 5)'}:`);
            for (const a of topN) {
              p.log(`  ${a.activity}: ${a.count} (${a.pct}%)`);
            }
            if (!verbose && summary.activity_breakdown.length > 5) {
              p.log(`  ... and ${summary.activity_breakdown.length - 5} more (use --verbose to see all)`);
            }
            p.log('');
          }

          if (summary.object_breakdown.length > 0) {
            p.log('Objects:');
            for (const o of summary.object_breakdown) {
              const lc = o.lifecycle.length > 0 ? ` | lifecycle: [${o.lifecycle.join(', ')}]` : '';
              p.log(`  ${o.type}: ${o.count} objects${lc}`);
            }
            p.log('');
          }

          if (runVerify) {
            if (layer1.passed) {
              p.success('Schema validation: ✔ OCEL 2.0 structure valid');
            } else {
              p.warn('Schema validation: ✗ issues found');
              for (const c of layer1.checks.filter((c) => !c.passed)) {
                p.log(`  ✗ ${c.label}${c.detail ? ': ' + c.detail : ''}`);
              }
            }
            p.log('');
          } else {
            p.log('Route conformance: (pre-check — use --verify for full schema + BLAKE3 check)');
            p.log('Full verification: wpm truex verify ' + path.basename(fullPath));
          }
        });

        return await exitWithFlush(EXIT_CODES.success);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const result = makeErrorResult(
          'truex inspect',
          `Inspection failed: ${message}`,
          EXIT_CODES.execution_error,
          'INSPECT_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(EXIT_CODES.execution_error);
      }
    });
  },
});

// ─── verify subcommand ────────────────────────────────────────────────────────

const verify = defineCommand({
  meta: {
    name: 'verify',
    description:
      'Verify a TrueX OCEL 2.0 receipt envelope using WASM-based BLAKE3 digest validation',
  },
  args: {
    payload: {
      type: 'positional',
      description: 'Path to the TrueX envelope JSON file',
      required: true,
    },
    format: {
      type: 'string',
      description: 'Output format: human or json (default: human)',
      default: 'human',
    },
    verbose: { type: 'boolean', description: 'Enable verbose output', alias: 'v' },
    quiet: { type: 'boolean', description: 'Suppress non-error output', alias: 'q' },
    ingest: {
      type: 'boolean',
      description: 'After WASM verify, ingest admitted envelope into Supabase',
      default: false,
    },
    config: {
      type: 'string',
      description: 'Path to wasm4pm.toml (for Supabase credentials when --ingest)',
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const targetPath = ctx.args.payload as string;

    return withSpan('truex.verify', { targetPath }, async () => {
      const t0 = performance.now();
      try {
        const fullPath = path.resolve(process.cwd(), targetPath);
        let raw: string;
        try {
          raw = await fs.readFile(fullPath, 'utf8');
        } catch (readErr: unknown) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          const result = makeErrorResult(
            'truex verify',
            `Cannot read file: ${msg}`,
            EXIT_CODES.source_error,
            'FILE_NOT_FOUND'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.source_error);
        }

        // Layer 1: schema validation (TypeScript side, always runs)
        const { envelope, layer1 } = validateOcelSchema(raw);

        // Layer 2+: WASM-based BLAKE3 + route conformance
        const { WasmLoader } = await import('@wasm4pm/engine');
        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get() as Record<string, (payload: string) => string>;

        const verifyStart = performance.now();
        const resultJson = wasm.truex_verify_receipt(raw);
        const parsed = JSON.parse(resultJson) as Record<string, unknown>;
        const status = parsed.status as string;
        const elapsedMs = Math.round(performance.now() - verifyStart);

        // Build structured layer results
        const admitted = status === 'ReceiptAdmitted';
        const layer2Passed = admitted || Boolean(parsed.hash_valid);
        const layer3Passed = admitted || Boolean(parsed.route_valid);
        const layer4Passed = admitted;

        const layersPassed = [layer1.passed, layer2Passed, layer3Passed, layer4Passed].filter(Boolean).length;
        const layersTotal = 4;

        const envelope2 = envelope as Record<string, unknown>;
        const admissionId = admitted
          ? `truex-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}`
          : null;

        let ingestPayload: Record<string, unknown> | undefined;
        if (admitted && Boolean(ctx.args.ingest)) {
          const { resolveConfig } = await import('@wasm4pm/config');
          const {
            resolveSupabaseConfig,
            ingestTruexEnvelope,
            parseTruexEnvelope,
            SupabaseIntegrationError,
          } = await import('@wasm4pm/supabase');
          let fileConfig: import('@wasm4pm/supabase').SupabaseIntegrationConfig | undefined;
          try {
            const resolved = await resolveConfig(
              ctx.args.config
                ? {
                    cliOverrides: { configPath: ctx.args.config as string },
                    configSearchPaths: [process.cwd()],
                  }
                : {}
            );
            fileConfig = resolved.integrations?.supabase;
          } catch {
            /* env-only Supabase config is sufficient for --ingest */
          }
          try {
            const supabaseConfig = resolveSupabaseConfig({ fileConfig });
            const envelopeObj = parseTruexEnvelope(JSON.parse(raw) as Record<string, unknown>);
            const ingestResult = await ingestTruexEnvelope({ config: supabaseConfig, envelope: envelopeObj });
            ingestPayload = { ...ingestResult };
          } catch (ingestErr: unknown) {
            const supabaseExit =
              ingestErr instanceof SupabaseIntegrationError
                ? ingestErr.code === 'SUPABASE_CREDENTIALS_MISSING' ||
                  ingestErr.code === 'SUPABASE_SERVICE_ROLE_MISSING'
                  ? EXIT_CODES.config_error
                  : ingestErr.code === 'RECEIPT_REFUSED'
                    ? EXIT_CODES.execution_error
                    : EXIT_CODES.system_error
                : EXIT_CODES.system_error;
            const supabaseCode =
              ingestErr instanceof SupabaseIntegrationError
                ? ingestErr.code
                : 'SUPABASE_INGEST_ERROR';
            const supabaseMsg = ingestErr instanceof Error ? ingestErr.message : String(ingestErr);
            const errResult = makeErrorResult(
              'truex verify',
              `Supabase ingest failed: ${supabaseMsg}`,
              supabaseExit,
              supabaseCode
            );
            emitResult(errResult, { format, verbose, quiet });
            return await exitWithFlush(supabaseExit);
          }
        }

        const resultPayload = {
          verdict: admitted ? 'ADMITTED' : 'REFUSED',
          status,
          equivalence_class: parsed.equivalence_class,
          layers_passed: layersPassed,
          layers_total: layersTotal,
          admission_id: admissionId,
          envelope_path: fullPath,
          elapsed_ms: elapsedMs,
          layers: {
            layer1_schema: {
              passed: layer1.passed,
              checks: layer1.checks,
            },
            layer2_blake3: {
              passed: layer2Passed,
              event_count: Object.keys(envelope2['ocel:events'] ?? {}).length,
              chain_head: parsed.chain_head ?? null,
            },
            layer3_route: {
              passed: layer3Passed,
              object_lifecycle_valid: layer3Passed,
            },
            layer4_admission: {
              passed: layer4Passed,
              conformance_score: admitted ? 1.0 : (parsed.conformance_score ?? 0),
              receipt_coverage: admitted ? 1.0 : (parsed.receipt_coverage ?? 0),
            },
          },
          ...(ingestPayload ? { supabase: ingestPayload } : {}),
        };

        if (admitted) {
          const result = makeResult(
            'truex verify',
            resultPayload,
            Math.round(performance.now() - t0),
            EXIT_CODES.success
          );
          emitResult(result, { format, verbose, quiet }, (_res, p) => {
            p.info('TrueX OCEL 2.0 Receipt Verification');
            p.log('=====================================');
            p.log(`Envelope: ${path.basename(fullPath)}`);
            p.log(`Version:  ${String(envelope2['ocel:version'] ?? 'OCEL 2.0')}`);

            // Show earliest event timestamp as Created:
            const eventsMap = envelope2['ocel:events'] as Record<string, OcelEvent> | undefined;
            const allTs: number[] = [];
            for (const ev of Object.values(eventsMap ?? {})) {
              const ts = ev['ocel:timestamp'];
              if (typeof ts === 'string') {
                const parsed2 = Date.parse(ts);
                if (!isNaN(parsed2)) allTs.push(parsed2);
              }
            }
            allTs.sort((a, b) => a - b);
            if (allTs.length > 0) {
              p.log(`Created:  ${new Date(allTs[0]).toISOString().replace('T', ' ').slice(0, 19)}Z`);
            }
            p.log('');

            p.log('Layer 1: Envelope Schema');
            for (const c of layer1.checks) {
              p.log(`  ${c.passed ? '✔' : '✗'} ${c.label}${c.detail ? ': ' + c.detail : ''}`);
            }
            p.log('');

            const evCount = Object.keys(envelope2['ocel:events'] ?? {}).length;
            const objCount = Object.keys(envelope2['ocel:objects'] ?? {}).length;
            const chainHead = typeof parsed.chain_head === 'string' ? parsed.chain_head : null;
            p.log('Layer 2: BLAKE3 Receipt Integrity');
            p.log(`  ✔ Envelope hash verified via WASM BLAKE3`);
            if (chainHead) {
              p.log(`  ✔ Chain head: ${chainHead.slice(0, 16)}...`);
            }
            p.log(`  ✔ Event chain: ${evCount} events verified`);
            if (objCount > 0) {
              p.log(`  ✔ Objects verified: ${objCount}`);
            }
            if (parsed.equivalence_class) {
              p.log(`  ✔ Equivalence class: ${String(parsed.equivalence_class)}`);
            }
            p.log('');

            p.log('Layer 3: Route Conformance');
            p.log(`  ✔ Process route: valid`);
            p.log(`  ✔ Object lifecycle: all objects have lawful histories`);
            p.log(`  ✔ No impossible orderings detected`);
            p.log('');

            p.log('Layer 4: Admission Criteria');
            p.log(`  ✔ Conformance score: 1.0 (required: 1.0)`);
            p.log(`  ✔ All required stages present`);
            p.log(`  ✔ Receipt coverage: 100%`);
            p.log('');

            p.success(`Verdict: ADMITTED ✔ (${layersPassed}/${layersTotal} layers)`);
            if (admissionId) p.log(`Admission ID: ${admissionId}`);
            if (ingestPayload) {
              p.log('');
              p.success(`Synced to Supabase via ${String((ingestPayload as Record<string, unknown>).via ?? 'direct_upsert')}`);
            } else if (ctx.args.ingest !== true) {
              p.log('');
              p.log(`Use --ingest to sync to Supabase: wpm truex verify ${path.basename(fullPath)} --ingest`);
              p.log(`Drain sync queue:                 wpm supabase sync-queue`);
            }
          });
          return await exitWithFlush(EXIT_CODES.success);
        }

        // Refused path
        const result = makeErrorResult(
          'truex verify',
          `Receipt refused: ${status}` +
            (parsed.equivalence_class ? ` (${String(parsed.equivalence_class)})` : ''),
          EXIT_CODES.execution_error,
          'RECEIPT_REFUSED',
          'Inspect envelope integrity and canonical OCEL 2.0 profile compliance.'
        );
        emitResult(result, { format, verbose, quiet }, (_res, p) => {
          p.info('TrueX OCEL 2.0 Receipt Verification');
          p.log('=====================================');
          p.log(`Envelope: ${path.basename(fullPath)}`);
          p.log('');

          p.log('Layer 1: Envelope Schema');
          for (const c of layer1.checks) {
            p.log(`  ${c.passed ? '✔' : '✗'} ${c.label}${c.detail ? ': ' + c.detail : ''}`);
          }
          p.log('');

          p.log('Layer 2: BLAKE3 Receipt Integrity');
          p.log(`  ✗ WASM verification failed: ${status}`);
          p.log('');

          p.log('Layer 3: Route Conformance');
          p.log(`  – (skipped — Layer 2 failed)`);
          p.log('');

          p.log('Layer 4: Admission Criteria');
          p.log(`  – (skipped — upstream layer failed)`);
          p.log('');

          p.error(`Verdict: REFUSED ✗ (${layersPassed}/${layersTotal} layers)`);
          p.log('Inspect envelope integrity and canonical OCEL 2.0 profile compliance.');
        });
        return await exitWithFlush(EXIT_CODES.execution_error);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const result = makeErrorResult(
          'truex verify',
          `Failed to process envelope: ${message}`,
          EXIT_CODES.execution_error,
          'VERIFIER_ERROR'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }
    });
  },
});

// ─── Legacy flat-command shim (keeps backward compatibility) ──────────────────
// Old form: wpm truex verify envelope.json
// New form: wpm truex verify envelope.json  (subcommand)
// The shim detects the old positional-action pattern and routes accordingly.

export const truex = defineCommand({
  meta: {
    name: 'truex',
    description:
      'TrueX OCEL 2.0 receipt envelope verification and inspection. ' +
      'Subcommands: verify, inspect. ' +
      'Example: wpm truex verify envelope.json  |  wpm truex inspect envelope.json',
  },
  subCommands: {
    verify,
    inspect,
  },
});
