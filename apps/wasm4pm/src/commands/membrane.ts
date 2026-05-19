import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  emitResult,
  makeResult,
  makeErrorResult,
  EmitOptions,
  ConsoleProjection,
} from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { resolveConfig } from '@wasm4pm/config';
import { buildSarifOutput } from '../sarif.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

// ---------------------------------------------------------------------------
// Shared parse helper — WASM functions return either a JS string or an object
// ---------------------------------------------------------------------------

const parse = (r: unknown): unknown => (typeof r === 'string' ? JSON.parse(r) : r);

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const ENVELOPES_DIR = '.wasm4pm/envelopes';

const FEATURE_GUARD_MSG =
  'AutoMembrane requires the fog or browser deployment profile.\n' +
  'Rebuild with `npm run build:fog` or `npm run build:browser`.\n' +
  'Current profile does not include feature-miniml.';

const MEMBRANE_TOML_SECTION = `
# ---------------------------------------------------------------------------
# AutoMembrane — Vision 2030 pre-control membrane
# ---------------------------------------------------------------------------
[membrane]
enabled = true
custody_actions = ["approve", "release", "transfer"]

[membrane.thresholds]
actor_anomaly_escalate = 0.7
actor_anomaly_warn = 0.4
route_match_allow = 0.5
automl_escalate = 0.9
automl_warn = 0.7

[membrane.drift]
stable_threshold = 0.10
moderate_threshold = 0.25
high_threshold = 0.50
severe_threshold = 0.75

[membrane.envelopes]
persist = true
path = ".wasm4pm/envelopes"
`;

// ---------------------------------------------------------------------------
// Subcommand: verify  (was: benchmark — verb8 rename, keeps exit-non-zero on failure)
// ---------------------------------------------------------------------------

