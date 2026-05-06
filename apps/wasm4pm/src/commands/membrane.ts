import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { buildSarifOutput } from '../sarif.js';

// ---------------------------------------------------------------------------
// Shared parse helper — WASM functions return either a JS string or an object
// ---------------------------------------------------------------------------

const parse = (r: unknown): unknown =>
  typeof r === 'string' ? JSON.parse(r) : r;

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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.run_all_benchmarks !== 'function') {
        formatter.error(
          'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.'
        );
        process.exit(EXIT_CODES.execution_error);
      }

      const raw = (wasm.run_all_benchmarks as () => unknown)();
      const result = parse(raw) as {
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

      // SARIF output
      if (ctx.args.format === 'sarif') {
        const sarifResults = result.results.map((r) => ({
          verdict: r.final_verdict,
          traceName: r.name,
          explanation: r.failure_reason,
          missingEvidence: [] as string[],
        }));
        process.stdout.write(JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n');
        process.exit(EXIT_CODES.success);
      }

      if (formatter instanceof JSONFormatter) {
        formatter.success('AutoMembrane benchmark complete', result as Record<string, unknown>);
        process.exit(EXIT_CODES.success);
      }

      // Human output
      formatter.log('');
      formatter.log('  AutoMembrane Benchmark Suite');
      formatter.log('  ═'.repeat(33));
      for (const r of result.results) {
        const status = r.pass ? 'PASS' : 'FAIL';
        const icon = r.pass ? '✓' : '✗';
        const name = r.name.padEnd(30);
        const verdict = r.final_verdict;
        formatter.log(`  ${name}  ${status}  ${icon} ${verdict}`);
        if (!r.pass && r.failure_reason) {
          formatter.log(`    Reason: ${r.failure_reason}`);
        }
      }
      formatter.log('');
      const pct = (result.pass_rate * 100).toFixed(0);
      formatter.log(
        `  Passed: ${result.passed}/${result.total}   Pass rate: ${pct}%`
      );
      formatter.log('');

      process.exit(result.failed > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success);
    } catch (error) {
      formatter.error(
        `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODES.execution_error);
    }
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      const logPath = ctx.args.log as string;
      try {
        await fs.access(logPath);
      } catch {
        formatter.error(`Input file not found: ${logPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const actorKey = (ctx.args['actor-key'] as string) || 'org:resource';
      const traceIndex = parseInt((ctx.args['trace-index'] as string) || '0', 10);

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.classify_motion !== 'function') {
        formatter.error(
          'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.'
        );
        process.exit(EXIT_CODES.execution_error);
      }

      const xesContent = await fs.readFile(logPath, 'utf-8');
      const logHandle = (wasm.load_eventlog_from_xes as (s: string) => string)(xesContent);

      if (!logHandle) {
        formatter.error('Failed to parse XES event log');
        process.exit(EXIT_CODES.source_error);
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

      // SARIF output
      if (ctx.args.format === 'sarif') {
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
        process.stdout.write(JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n');
        process.exit(EXIT_CODES.success);
      }

      if (formatter instanceof JSONFormatter) {
        formatter.success('AutoMembrane classification complete', verdictReceipt);
        process.exit(EXIT_CODES.success);
      }

      // Human output — parse motion for display fields
      const motion = parse(motionJson) as {
        actor: string;
        requested_action: string;
        request_id: string;
      };

      const layerVerdicts = verdictReceipt.layer_verdicts as Array<{
        layer: string;
        verdict: string;
        confidence: number;
        reason?: string;
        missing_evidence: string[];
      }>;

      const layersToShow = ctx.args['custody-only']
        ? layerVerdicts.filter(lv => lv.layer === 'custody')
        : layerVerdicts;

      formatter.log('');
      formatter.log('  AutoMembrane Verdict');
      formatter.log('  ═'.repeat(22));
      formatter.log(`  Request:   ${motion.actor} → ${motion.requested_action}`);
      if (!ctx.args['custody-only']) {
        formatter.log(
          `  Verdict:   ${String(verdictReceipt.final_verdict).toUpperCase()}`
        );
        formatter.log(`  Decisive:  ${verdictReceipt.decisive_layer}`);
      }
      formatter.log('');
      formatter.log('  Layer breakdown:');
      for (const lv of layersToShow) {
        const missing =
          lv.missing_evidence && lv.missing_evidence.length > 0
            ? `  Missing: ${lv.missing_evidence.join(', ')}`
            : '';
        formatter.log(
          `    ${lv.layer.padEnd(8)} ${lv.verdict.padEnd(20)} (${lv.confidence.toFixed(2)})${missing}`
        );
        if ((ctx.args.trace || ctx.args['custody-only']) && ctx.args['explain-failure'] && lv.verdict !== 'allow' && lv.verdict !== 'allow_with_receipt' && lv.reason) {
          formatter.log(`             reason: ${lv.reason}`);
        }
      }
      if (ctx.args['explain-failure'] && verdictReceipt.final_verdict !== 'allow' && !ctx.args.trace && !ctx.args['custody-only']) {
        formatter.log('');
        formatter.log('  Explanation:');
        String(verdictReceipt.explanation || '').split('\n').forEach(l => formatter.log('    ' + l));
      }
      formatter.log('');
      formatter.log(
        `  Replay:  ${verdictReceipt.request_id}  Model: ${verdictReceipt.model_version}`
      );
      formatter.log('');

      process.exit(EXIT_CODES.success);
    } catch (error) {
      formatter.error(
        `Classification failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODES.execution_error);
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    const handlesArg = ctx.args.handles as string | undefined;

    if (!handlesArg || handlesArg.trim() === '') {
      if (formatter instanceof JSONFormatter) {
        formatter.success('No envelopes installed', {
          envelopes: [],
          message:
            'Run wpm membrane classify or wpm ml automl-v2 to build envelopes.',
        });
      } else {
        formatter.log('');
        formatter.log(
          '  No envelopes installed. Run `wpm membrane classify` or `wpm ml automl-v2` to build envelopes.'
        );
        formatter.log('');
      }
      process.exit(EXIT_CODES.success);
    }

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.get_membrane_health !== 'function') {
        formatter.error(
          'AutoMembrane requires the fog or browser deployment profile.\nCurrent profile does not include feature-miniml.'
        );
        process.exit(EXIT_CODES.execution_error);
      }

      const handles = handlesArg
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      const handlesJson = JSON.stringify(handles);

      const raw = (wasm.get_membrane_health as (j: string) => unknown)(handlesJson);
      const result = parse(raw) as Record<string, unknown>;

      if (formatter instanceof JSONFormatter) {
        formatter.success('Membrane health', result);
      } else {
        formatter.log('');
        formatter.log('  AutoMembrane Envelope Health');
        formatter.log('  ═'.repeat(30));
        formatter.log(JSON.stringify(result, null, 2));
        formatter.log('');
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      formatter.error(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODES.execution_error);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
    const dryRun = ctx.args['dry-run'] as boolean | undefined;
    const force = ctx.args.force as boolean | undefined;
    const tomlPath = path.join(process.cwd(), 'wasm4pm.toml');

    let existing = '';
    try {
      existing = await fs.readFile(tomlPath, 'utf-8');
    } catch {
      /* file will be created */
    }

    if (existing.includes('[membrane]') && !force) {
      if (fmt instanceof JSONFormatter) {
        fmt.success('Membrane config already present', { file: tomlPath, action: 'skipped' });
      } else {
        fmt.warn('[membrane] section already exists in wasm4pm.toml. Use --force to overwrite.');
      }
      process.exit(EXIT_CODES.success);
    }

    if (dryRun) {
      if (fmt instanceof JSONFormatter) {
        fmt.success('Dry-run: membrane config section', { config: MEMBRANE_TOML_SECTION });
      } else {
        fmt.log('\n  Dry-run — the following would be appended to wasm4pm.toml:\n');
        fmt.log(MEMBRANE_TOML_SECTION);
        fmt.log('  Run without --dry-run to apply.\n');
      }
      process.exit(EXIT_CODES.success);
    }

    let base = existing;
    if (force && existing.includes('[membrane]')) {
      base = existing.replace(/\[membrane\][\s\S]*?(?=\n\[(?!membrane\])|\s*$)/, '');
    }
    const newContent = base.trimEnd() + '\n' + MEMBRANE_TOML_SECTION;
    await fs.writeFile(tomlPath, newContent, 'utf-8');

    if (fmt instanceof JSONFormatter) {
      fmt.success('Membrane config initialized', {
        file: tomlPath,
        action: existing ? 'appended' : 'created',
      });
    } else {
      fmt.success(`Membrane config initialized in wasm4pm.toml`);
      fmt.log('\n  Next steps:');
      fmt.log('    1. Review [membrane] settings in wasm4pm.toml');
      fmt.log('    2. Run `wpm membrane build <log.xes>` to build envelopes');
      fmt.log('    3. Run `wpm membrane health` to verify envelope status\n');
    }
    process.exit(EXIT_CODES.success);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
    const logPath = ctx.args.log as string;

    try {
      await fs.access(logPath);
    } catch {
      fmt.error(
        `Input file not found: ${logPath}\nProvide a valid path to an XES event log.`
      );
      process.exit(EXIT_CODES.source_error);
    }

    const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
    const actorKey = (ctx.args['actor-key'] as string) || 'org:resource';
    const timestampKey = (ctx.args['timestamp-key'] as string) || 'time:timestamp';
    const coverageThreshold = parseFloat(
      (ctx.args['coverage-threshold'] as string) || '0.8'
    );

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, unknown>;

    if (typeof wasm.build_actor_envelope !== 'function') {
      fmt.error(FEATURE_GUARD_MSG);
      process.exit(EXIT_CODES.execution_error);
    }

    const xesContent = await fs.readFile(logPath, 'utf-8');
    if (!(fmt instanceof JSONFormatter)) fmt.log('\n  Building AutoMembrane envelopes...');

    const logHandle = (wasm.load_eventlog_from_xes as (s: string) => string)(xesContent);
    if (!logHandle) {
      fmt.error('Failed to parse XES event log.');
      process.exit(EXIT_CODES.source_error);
    }

    const handles: Record<string, string> = {};
    const errors: Record<string, string> = {};

    const tryBuild = async (name: string, fn: () => unknown) => {
      try {
        const raw = fn();
        handles[name] = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (!(fmt instanceof JSONFormatter))
          fmt.log(`  Building ${name} envelope... ✓`);
      } catch (e) {
        errors[name] = e instanceof Error ? e.message : String(e);
        if (!(fmt instanceof JSONFormatter))
          fmt.log(`  Building ${name} envelope... ✗  ${errors[name]}`);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('actor', () => (wasm.build_actor_envelope as any)(logHandle, activityKey, actorKey, timestampKey));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('object', () => (wasm.build_object_envelope as any)(logHandle, activityKey));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryBuild('route', () => (wasm.build_route_envelope as any)(logHandle, activityKey, coverageThreshold));
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

    if (fmt instanceof JSONFormatter) {
      fmt.success('AutoMembrane envelopes built', { handles, errors });
    } else {
      fmt.log('\n  Envelope handles:');
      for (const [layer, handle] of Object.entries(handles)) {
        fmt.log(`    ${layer.padEnd(8)} ${handle}`);
      }
      if (Object.keys(errors).length) {
        fmt.log('\n  Build errors:');
        for (const [l, m] of Object.entries(errors)) {
          fmt.log(`    ${l.padEnd(8)} ${m}`);
        }
      }
      const handleList = Object.values(handles).join(' ');
      if (handleList) fmt.log(`\n  Next: wpm membrane health ${handleList}\n`);
    }

    const exitCode =
      Object.keys(handles).length === 0
        ? EXIT_CODES.execution_error
        : Object.keys(errors).length > 0
          ? EXIT_CODES.partial_failure
          : EXIT_CODES.success;
    process.exit(exitCode);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
    const handle = ctx.args.handle as string;
    const objectType = (ctx.args['object-type'] as string) || '';

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, unknown>;

    if (typeof wasm.get_actor_profiles !== 'function') {
      fmt.error(FEATURE_GUARD_MSG);
      process.exit(EXIT_CODES.execution_error);
    }

    let result: unknown = null;
    let envelopeType = '';

    const tryFn = (fnName: string, args: unknown[], typeName: string): boolean => {
      if (typeof wasm[fnName] !== 'function') return false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = parse((wasm[fnName] as any)(...args));
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
      fmt.error(
        `No envelope found for handle: ${handle}\nRun \`wpm membrane build <log.xes>\` first to create envelopes.`
      );
      process.exit(EXIT_CODES.source_error);
    }

    if (fmt instanceof JSONFormatter) {
      fmt.success(`Envelope inspect (${envelopeType})`, {
        handle,
        type: envelopeType,
        data: result as Record<string, unknown>,
      });
    } else {
      fmt.log(`\n  AutoMembrane Envelope — ${envelopeType}`);
      fmt.log('  ═'.repeat(30));
      fmt.log(`  Handle: ${handle}  Type: ${envelopeType}\n`);
      fmt.log(
        JSON.stringify(result, null, 2)
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n')
      );
      fmt.log('');
    }
    process.exit(EXIT_CODES.success);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
    const motionPath = ctx.args.motion as string;

    let motionText: string;
    try {
      motionText = await fs.readFile(motionPath, 'utf-8');
    } catch {
      fmt.error(
        `Motion file not found: ${motionPath}\nCreate a motion.json — see \`wpm membrane replay --help\`.`
      );
      process.exit(EXIT_CODES.source_error);
    }

    let motionObj: Record<string, unknown>;
    try {
      motionObj = JSON.parse(motionText);
    } catch {
      fmt.error(`Invalid JSON in ${motionPath}. Expected a RequestMotion JSON object.`);
      process.exit(EXIT_CODES.source_error);
    }

    if (ctx.args['dry-run']) {
      if (fmt instanceof JSONFormatter) {
        fmt.success('Dry-run: motion parsed', { motion: motionObj });
      } else {
        fmt.log('\n  Dry-run — motion parsed successfully (no classification):\n');
        fmt.log(
          JSON.stringify(motionObj, null, 2)
            .split('\n')
            .map((l) => '  ' + l)
            .join('\n')
        );
        fmt.log('\n  Remove --dry-run to classify.\n');
      }
      process.exit(EXIT_CODES.success);
    }

    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, unknown>;

    if (typeof wasm.classify_motion !== 'function') {
      fmt.error(FEATURE_GUARD_MSG);
      process.exit(EXIT_CODES.execution_error);
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

    const layersToShow = ctx.args['custody-only']
      ? receipt.layer_verdicts.filter((lv) => lv.layer === 'custody')
      : receipt.layer_verdicts;

    if (fmt instanceof JSONFormatter) {
      fmt.success('AutoMembrane replay', {
        ...receipt,
        layer_verdicts: layersToShow,
      } as Record<string, unknown>);
      process.exit(EXIT_CODES.success);
    }

    fmt.log('\n  AutoMembrane Replay');
    fmt.log('  ═'.repeat(22));
    fmt.log(`  Actor:   ${motionObj.actor || '(unknown)'}`);
    fmt.log(`  Action:  ${motionObj.requested_action || '(unknown)'}`);
    if (!ctx.args['custody-only']) {
      fmt.log(`  Verdict: ${receipt.final_verdict.toUpperCase()}`);
      fmt.log(`  Decisive layer: ${receipt.decisive_layer}`);
      fmt.log(`  Admitted: ${receipt.downstream_admitted ? 'yes' : 'no'}`);
    }
    if (ctx.args.trace || ctx.args['custody-only']) {
      fmt.log('\n  Layer verdicts:');
      for (const lv of layersToShow) {
        const miss =
          lv.missing_evidence.length > 0
            ? `  missing: ${lv.missing_evidence.join(', ')}`
            : '';
        fmt.log(
          `    ${lv.layer.padEnd(8)} ${lv.verdict.padEnd(22)} (${lv.confidence.toFixed(2)})${miss}`
        );
        if (
          ctx.args['explain-failure'] &&
          lv.verdict !== 'allow' &&
          lv.verdict !== 'allow_with_receipt'
        ) {
          fmt.log(`             reason: ${lv.reason}`);
        }
      }
    }
    if (
      ctx.args['explain-failure'] &&
      receipt.final_verdict !== 'allow' &&
      !ctx.args.trace
    ) {
      fmt.log('\n  Explanation:');
      String(receipt.explanation)
        .split('\n')
        .forEach((l) => fmt.log('    ' + l));
    }
    fmt.log(`\n  Model: ${receipt.model_version}   Request: ${receipt.request_id}\n`);
    process.exit(EXIT_CODES.success);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });
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
      if (fmt instanceof JSONFormatter) {
        fmt.success('No persisted envelopes', { directory: dir, envelopes: [] });
      } else {
        fmt.log('\n  No persisted envelopes found.');
        fmt.log(`  Directory: ${dir}`);
        fmt.log('\n  To persist: wpm membrane build <log.xes> --persist\n');
      }
      process.exit(EXIT_CODES.success);
    }

    if (fmt instanceof JSONFormatter) {
      fmt.success('Persisted envelopes', {
        directory: dir,
        count: entries.length,
        envelopes: entries.map((e) => ({
          name: e.name,
          created_at: e.mtime.toISOString(),
          log: e.manifest?.log,
          handles: e.manifest?.handles ?? {},
        })),
      });
      process.exit(EXIT_CODES.success);
    }

    fmt.log(
      `\n  AutoMembrane Envelopes (${entries.length} manifest${entries.length !== 1 ? 's' : ''})`
    );
    fmt.log(`  Directory: ${dir}\n`);
    fmt.log(`  #   Created at            Log                       Layers`);
    fmt.log(`  ──  ────────────────────  ────────────────────────  ─────────────────`);
    entries.forEach((e, i) => {
      const createdAt = e.mtime.toISOString().slice(0, 19).replace('T', ' ');
      const logShort = e.manifest?.log
        ? path.basename(e.manifest.log).substring(0, 24).padEnd(24)
        : '(unknown)               ';
      const layers = e.manifest?.handles ? Object.keys(e.manifest.handles).join(', ') : '(unreadable)';
      fmt.log(
        `  ${String(i + 1).padStart(3)}  ${createdAt}  ${logShort}  ${layers}`
      );
      if (ctx.args.verbose && e.manifest?.handles) {
        for (const [layer, handle] of Object.entries(e.manifest.handles)) {
          fmt.log(`         ${layer.padEnd(8)} handle: ${handle}`);
        }
      }
    });
    fmt.log('\n  Tip: wpm membrane inspect <handle>   Inspect a specific envelope');
    fmt.log('  Tip: wpm membrane health <handles>   Check health of envelopes\n');
    process.exit(EXIT_CODES.success);
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
    const fmt = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

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

    // Check 4: membrane.enabled = true in config
    let membraneEnabled = false;
    let configDetail = 'Could not read wasm4pm.toml';
    try {
      const tomlContent = await fs
        .readFile(path.join(process.cwd(), 'wasm4pm.toml'), 'utf-8')
        .catch(() => '');
      membraneEnabled =
        tomlContent.includes('[membrane]') && /enabled\s*=\s*true/.test(tomlContent);
      configDetail = membraneEnabled
        ? 'membrane.enabled = true in wasm4pm.toml'
        : '[membrane] section missing or enabled = false';
    } catch {
      /* file unreadable */
    }
    checks.push({
      name: 'membrane.enabled = true in config',
      pass: membraneEnabled,
      detail: configDetail,
      fix: 'Run `wpm membrane init` then set enabled = true',
    });

    // Check 5: custody_actions non-empty in config
    let custodyOk = false;
    try {
      const tomlContent = await fs
        .readFile(path.join(process.cwd(), 'wasm4pm.toml'), 'utf-8')
        .catch(() => '');
      custodyOk = /custody_actions\s*=\s*\[.+\]/.test(tomlContent);
    } catch {
      /* file unreadable */
    }
    checks.push({
      name: 'custody_actions configured',
      pass: custodyOk,
      detail: custodyOk
        ? 'custody_actions found in wasm4pm.toml'
        : 'custody_actions not configured (empty or missing)',
      fix: 'Add `custody_actions = ["approve", "release", "transfer"]` to [membrane] section',
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
        const stats = await Promise.all(
          jsonFiles.map((f) => fs.stat(path.join(envelopesDir, f)))
        );
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

    if (fmt instanceof JSONFormatter) {
      fmt.success('AutoMembrane doctor', {
        all_pass: allPass,
        checks: checks.map((c) => ({
          name: c.name,
          pass: c.pass,
          detail: c.detail,
          fix: c.pass ? undefined : c.fix,
        })),
      });
    } else {
      fmt.log('\n  AutoMembrane Doctor — Definition of Done');
      fmt.log('  ' + '='.repeat(43));
      checks.forEach((c, i) => {
        const icon = c.pass ? 'v' : 'x';
        fmt.log(`  ${icon}  ${String(i + 1).padStart(2)}.  ${c.name}`);
        if (ctx.args.verbose || !c.pass) {
          fmt.log(`         ${c.detail}`);
        }
        if (!c.pass && c.fix) {
          fmt.log(`         Fix: ${c.fix}`);
        }
      });
      fmt.log('');
      if (allPass) {
        fmt.log('  All 8 checks pass — AutoMembrane is production-ready.\n');
      } else {
        fmt.log(
          `  ${checks.filter((c) => !c.pass).length} check(s) failed. Fix issues above and re-run.\n`
        );
      }
    }

    process.exit(allPass ? EXIT_CODES.success : EXIT_CODES.config_error);
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      quiet: ctx.args.quiet,
    });

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
        detail: hasMemb ? 'classify_motion export present' : 'rebuild with npm run build:fog or build:browser',
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
        detail: manifests.length > 0
          ? `${manifests.length} envelope manifest(s) found`
          : 'run wpm membrane build <log.xes> to create envelopes',
      });
    } catch {
      checks.push({ name: 'envelopes present', pass: false, detail: 'cannot read envelopes dir' });
    }

    const allPass = checks.every((c) => c.pass);

    if (formatter instanceof JSONFormatter) {
      formatter.output({ checks, all_pass: allPass });
    } else {
      for (const c of checks) {
        const icon = c.pass ? '✓' : '✗';
        const line = `  ${icon} ${c.name.padEnd(28)} ${c.detail}`;
        if (c.pass) (formatter as HumanFormatter).info(line);
        else formatter.warn(line);
      }
      if (allPass) formatter.success('Membrane check passed.');
      else formatter.warn('Membrane check: some checks failed.');
    }

    process.exit(allPass ? EXIT_CODES.success : EXIT_CODES.execution_error);
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
    const formatter = getFormatter({ format: 'human', quiet: ctx.args.quiet });

    try {
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      if (typeof wasm.run_all_benchmarks !== 'function') {
        formatter.error(FEATURE_GUARD_MSG);
        process.exit(EXIT_CODES.execution_error);
      }

      const raw = (wasm.run_all_benchmarks as () => unknown)();
      const result = parse(raw) as {
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

      const fmt = (ctx.args.format ?? 'sarif').toLowerCase();
      if (fmt === 'sarif') {
        const sarifResults = result.results.map((r) => ({
          verdict: r.final_verdict,
          traceName: r.trace_id,
          explanation: r.failure_reason,
        }));
        process.stdout.write(JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n');
      } else {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }

      process.exit(EXIT_CODES.success);
    } catch (e) {
      formatter.error(String(e));
      process.exit(EXIT_CODES.execution_error);
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
      'AutoMembrane — pre-control membrane for process motion classification (Vision 2030)',
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
          message:
            'AutoMembrane verb8: show, init, build, check, doctor, replay, verify, export',
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
    process.exit(EXIT_CODES.success);
  },
  subCommands: {
    // verb8 canonical
    show:    membraneShow,
    init:    membraneInit,
    build:   membraneBuild,
    check:   membraneCheck,
    doctor:  membraneDoctor,
    replay:  membraneReplay,
    verify:  membraneVerify,
    export:  membraneExport,
    // deprecated aliases (kept for backward compat, removed v26.6)
    health:   membraneShow,
    classify: membraneReplayLog,
    inspect:  membraneInspect,
    list:     membraneList,
    benchmark: membraneVerify,
  },
});