const membraneVerify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Run all built-in AutoMembrane benchmarks — exit non-zero if any fail (CI gate)',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format: human (default), json, or sarif',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    let passed = 0;
    let total = 0;

    return withSpan(
      'membrane.verify',
      { format: format ?? 'human', verbose, quiet },
      async () => {
        try {
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get() as Record<string, unknown>;

          if (typeof wasm.run_all_benchmarks !== 'function') {
            const result = makeErrorResult(
              'membrane verify',
              'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.',
              EXIT_CODES.execution_error,
              'FEATURE_GUARD'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          const raw = (wasm.run_all_benchmarks as () => unknown)();
          const benchResult = parse(raw) as {
            total: number;
            passed: number;
            failed: number;
            pass_rate: number;
            results: Array<{
              trace_id: string;
              name: string;
              pass: boolean;
              final_verdict: string;
              expected_verdict: string;
              failure_reason?: string;
            }>;
          };

          passed = benchResult.passed;
          total = benchResult.total;

          const exitCode = benchResult.failed > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success;

          // SARIF output — write custom SARIF then exit
          if (format === 'sarif') {
            const sarifResults = benchResult.results.map((r) => ({
              verdict: r.final_verdict,
              traceName: r.name,
              explanation: r.failure_reason,
              missingEvidence: [] as string[],
            }));
            process.stdout.write(
              JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n'
            );
            return await exitWithFlush(EXIT_CODES.success);
          }

          const result = makeResult(
            'membrane verify',
            benchResult as unknown as Record<string, unknown>,
            Date.now() - t0,
            exitCode
          );

          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const data = res.payload as typeof benchResult;
            p.log('');
            p.log('  AutoMembrane Verify — Benchmark Suite');
            p.log('  ═'.repeat(40));
            for (const r of data.results) {
              const status = r.pass ? 'PASS' : 'FAIL';
              const icon = r.pass ? '✓' : '✗';
              const name = r.name.padEnd(30);
              const verdict = r.final_verdict;
              p.log(`  ${name}  ${status}  ${icon} ${verdict}`);
              if (!r.pass && r.failure_reason) {
                p.log(`    Reason: ${r.failure_reason}`);
              }
            }
            p.log('');
            const pct = (data.pass_rate * 100).toFixed(0);
            const allPass = data.failed === 0;
            p.log(
              `  all_pass: ${allPass}   Passed: ${data.passed}/${data.total}   Pass rate: ${pct}%`
            );
            p.log('');
            if (!allPass) {
              p.log('  AndonPull: receipt integrity check failed.');
              p.log('  The execution proof chain has one or more failed benchmarks.');
              p.log('  This is a manufacturing defect — investigate before releasing.');
              p.log('');
              p.log('  Next steps:');
              p.log('    1. Run `wpm proof audit` to inspect the receipt chain');
              p.log('    2. Check failed benchmark names above for the specific layer');
              p.log('    3. Rebuild envelopes: `wpm membrane build <log.xes> --persist`');
              p.log('    4. Re-run: `wpm membrane verify`');
              p.log('');
            }
          });

          return await exitWithFlush(result.exit_code);
        } catch (error) {
          const result = makeErrorResult(
            'membrane verify',
            `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
            EXIT_CODES.execution_error
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      },
      () => ({ 'membrane.verify.passed': passed, 'membrane.verify.total': total })
    );
  },
});

// ---------------------------------------------------------------------------
// Subcommand: replay  (was: classify — verb8 rename; classifying = replaying motion)
// ---------------------------------------------------------------------------

const membraneReplayLog = defineCommand({
  meta: {
    name: 'replay',
    description: 'Replay motions from an XES event log through the AutoMembrane',
  },
  args: {
    log: {
      type: 'positional',
      description: 'Path to XES event log',
      required: true,
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
    },
    'actor-key': {
      type: 'string',
      description: 'Actor/resource attribute key (default: org:resource)',
    },
    'trace-index': {
      type: 'string',
      description: 'Zero-based trace index to classify (default: 0)',
    },
    trace: {
      type: 'boolean',
      description: 'Show per-layer verdict breakdown with reason text',
    },
    'explain-failure': {
      type: 'boolean',
      description: 'Show detailed explanation for non-Allow verdicts',
    },
    'custody-only': {
      type: 'boolean',
      description: 'Only show the custody layer result',
    },
    format: {
      type: 'string',
      description: 'Output format: human (default), json, or sarif',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    try {
      const logPath = ctx.args.log as string;
      try {
        await fs.access(logPath);
      } catch {
        const result = makeErrorResult(
          'membrane classify',
          `Input file not found: ${logPath}`,
          EXIT_CODES.source_error,
          'SOURCE_NOT_FOUND'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const actorKey = (ctx.args['actor-key'] as string) || 'org:resource';
      const traceIndex = parseInt((ctx.args['trace-index'] as string) || '0', 10);

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.classify_motion !== 'function') {
        const result = makeErrorResult(
          'membrane classify',
          'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.',
          EXIT_CODES.execution_error,
          'FEATURE_GUARD'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const xesContent = await fs.readFile(logPath, 'utf-8');
      const logHandle = (wasm.load_eventlog_from_xes as (s: string) => string)(xesContent);

      if (!logHandle) {
        const result = makeErrorResult(
          'membrane classify',
          'Failed to parse XES event log',
          EXIT_CODES.source_error,
          'PARSE_FAILED'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      let motionJson: string;
      let verdictReceipt: Record<string, unknown>;

      try {
        const motionRaw = (
          wasm.build_motion_from_log_trace as (
            h: string,
            i: number,
            a: string,
            r: string
          ) => unknown
        )(logHandle, traceIndex, activityKey, actorKey);

        motionJson = typeof motionRaw === 'string' ? motionRaw : JSON.stringify(motionRaw);

        const receiptRaw = (wasm.classify_motion as (j: string) => unknown)(motionJson);
        verdictReceipt = parse(receiptRaw) as Record<string, unknown>;
      } catch (classifyError) {
        (wasm.delete_object as (h: string) => void)(logHandle);
        throw classifyError;
      }
      (wasm.delete_object as (h: string) => void)(logHandle);

      // SARIF output — write custom SARIF then exit
      if (format === 'sarif') {
        const motion = parse(motionJson) as { actor: string; requested_action: string };
        const sarifResults = [
          {
            verdict: String(verdictReceipt.final_verdict),
            actor: motion.actor,
            action: motion.requested_action,
            explanation: String(verdictReceipt.explanation || ''),
            missingEvidence: [] as string[],
          },
        ];
        process.stdout.write(
          JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n'
        );
        return await exitWithFlush(EXIT_CODES.success);
      }

      const result = makeResult('membrane classify', verdictReceipt, Date.now() - t0);

      const showTrace = Boolean(ctx.args.trace);
      const explainFailure = Boolean(ctx.args['explain-failure']);
      const custodyOnly = Boolean(ctx.args['custody-only']);
      const capturedMotionJson = motionJson;

      emitResult(result, { format, verbose, quiet }, (res, p) => {
        const receipt = res.payload as typeof verdictReceipt;
        const motion = parse(capturedMotionJson) as {
          actor: string;
          requested_action: string;
          request_id: string;
        };

        const layerVerdicts = receipt.layer_verdicts as Array<{
          layer: string;
          verdict: string;
          confidence: number;
          reason?: string;
          missing_evidence: string[];
        }>;

        const layersToShow = custodyOnly
          ? layerVerdicts.filter((lv) => lv.layer === 'custody')
          : layerVerdicts;

        p.log('');
        p.log('  AutoMembrane Verdict');
        p.log('  ═'.repeat(22));
        p.log(`  Request:   ${motion.actor} → ${motion.requested_action}`);
        if (!custodyOnly) {
          p.log(`  Verdict:   ${String(receipt.final_verdict).toUpperCase()}`);
          p.log(`  Decisive:  ${receipt.decisive_layer}`);
        }
        p.log('');
        p.log('  Layer breakdown:');
        for (const lv of layersToShow) {
          const missing =
            lv.missing_evidence && lv.missing_evidence.length > 0
              ? `  Missing: ${lv.missing_evidence.join(', ')}`
              : '';
          p.log(
            `    ${lv.layer.padEnd(8)} ${lv.verdict.padEnd(20)} (${lv.confidence.toFixed(2)})${missing}`
          );
          if (
            (showTrace || custodyOnly) &&
            explainFailure &&
            lv.verdict !== 'allow' &&
            lv.verdict !== 'allow_with_receipt' &&
            lv.reason
          ) {
            p.log(`             reason: ${lv.reason}`);
          }
        }
        if (explainFailure && receipt.final_verdict !== 'allow' && !showTrace && !custodyOnly) {
          p.log('');
          p.log('  Explanation:');
          String(receipt.explanation || '')
            .split('\n')
            .forEach((l) => p.log('    ' + l));
        }
        p.log('');
        p.log(`  Replay:  ${receipt.request_id}  Model: ${receipt.model_version}`);
        p.log('');
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult(
        'membrane classify',
        `Classification failed: ${error instanceof Error ? error.message : String(error)}`,
        EXIT_CODES.execution_error
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
  },
});

// ---------------------------------------------------------------------------
// Subcommand: health
// ---------------------------------------------------------------------------

const membraneShow = defineCommand({
  meta: {
    name: 'show',
    description: 'Show current membrane state, envelope health, and installed handles',
  },
  args: {
    handles: {
      type: 'positional',
      description: 'Comma-separated envelope handle IDs (optional)',
      required: false,
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    const handlesArg = ctx.args.handles as string | undefined;

    if (!handlesArg || handlesArg.trim() === '') {
      const emptyPayload = {
        envelopes: [] as unknown[],
        message: 'Run wpm membrane classify or wpm ml automl-v2 to build envelopes.',
      };
      const result = makeResult('membrane show', emptyPayload, Date.now() - t0);
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.log('');
        p.log(
          '  No envelopes installed. Run `wpm membrane classify` or `wpm ml automl-v2` to build envelopes.'
        );
        p.log('');
      });
      return await exitWithFlush(result.exit_code);
    }

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.get_membrane_health !== 'function') {
        const result = makeErrorResult(
          'membrane show',
          'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.',
          EXIT_CODES.execution_error,
          'FEATURE_GUARD'
        );
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(result.exit_code);
      }

      const handles = handlesArg
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      const handlesJson = JSON.stringify(handles);

      const raw = (wasm.get_membrane_health as (j: string) => unknown)(handlesJson);
      const healthResult = parse(raw) as Record<string, unknown>;

      const result = makeResult('membrane show', healthResult, Date.now() - t0);
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.log('');
        p.log('  AutoMembrane Envelope Health');
        p.log('  ═'.repeat(30));
        p.log(JSON.stringify(healthResult, null, 2));
        p.log('');
      });

      return await exitWithFlush(result.exit_code);
    } catch (error) {
      const result = makeErrorResult(
        'membrane show',
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        EXIT_CODES.execution_error
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }
  },
});

// ---------------------------------------------------------------------------
// Subcommand: init
// ---------------------------------------------------------------------------

const membraneInit = defineCommand({
  meta: {
    name: 'init',
    description:
      'Append a [membrane] section to wasm4pm.toml (or create the file)\n\nExamples:\n  wpm membrane init\n  wpm membrane init --dry-run\n  wpm membrane init --force',
  },
  args: {
    'dry-run': { type: 'boolean', description: 'Show generated config without writing it' },
    force: { type: 'boolean', alias: 'F', description: 'Overwrite existing [membrane] section' },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    const dryRun = Boolean(ctx.args['dry-run']);
    const force = Boolean(ctx.args.force);
    const tomlPath = path.join(process.cwd(), 'wasm4pm.toml');

    let existing = '';
    try {
      existing = await fs.readFile(tomlPath, 'utf-8');
    } catch {
      /* file will be created */
    }

    if (existing.includes('[membrane]') && !force) {
      const result = makeResult(
        'membrane init',
        { file: tomlPath, action: 'skipped' },
        Date.now() - t0
      );
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.warn('[membrane] section already exists in wasm4pm.toml. Use --force to overwrite.');
      });
      return await exitWithFlush(result.exit_code);
    }

    if (dryRun) {
      const result = makeResult(
        'membrane init',
        { config: MEMBRANE_TOML_SECTION },
        Date.now() - t0
      );
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.log('\n  Dry-run — the following would be appended to wasm4pm.toml:\n');
        p.log(MEMBRANE_TOML_SECTION);
        p.log('  Run without --dry-run to apply.\n');
      });
      return await exitWithFlush(result.exit_code);
    }

    let base = existing;
    if (force && existing.includes('[membrane]')) {
      base = existing.replace(/\[membrane\][\s\S]*?(?=\n\[(?!membrane\])|\s*$)/, '');
    }
    const newContent = base.trimEnd() + '\n' + MEMBRANE_TOML_SECTION;
    await fs.writeFile(tomlPath, newContent, 'utf-8');

    const action = existing ? 'appended' : 'created';
    const result = makeResult('membrane init', { file: tomlPath, action }, Date.now() - t0);
    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      p.success(`Membrane config initialized in wasm4pm.toml`);
      p.log('\n  Next steps:');
      p.log('    1. Review [membrane] settings in wasm4pm.toml');
      p.log('    2. Run `wpm membrane build <log.xes>` to build envelopes');
      p.log('    3. Run `wpm membrane health` to verify envelope status\n');
    });
    return await exitWithFlush(result.exit_code);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: build
// ---------------------------------------------------------------------------

const membraneBuild = defineCommand({
  meta: {
    name: 'build',
    description:
      'Build all AutoMembrane envelope layers from an XES event log\n\nExamples:\n  wpm membrane build log.xes\n  wpm membrane build log.xes --persist\n  wpm membrane build log.xes --actor-key org:resource --coverage-threshold 0.9',
  },
  args: {
    log: { type: 'positional', description: 'Path to XES event log', required: true },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
    },
    'actor-key': {
      type: 'string',
      description: 'Actor attribute key (default: org:resource)',
    },
    'timestamp-key': {
      type: 'string',
      description: 'Timestamp attribute key (default: time:timestamp)',
    },
    'coverage-threshold': {
      type: 'string',
      description: 'Route coverage threshold 0-1 (default: 0.8)',
    },
    persist: {
      type: 'boolean',
      description: 'Write envelope handles to .wasm4pm/envelopes/',
    },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();
    const logPath = ctx.args.log as string;

    try {
      await fs.access(logPath);
    } catch {
      const result = makeErrorResult(
        'membrane build',
        `Input file not found: ${logPath}\nProvide a valid path to an XES event log.`,
        EXIT_CODES.source_error,
        'SOURCE_NOT_FOUND'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
    const actorKey = (ctx.args['actor-key'] as string) || 'org:resource';
    const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
    const coverageThreshold = parseFloat((ctx.args['coverage-threshold'] as string) || '1.0');

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, unknown>;

    if (typeof wasm.build_actor_envelope !== 'function') {
      const result = makeErrorResult(
        'membrane build',
        FEATURE_GUARD_MSG,
        EXIT_CODES.execution_error,
        'FEATURE_GUARD'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    const xesContent = await fs.readFile(logPath, 'utf-8');
    if (format === 'human') {
      const p = new ConsoleProjection({ verbose, quiet });
      p.log('\n  Building AutoMembrane envelopes...');
    }

    const logHandle = (wasm.load_eventlog_from_xes as (s: string) => string)(xesContent);
    if (!logHandle) {
      const result = makeErrorResult(
        'membrane build',
        'Failed to parse XES event log.',
        EXIT_CODES.source_error,
        'PARSE_FAILED'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    const handles: Record<string, string> = {};
    const errors: Record<string, string> = {};

    const tryBuild = async (name: string, fn: () => unknown) => {
      try {
        const raw = fn();
        handles[name] = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (format === 'human') {
          const p = new ConsoleProjection({ verbose, quiet });
          p.log(`  Building ${name} envelope... ✓`);
        }
      } catch (e) {
        errors[name] = e instanceof Error ? e.message : String(e);
        if (format === 'human') {
          const p = new ConsoleProjection({ verbose, quiet });
          p.log(`  Building ${name} envelope... ✗  ${errors[name]}`);
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('actor', () =>
      (wasm.build_actor_envelope as any)(logHandle, activityKey, actorKey, timestampKey)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('object', () => (wasm.build_object_envelope as any)(logHandle, activityKey));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('route', () =>
      (wasm.build_route_envelope as any)(logHandle, activityKey, coverageThreshold)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('automl', () => (wasm.build_automl_envelope as any)(logHandle, activityKey));

    if (typeof wasm.delete_object === 'function') {
      (wasm.delete_object as (h: string) => void)(logHandle);
    }

    if (ctx.args.persist && Object.keys(handles).length > 0) {
      const dir = path.resolve(process.cwd(), ENVELOPES_DIR);
      await fs.mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(
        path.join(dir, `${ts}-envelopes.json`),
        JSON.stringify(
          {
            built_at: new Date().toISOString(),
            log: logPath,
            handles,
            errors,
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    const exitCode =
      Object.keys(handles).length === 0
        ? EXIT_CODES.execution_error
        : Object.keys(errors).length > 0
          ? EXIT_CODES.partial_failure
          : EXIT_CODES.success;

    const payload = { handles, errors };
    const result = makeResult('membrane build', payload, Date.now() - t0, exitCode);

    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      p.log('\n  Envelope handles:');
      for (const [layer, handle] of Object.entries(handles)) {
        p.log(`    ${layer.padEnd(8)} ${handle}`);
      }
      if (Object.keys(errors).length) {
        p.log('\n  Build errors:');
        for (const [l, m] of Object.entries(errors)) {
          p.log(`    ${l.padEnd(8)} ${m}`);
        }
      }
      const handleList = Object.values(handles).join(' ');
      if (handleList) p.log(`\n  Next: wpm membrane health ${handleList}\n`);
    });

    return await exitWithFlush(result.exit_code);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: inspect
// ---------------------------------------------------------------------------

const membraneInspect = defineCommand({
  meta: {
    name: 'inspect',
    description:
      'Show details for a specific envelope handle\n\nExamples:\n  wpm membrane inspect obj_0\n  wpm membrane inspect obj_1 --format json',
  },
  args: {
    handle: {
      type: 'positional',
      description: 'Envelope handle string (e.g., obj_0)',
      required: true,
    },
    'object-type': {
      type: 'string',
      description: 'Object type filter for object envelope transition map',
    },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();
    const handle = ctx.args.handle as string;
    const objectType = (ctx.args['object-type'] as string) || '';

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, unknown>;

    if (typeof wasm.get_actor_profiles !== 'function') {
      const result = makeErrorResult(
        'membrane inspect',
        FEATURE_GUARD_MSG,
        EXIT_CODES.execution_error,
        'FEATURE_GUARD'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    let inspectResult: unknown = null;
    let envelopeType = '';

    const tryFn = (fnName: string, args: unknown[], typeName: string): boolean => {
      if (typeof wasm[fnName] !== 'function') return false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inspectResult = parse((wasm[fnName] as any)(...args));
        envelopeType = typeName;
        return true;
      } catch {
        return false;
      }
    };

    const found =
      tryFn('get_actor_profiles', [handle], 'actor') ||
      tryFn('get_route_variants', [handle], 'route') ||
      tryFn('inspect_automl_envelope', [handle], 'automl') ||
      tryFn('get_transition_map', [handle, objectType], 'object') ||
      tryFn('get_time_envelope_stats', [handle], 'time');

    if (!found) {
      const result = makeErrorResult(
        'membrane inspect',
        `No envelope found for handle: ${handle}\nRun \`wpm membrane build <log.xes>\` first to create envelopes.`,
        EXIT_CODES.source_error,
        'ENVELOPE_NOT_FOUND'
      );
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(result.exit_code);
    }

    const payload = {
      handle,
      type: envelopeType,
      data: inspectResult as Record<string, unknown>,
    };
    const result = makeResult('membrane inspect', payload, Date.now() - t0);

    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      p.log(`\n  AutoMembrane Envelope — ${envelopeType}`);
      p.log('  ═'.repeat(30));
      p.log(`  Handle: ${handle}  Type: ${envelopeType}\n`);
      p.log(
        JSON.stringify(inspectResult, null, 2)
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      );
      p.log('');
    });

    return await exitWithFlush(result.exit_code);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: replay
// ---------------------------------------------------------------------------

const membraneReplay = defineCommand({
  meta: {
    name: 'replay',
    description:
      'Replay a RequestMotion JSON file through the AutoMembrane classifier\n\nExamples:\n  wpm membrane replay motion.json\n  wpm membrane replay motion.json --trace\n  wpm membrane replay motion.json --custody-only\n  wpm membrane replay motion.json --explain-failure\n  wpm membrane replay motion.json --dry-run\n\nmotion.json format:\n  {\n    "request_id": "req-001", "actor": "user@example.com",\n    "role": "analyst", "object_ids": ["ORDER-123"],\n    "requested_action": "approve",\n    "claimed_evidence": ["AUTH-TOKEN-XYZ"],\n    "timestamp_ms": 1714940400000\n  }',
  },
  args: {
    motion: {
      type: 'positional',
      description: 'Path to motion.json with a RequestMotion object',
      required: true,
    },
    trace: { type: 'boolean', description: 'Show per-layer verdict breakdown' },
    'explain-failure': {
      type: 'boolean',
      description: 'Show detailed reason for non-Allow verdicts',
    },
    'custody-only': {
      type: 'boolean',
      description: 'Only show the custody layer result',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Show parsed motion without classifying',
    },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();
    const motionPath = ctx.args.motion as string;

    let finalVerdict = 'unknown';
    let decisiveLayer = 'unknown';

    return withSpan(
      'membrane.trace',
      { format: format ?? 'human', motion_path: motionPath },
      async () => {
        let motionText: string;
        try {
          motionText = await fs.readFile(motionPath, 'utf-8');
        } catch {
          const result = makeErrorResult(
            'membrane replay',
            `Motion file not found: ${motionPath}\nCreate a motion.json — see \`wpm membrane replay --help\`.`,
            EXIT_CODES.source_error,
            'SOURCE_NOT_FOUND'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        let motionObj: Record<string, unknown>;
        try {
          motionObj = JSON.parse(motionText);
        } catch {
          const result = makeErrorResult(
            'membrane replay',
            `Invalid JSON in ${motionPath}. Expected a RequestMotion JSON object.`,
            EXIT_CODES.source_error,
            'INVALID_JSON'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        if (Boolean(ctx.args['dry-run'])) {
          const result = makeResult('membrane replay', { motion: motionObj }, Date.now() - t0);
          emitResult(result, { format, verbose, quiet }, (_res, p) => {
            p.log('\n  Dry-run — motion parsed successfully (no classification):\n');
            p.log(
              JSON.stringify(motionObj, null, 2)
                .split('\n')
                .map((l) => '  ' + l)
                .join('\n')
            );
            p.log('\n  Remove --dry-run to classify.\n');
          });
          return await exitWithFlush(result.exit_code);
        }

        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get() as Record<string, unknown>;

        if (typeof wasm.classify_motion !== 'function') {
          const result = makeErrorResult(
            'membrane replay',
            FEATURE_GUARD_MSG,
            EXIT_CODES.execution_error,
            'FEATURE_GUARD'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }

        const raw = (wasm.classify_motion as (j: string) => unknown)(motionText);
        const receipt = parse(raw) as {
          final_verdict: string;
          decisive_layer: string;
          downstream_admitted: boolean;
          explanation: string;
          layer_verdicts: Array<{
            layer: string;
            verdict: string;
            confidence: number;
            reason: string;
            missing_evidence: string[];
          }>;
          request_id: string;
          model_version: string;
        };

        finalVerdict = receipt.final_verdict;
        decisiveLayer = receipt.decisive_layer;

        const showTrace = Boolean(ctx.args.trace);
        const explainFailure = Boolean(ctx.args['explain-failure']);
        const custodyOnly = Boolean(ctx.args['custody-only']);

        const layersToShow = custodyOnly
          ? receipt.layer_verdicts.filter((lv) => lv.layer === 'custody')
          : receipt.layer_verdicts;

        const payload = { ...receipt, layer_verdicts: layersToShow } as Record<string, unknown>;
        const result = makeResult('membrane replay', payload, Date.now() - t0);

        emitResult(result, { format, verbose, quiet }, (_res, p) => {
          p.log('\n  AutoMembrane Replay');
          p.log('  ═'.repeat(22));
          p.log(`  Actor:   ${motionObj.actor || '(unknown)'}`);
          p.log(`  Action:  ${motionObj.requested_action || '(unknown)'}`);
          if (!custodyOnly) {
            p.log(`  Verdict: ${receipt.final_verdict.toUpperCase()}`);
            p.log(`  Decisive layer: ${receipt.decisive_layer}`);
            p.log(`  Admitted: ${receipt.downstream_admitted ? 'yes' : 'no'}`);
          }
          if (showTrace || custodyOnly) {
            p.log('\n  Layer verdicts:');
            for (const lv of layersToShow) {
              const miss =
                lv.missing_evidence.length > 0
                  ? `  missing: ${lv.missing_evidence.join(', ')}`
                  : '';
              p.log(
                `    ${lv.layer.padEnd(8)} ${lv.verdict.padEnd(22)} (${lv.confidence.toFixed(2)})${miss}`
              );
              if (explainFailure && lv.verdict !== 'allow' && lv.verdict !== 'allow_with_receipt') {
                p.log(`             reason: ${lv.reason}`);
              }
            }
          }
          if (explainFailure && receipt.final_verdict !== 'allow' && !showTrace) {
            p.log('\n  Explanation:');
            String(receipt.explanation)
              .split('\n')
              .forEach((l) => p.log('    ' + l));
          }
          p.log(`\n  Model: ${receipt.model_version}   Request: ${receipt.request_id}\n`);
        });

        return await exitWithFlush(result.exit_code);
      },
      () => ({
        'membrane.trace.verdict': finalVerdict,
        'membrane.trace.decisive_layer': decisiveLayer,
      })
    );
  },
});

// ---------------------------------------------------------------------------
// Subcommand: list
// ---------------------------------------------------------------------------

const membraneList = defineCommand({
  meta: {
    name: 'list',
    description:
      'List envelopes persisted to .wasm4pm/envelopes/\n\nExamples:\n  wpm membrane list\n  wpm membrane list --format json\n  wpm membrane list --verbose',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();
    const dir = path.resolve(process.cwd(), ENVELOPES_DIR);

    type EnvelopeManifest = {
      built_at: string;
      log: string;
      handles: Record<string, string>;
      errors: Record<string, string>;
    };
    type Entry = {
      name: string;
      filepath: string;
      mtime: Date;
      size: number;
      manifest: EnvelopeManifest | null;
    };

    let entries: Entry[] = [];

    try {
      const dirEntries = await fs.readdir(dir, { withFileTypes: true });
      entries = await Promise.all(
        dirEntries
          .filter((e) => e.isFile() && e.name.endsWith('.json'))
          .map(async (e) => {
            const filepath = path.join(dir, e.name);
            const stat = await fs.stat(filepath);
            try {
              const manifest = JSON.parse(await fs.readFile(filepath, 'utf-8')) as EnvelopeManifest;
              return { name: e.name, filepath, mtime: stat.mtime, size: stat.size, manifest };
            } catch {
              return { name: e.name, filepath, mtime: stat.mtime, size: stat.size, manifest: null };
            }
          })
      );
      entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch {
      /* directory does not exist — entries stays empty */
    }

    if (entries.length === 0) {
      const result = makeResult(
        'membrane list',
        { directory: dir, envelopes: [] as unknown[] },
        Date.now() - t0
      );
      emitResult(result, { format, verbose, quiet }, (_res, p) => {
        p.log('\n  No persisted envelopes found.');
        p.log(`  Directory: ${dir}`);
        p.log('\n  To persist: wpm membrane build <log.xes> --persist\n');
      });
      return await exitWithFlush(result.exit_code);
    }

    const envelopesMapped = entries.map((e) => ({
      name: e.name,
      created_at: e.mtime.toISOString(),
      log: e.manifest?.log,
      handles: e.manifest?.handles ?? {},
    }));

    const result = makeResult(
      'membrane list',
      { directory: dir, count: entries.length, envelopes: envelopesMapped },
      Date.now() - t0
    );

    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      p.log(
        `\n  AutoMembrane Envelopes (${entries.length} manifest${entries.length !== 1 ? 's' : ''})`
      );
      p.log(`  Directory: ${dir}\n`);
      p.log(`  #   Created at            Log                       Layers`);
      p.log(`  ──  ────────────────────  ────────────────────────  ─────────────────`);
      entries.forEach((e, i) => {
        const createdAt = e.mtime.toISOString().slice(0, 19).replace('T', ' ');
        const logShort = e.manifest?.log
          ? path.basename(e.manifest.log).substring(0, 24).padEnd(24)
          : '(unknown)               ';
        const layers = e.manifest?.handles
          ? Object.keys(e.manifest.handles).join(', ')
          : '(unreadable)';
        p.log(`  ${String(i + 1).padStart(3)}  ${createdAt}  ${logShort}  ${layers}`);
        if (verbose && e.manifest?.handles) {
          for (const [layer, handle] of Object.entries(e.manifest.handles)) {
            p.log(`         ${layer.padEnd(8)} handle: ${handle}`);
          }
        }
      });
      p.log('\n  Tip: wpm membrane inspect <handle>   Inspect a specific envelope');
      p.log('  Tip: wpm membrane health <handles>   Check health of envelopes\n');
    });

    return await exitWithFlush(result.exit_code);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: doctor
// ---------------------------------------------------------------------------

const membraneDoctor = defineCommand({
  meta: {
    name: 'doctor',
    description:
      'Run AutoMembrane definition-of-done checks (8 gates)\n\nExamples:\n  wpm membrane doctor\n  wpm membrane doctor --format json\n  wpm membrane doctor --verbose',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    type Check = { name: string; pass: boolean; detail: string; fix?: string };
    const checks: Check[] = [];

    // Load WASM once — failures are handled per-check
    let wasm: Record<string, unknown> | null = null;
    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      wasm = loader.get() as Record<string, unknown>;
    } catch {
      /* wasm load failed — checks will handle individually */
    }

    // Check 1: feature-miniml WASM module loaded (classify_motion export)
    checks.push({
      name: 'feature-miniml WASM module loaded',
      pass: typeof wasm?.classify_motion === 'function',
      detail:
        typeof wasm?.classify_motion === 'function'
          ? 'classify_motion export found'
          : 'classify_motion not found in loaded WASM',
      fix: 'Rebuild with `npm run build:fog` or `npm run build:browser`',
    });

    // Check 2: At least 1 envelope persisted
    const envelopesDir = path.resolve(process.cwd(), ENVELOPES_DIR);
    let envelopeCount = 0;
    try {
      const files = await fs.readdir(envelopesDir);
      envelopeCount = files.filter((f) => f.endsWith('.json')).length;
    } catch {
      /* directory does not exist */
    }
    checks.push({
      name: 'At least 1 envelope persisted',
      pass: envelopeCount > 0,
      detail:
        envelopeCount > 0
          ? `${envelopeCount} envelope manifest(s) in ${ENVELOPES_DIR}`
          : `No envelopes in ${ENVELOPES_DIR}`,
      fix: 'Run `wpm membrane build <log.xes> --persist`',
    });

    // Check 3: All built-in benchmarks pass
    let benchPass = false;
    let benchDetail = 'Could not run benchmarks (feature-miniml not loaded)';
    if (typeof wasm?.run_all_benchmarks === 'function') {
      try {
        const raw = (wasm.run_all_benchmarks as () => unknown)();
        const result = parse(raw) as { pass_rate: number; passed: number; total: number };
        benchPass = result.pass_rate >= 1.0;
        benchDetail = `${result.passed}/${result.total} benchmarks pass (${(result.pass_rate * 100).toFixed(0)}%)`;
      } catch (e) {
        benchDetail = `Benchmark error: ${e}`;
      }
    }
    checks.push({
      name: 'All built-in benchmarks pass',
      pass: benchPass,
      detail: benchDetail,
      fix: 'Review benchmark failures with `wpm membrane benchmark`',
    });

    // Checks 4 & 5: read membrane config via resolveConfig() so that ENV vars
    // (WASM4PM_MEMBRANE_ENABLED, WASM4PM_MEMBRANE_CUSTODY_ACTIONS) are honoured
    // in addition to wasm4pm.toml.  Fall back to TOML-only regex if resolveConfig fails.
    let membraneEnabled = false;
    let configDetail = 'Could not read membrane config';
    let custodyOk = false;
    let custodyDetail = 'custody_actions not configured (empty or missing)';
    try {
      const cfg = await resolveConfig();
      const memCfg = (
        cfg as unknown as { membrane?: { enabled?: boolean; custody_actions?: string[] } }
      ).membrane;
      membraneEnabled = memCfg?.enabled === true;
      const provSource = cfg.metadata.provenance['membrane.enabled']?.source ?? 'default';
      configDetail = membraneEnabled
        ? `membrane.enabled = true (source: ${provSource})`
        : `membrane.enabled is false or unset (source: ${provSource})`;
      const actions = memCfg?.custody_actions ?? [];
      custodyOk = actions.length > 0;
      custodyDetail = custodyOk
        ? `custody_actions = [${actions.join(', ')}]`
        : 'custody_actions not configured (empty or missing)';
    } catch {
      // resolveConfig failed (e.g. invalid config) — fall back to TOML regex
      try {
        const tomlContent = await fs
          .readFile(path.join(process.cwd(), 'wasm4pm.toml'), 'utf-8')
          .catch(() => '');
        membraneEnabled =
          tomlContent.includes('[membrane]') && /enabled\s*=\s*true/.test(tomlContent);
        configDetail = membraneEnabled
          ? 'membrane.enabled = true in wasm4pm.toml (regex fallback)'
          : '[membrane] section missing or enabled = false (regex fallback)';
        custodyOk = /custody_actions\s*=\s*\[.+\]/.test(tomlContent);
        custodyDetail = custodyOk
          ? 'custody_actions found in wasm4pm.toml (regex fallback)'
          : 'custody_actions not configured (empty or missing)';
      } catch {
        /* file unreadable */
      }
    }
    checks.push({
      name: 'membrane.enabled = true in config',
      pass: membraneEnabled,
      detail: configDetail,
      fix: 'Run `wpm membrane init` then set enabled = true, or set WASM4PM_MEMBRANE_ENABLED=true',
    });

    // Check 5: custody_actions non-empty in config (resolved above alongside check 4)
    checks.push({
      name: 'custody_actions configured',
      pass: custodyOk,
      detail: custodyDetail,
      fix: 'Add `custody_actions = ["approve", "release", "transfer"]` to [membrane] section, or set WASM4PM_MEMBRANE_CUSTODY_ACTIONS=approve,release,transfer',
    });

    // Check 6: Membrane health check passes
    let healthOk = false;
    let healthDetail = 'Could not check health (feature-miniml not loaded or no envelopes)';
    if (typeof wasm?.get_membrane_health === 'function') {
      try {
        const raw = (wasm.get_membrane_health as (j: string) => unknown)(JSON.stringify([]));
        const health = parse(raw) as { overall_status?: string };
        const status = health.overall_status ?? 'unknown';
        healthOk = status === 'healthy' || status === 'no_envelopes' || status === 'ok';
        healthDetail = `Membrane health: ${status}`;
      } catch (e) {
        healthDetail = `Health check error: ${e}`;
      }
    }
    checks.push({
      name: 'Membrane health check passes',
      pass: healthOk,
      detail: healthDetail,
      fix: 'Run `wpm membrane build <log.xes>` to create envelopes',
    });

    // Check 7: Envelope freshness (oldest envelope <= 30 days)
    let fresh = true;
    let freshDetail = 'No envelopes to check';
    if (envelopeCount > 0) {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      try {
        const files = await fs.readdir(envelopesDir);
        const jsonFiles = files.filter((f) => f.endsWith('.json'));
        const stats = await Promise.all(jsonFiles.map((f) => fs.stat(path.join(envelopesDir, f))));
        const oldest = Math.min(...stats.map((s) => s.mtimeMs));
        fresh = oldest >= thirtyDaysAgo;
        const days = Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000));
        freshDetail = `Oldest envelope: ${days} day(s) old`;
      } catch {
        freshDetail = 'Could not read envelope timestamps';
        fresh = false;
      }
    }
    checks.push({
      name: 'Envelopes are fresh (<= 30 days)',
      pass: envelopeCount === 0 ? true : fresh,
      detail: freshDetail,
      fix: 'Rebuild envelopes with `wpm membrane build <log.xes> --persist`',
    });

    // Check 8: AutoML model score >= 0.75
    let automlOk = false;
    let automlDetail = 'No AutoML envelope to inspect';
    if (typeof wasm?.inspect_automl_envelope === 'function' && envelopeCount > 0) {
      try {
        const files = (await fs.readdir(envelopesDir))
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length > 0) {
          const manifest = JSON.parse(
            await fs.readFile(path.join(envelopesDir, files[0]), 'utf-8')
          ) as { handles?: Record<string, string> };
          const automlHandle = manifest.handles?.automl;
          if (automlHandle) {
            const raw = (wasm.inspect_automl_envelope as (h: string) => unknown)(automlHandle);
            const envelope = parse(raw) as { best_score?: number; model_score?: number };
            const score = envelope.best_score ?? envelope.model_score ?? 0;
            automlOk = score >= 0.75;
            automlDetail = `AutoML model score: ${score.toFixed(3)}`;
          } else {
            automlDetail = 'No automl handle found in latest envelope manifest';
          }
        }
      } catch (e) {
        automlDetail = `Could not inspect AutoML envelope: ${e}`;
      }
    }
    checks.push({
      name: 'AutoML model score >= 0.75',
      pass: automlOk,
      detail: automlDetail,
      fix: 'Rebuild AutoML envelope from a larger log with more diverse traces',
    });

    const allPass = checks.every((c) => c.pass);
    const exitCode = allPass ? EXIT_CODES.success : EXIT_CODES.config_error;

    const payload = {
      all_pass: allPass,
      checks: checks.map((c) => ({
        name: c.name,
        pass: c.pass,
        detail: c.detail,
        fix: c.pass ? undefined : c.fix,
      })),
    };
    const result = makeResult('membrane doctor', payload, Date.now() - t0, exitCode);

    emitResult(result, { format, verbose, quiet }, (_res, p) => {
      p.log('\n  AutoMembrane Doctor — Definition of Done');
      p.log('  ' + '='.repeat(43));
      checks.forEach((c, i) => {
        const icon = c.pass ? 'v' : 'x';
        p.log(`  ${icon}  ${String(i + 1).padStart(2)}.  ${c.name}`);
        if (verbose || !c.pass) {
          p.log(`         ${c.detail}`);
        }
        if (!c.pass && c.fix) {
          p.log(`         Fix: ${c.fix}`);
        }
      });
      p.log('');
      if (allPass) {
        p.log('  All 8 checks pass — AutoMembrane is production-ready.\n');
      } else {
        p.log(
          `  ${checks.filter((c) => !c.pass).length} check(s) failed. Fix issues above and re-run.\n`
        );
      }
    });

    return await exitWithFlush(result.exit_code);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: check  (fast preflight — no WASM call needed)
// ---------------------------------------------------------------------------

const membraneCheck = defineCommand({
  meta: {
    name: 'check',
    description: 'Fast preflight: verify feature profile, config, and envelope presence',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default) or json' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const format = (ctx.args.format as EmitOptions['format']) || 'human';
    const quiet = Boolean(ctx.args.quiet);
    const t0 = Date.now();

    let allPass = false;
    let checkCount = 0;

    return withSpan(
      'membrane.check',
      { format: format ?? 'human', quiet },
      async () => {
        const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

        // Check 1: WASM membrane exports available
        try {
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get() as Record<string, unknown>;
          const hasMemb = typeof wasm.classify_motion === 'function';
          checks.push({
            name: 'feature-miniml loaded',
            pass: hasMemb,
            detail: hasMemb
              ? 'classify_motion export present'
              : 'rebuild with npm run build:fog or build:browser',
          });
        } catch (e) {
          checks.push({ name: 'feature-miniml loaded', pass: false, detail: String(e) });
        }

        // Check 2: envelopes directory has ≥1 manifest
        try {
          const { readdir } = await import('fs/promises');
          const files = await readdir(ENVELOPES_DIR).catch(() => [] as string[]);
          const manifests = files.filter((f) => f.endsWith('.json'));
          checks.push({
            name: 'envelopes present',
            pass: manifests.length > 0,
            detail:
              manifests.length > 0
                ? `${manifests.length} envelope manifest(s) found`
                : 'run wpm membrane build <log.xes> to create envelopes',
          });
        } catch {
          checks.push({
            name: 'envelopes present',
            pass: false,
            detail: 'cannot read envelopes dir',
          });
        }

        allPass = checks.every((c) => c.pass);
        checkCount = checks.length;
        const passed = checks.filter((c) => c.pass).length;
        const failed = checks.filter((c) => !c.pass).length;
        const exitCode = allPass ? EXIT_CODES.success : EXIT_CODES.execution_error;

        const result = makeResult(
          'membrane check',
          { checks, all_pass: allPass },
          Date.now() - t0,
          exitCode
        );

        emitResult(result, { format, quiet }, (_res, p) => {
          p.log('');
          for (const c of checks) {
            const icon = c.pass ? '✓' : '✗';
            const line = `  ${icon} ${c.name.padEnd(28)} ${c.detail}`;
            if (c.pass) p.info(line);
            else p.warn(line);
          }
          p.log('');
          p.log(`  all_pass: ${allPass}   Passed: ${passed}/${checkCount}   Failed: ${failed}`);
          if (allPass) {
            p.success(
              '  Membrane preflight passed. Run `wpm membrane doctor` for the full 8-gate check.'
            );
          } else {
            p.warn('  Membrane preflight failed.');
            p.log('');
            p.log('  Next steps:');
            if (!checks[0]?.pass) {
              p.log('    1. Rebuild WASM with membrane support:');
              p.log(
                '         npm run build:fog    (recommended — 2 MB, all algorithms except POWL)'
              );
              p.log('         npm run build:browser (full — 2.7 MB, all features)');
            }
            if (!checks[1]?.pass) {
              p.log('    2. Build envelopes from an XES event log:');
              p.log('         wpm membrane build <log.xes> --persist');
            }
            p.log('    3. Re-run: `wpm membrane check`');
            p.log('    4. Full diagnosis: `wpm membrane doctor`');
          }
          p.log('');
        });

        return await exitWithFlush(result.exit_code);
      },
      () => ({ 'membrane.check.all_pass': allPass, 'membrane.check.count': checkCount })
    );
  },
});

// ---------------------------------------------------------------------------
// Subcommand: export  (SARIF / JSON output from verify run)
// ---------------------------------------------------------------------------

const membraneExport = defineCommand({
  meta: {
    name: 'export',
    description: 'Run benchmarks and export results as SARIF, JSON, or report',
  },
  args: {
    format: {
      type: 'string',
      default: 'sarif',
      description: 'Export format: sarif (default), json',
    },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const quiet = Boolean(ctx.args.quiet);
    const exportFmt = ((ctx.args.format ?? 'sarif') as string).toLowerCase();
    const t0 = Date.now();

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.run_all_benchmarks !== 'function') {
        const result = makeErrorResult(
          'membrane export',
          FEATURE_GUARD_MSG,
          EXIT_CODES.execution_error,
          'FEATURE_GUARD'
        );
        emitResult(result, { format: 'human', quiet });
        return await exitWithFlush(result.exit_code);
      }

      const raw = (wasm.run_all_benchmarks as () => unknown)();
      const benchResult = parse(raw) as {
        total: number;
        passed: number;
        failed: number;
        pass_rate: number;
        results: Array<{
          trace_id: string;
          name: string;
          pass: boolean;
          final_verdict: string;
          expected_verdict: string;
          failure_reason?: string;
        }>;
      };

      if (exportFmt === 'sarif') {
        const sarifResults = benchResult.results.map((r) => ({
          verdict: r.final_verdict,
          traceName: r.trace_id,
          explanation: r.failure_reason,
        }));
        process.stdout.write(
          JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n'
        );
      } else {
        const result = makeResult(
          'membrane export',
          benchResult as unknown as Record<string, unknown>,
          Date.now() - t0
        );
        emitResult(result, { format: 'json', quiet });
      }

      return await exitWithFlush(EXIT_CODES.success);
    } catch (e) {
      const result = makeErrorResult('membrane export', e, EXIT_CODES.execution_error);
      emitResult(result, { format: 'human', quiet });
      return await exitWithFlush(result.exit_code);
    }
  },
});

// ---------------------------------------------------------------------------
// Top-level `membrane` command
// ---------------------------------------------------------------------------

export const membrane = defineCommand({
  meta: {
    name: 'membrane',
    description:
      'AutoMembrane — pre-control membrane for process motion classification (Vision 2030). Example: wpm membrane --format json',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
    },
  },
  async run(ctx) {
    const isJson = ctx.args.format === 'json';
    if (isJson) {
      process.stdout.write(
        JSON.stringify({
          status: 'info',
          message: 'AutoMembrane verb8: show, init, build, check, doctor, replay, verify, export',
        }) + '\n'
      );
    } else {
      process.stdout.write(`
  wpm membrane — AutoMembrane Vision 2030  (verb8 grammar)

  Subcommands:
    wpm membrane show   [handle]          Show state, health, and installed envelopes
    wpm membrane init                     Scaffold [membrane] config in wasm4pm.toml
    wpm membrane build  <log.xes>         Build all envelope layers from an event log
    wpm membrane check                    Fast preflight: profile, config, envelopes
    wpm membrane doctor                   Run 8 definition-of-done gate checks
    wpm membrane replay <motion.json>     Replay a RequestMotion through the classifier
    wpm membrane verify                   Run benchmarks — exit non-zero on failure (CI)
    wpm membrane export [--format sarif]  Emit SARIF / JSON / report

  Deprecated aliases (removed v26.6):
    health → show    classify → replay    benchmark → verify    inspect → show <handle>

  Run "wpm membrane <subcommand> --help" for detailed usage.
`);
    }
    return await exitWithFlush(EXIT_CODES.success);
  },
  subCommands: {
    // verb8 canonical
    show: membraneShow,
    init: membraneInit,
    build: membraneBuild,
    check: membraneCheck,
    doctor: membraneDoctor,
    replay: membraneReplay,
    verify: membraneVerify,
    export: membraneExport,
    // deprecated aliases (kept for backward compat, removed v26.6)
    health: membraneShow,
    classify: membraneReplayLog,
    inspect: membraneInspect,
    list: membraneList,
    benchmark: membraneVerify,
  },
});
