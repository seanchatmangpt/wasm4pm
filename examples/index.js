'use strict';
/**
 * wasm4pm Fortune 5 JTBD Runner
 *
 * Runs any or all JTBD examples, exits 1 when violations are found.
 *
 * Usage: node examples/index.js [options]
 *
 *   --jtbd <name>      supply-chain | incident | fulfillment | compliance | safety
 *   --log <path>       Real XES event log (overrides embedded data)
 *   --format <f>       human | json  (default: human)
 *   --watch <seconds>  Re-run every N seconds; auto-compares each run
 *   --compare          Diff against last saved result
 *   --no-save          Skip persisting results to .wasm4pm/results/examples/
 *   --help             Show this help
 *
 * Exit codes:  0 = all clear  |  1 = violations found  |  2 = bad input  |  3 = WASM error
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const MODULES = [
  require('./01-supply-chain-drift'),
  require('./02-incident-triage'),
  require('./03-fulfillment-bottleneck'),
  require('./04-compliance-rulebook'),
  require('./05-safety-process-guard'),
];

const JTBD_MAP = Object.fromEntries(MODULES.map(m => [m.name, m]));

// ─── argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { jtbd: 'all', log: null, format: 'human', watch: null, compare: false, save: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--jtbd')    args.jtbd    = argv[++i];
    else if (a === '--log')     args.log     = argv[++i];
    else if (a === '--format')  args.format  = argv[++i];
    else if (a === '--watch')   args.watch   = parseInt(argv[++i], 10);
    else if (a === '--compare') args.compare = true;
    else if (a === '--no-save') args.save    = false;
    else if (a === '--help')  { printHelp(); process.exit(0); }
  }
  if (args.jtbd !== 'all' && !JTBD_MAP[args.jtbd]) {
    console.error(`ERROR: Unknown JTBD "${args.jtbd}". Valid: ${Object.keys(JTBD_MAP).join(', ')}`);
    process.exit(2);
  }
  if (args.format !== 'human' && args.format !== 'json') {
    console.error(`ERROR: --format must be "human" or "json", got "${args.format}"`);
    process.exit(2);
  }
  return args;
}

function printHelp() {
  console.log(`
  wasm4pm Fortune 5 JTBD Runner

    node examples/index.js [options]

  Options:
    --jtbd <name>      Run one JTBD: ${Object.keys(JTBD_MAP).join(' | ')}
                       (default: all)
    --log <path>       Real XES event log (overrides embedded demo data)
    --format <f>       Output format: human | json  (default: human)
    --watch <seconds>  Re-run every N seconds; auto-compares each tick
    --compare          Diff this run against last saved result
    --no-save          Skip persisting results to .wasm4pm/results/examples/
    --help             Show this help

  Exit codes:  0 = all clear  |  1 = violations found  |  2 = bad input  |  3 = WASM error
`);
}

// ─── WASM init ───────────────────────────────────────────────────────────────

function loadWasm() {
  const pkgPath = path.resolve(__dirname, '../wasm4pm/pkg/wasm4pm.js');
  if (!fs.existsSync(pkgPath)) {
    console.error('ERROR: WASM binary not found.');
    console.error('  Run: cd wasm4pm && npm run build:nodejs');
    process.exit(3);
  }
  const wasm = require(pkgPath);
  wasm.init();
  return wasm;
}

// ─── XES auto-discovery ──────────────────────────────────────────────────────

function loadXes(logPath) {
  if (logPath) {
    if (!fs.existsSync(logPath)) {
      console.error(`ERROR: log file not found: ${logPath}`);
      process.exit(2);
    }
    return { xes: fs.readFileSync(logPath, 'utf8'), source: path.resolve(logPath) };
  }
  const candidates = [
    path.resolve(__dirname, '../bench_data/bpi2020_travel.xes'),
    path.resolve(__dirname, '../bench_data/sepsis.xes'),
    path.resolve(process.env.HOME || '', 'chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes'),
    path.resolve(process.env.HOME || '', 'chatmangpt/pm4py/tests/input_data/receipt.xes'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).size > 1000) {
      return { xes: fs.readFileSync(c, 'utf8'), source: c };
    }
  }
  return { xes: null, source: 'embedded' };
}

// ─── persistence ─────────────────────────────────────────────────────────────

function saveResult(jtbdKey, envelope) {
  const dir = path.resolve(__dirname, '../.wasm4pm/results/examples');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `${ts}-${jtbdKey}.json`), JSON.stringify(envelope, null, 2));
  fs.writeFileSync(path.join(dir, `${jtbdKey}-last.json`),  JSON.stringify(envelope, null, 2));
  return path.join('.wasm4pm/results/examples', `${jtbdKey}-last.json`);
}

function loadLast(jtbdKey) {
  const p = path.resolve(__dirname, '../.wasm4pm/results/examples', `${jtbdKey}-last.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// ─── diff ────────────────────────────────────────────────────────────────────

function computeDiff(prevResults, currResults) {
  const prevV = (prevResults || []).reduce((s, r) => s + (r.violations?.length ?? 0), 0);
  const currV = currResults.reduce((s, r) => s + r.violations.length, 0);
  return {
    violations_before: prevV,
    violations_now:    currV,
    delta:             currV - prevV,
    compliant_before:  prevV === 0,
    compliant_now:     currV === 0,
  };
}

// ─── execution ───────────────────────────────────────────────────────────────

function runJtbd(wasm, module, xes) {
  try {
    return module.run(wasm, xes);
  } catch (err) {
    return {
      name:       module.name,
      jtbd:       module.jtbd,
      violations: [`Execution error: ${err.message}`],
      summary:    {},
      findings:   {},
      compliant:  false,
      elapsed_ms: 0,
      error:      err.message,
    };
  }
}

// ─── output ──────────────────────────────────────────────────────────────────

function printHuman(results, logLabel, savedPath, diff) {
  const total  = results.length;
  const totalV = results.reduce((s, r) => s + r.violations.length, 0);

  console.log('=== wasm4pm Fortune 5 JTBD Runner ===');
  console.log(`Log  : ${logLabel}`);
  console.log('');

  results.forEach((r, i) => {
    const icon   = r.compliant ? '✓' : '✗';
    const status = r.compliant ? 'compliant  ' : 'VIOLATIONS';
    const timing = `${r.elapsed_ms.toFixed(1)}ms`;
    const vcount = r.violations.length;
    const vtag   = vcount === 0 ? '' : ` (${vcount} violation${vcount !== 1 ? 's' : ''})`;
    console.log(`  [${i + 1}/${total}] ${r.name.padEnd(15)} ${icon} ${status}  ${timing}${vtag}`);
    if (!r.compliant) {
      r.violations.slice(0, 2).forEach(v => console.log(`         └─ ${v}`));
      if (r.violations.length > 2) console.log(`         └─ (+${r.violations.length - 2} more)`);
    }
  });

  const violatingCount = results.filter(r => !r.compliant).length;
  console.log('');
  console.log(`Summary : ${totalV} violation${totalV !== 1 ? 's' : ''} across ${violatingCount}/${total} JTBDs`);

  if (diff) {
    const arrow = diff.delta > 0 ? '↑' : diff.delta < 0 ? '↓' : '=';
    const label = diff.delta > 0 ? 'more' : diff.delta < 0 ? 'fewer' : 'unchanged';
    console.log(`Delta   : ${arrow} ${Math.abs(diff.delta)} ${label} violation${Math.abs(diff.delta) !== 1 ? 's' : ''} vs last run`);
    if (diff.compliant_before !== diff.compliant_now) {
      console.log(`Status  : ${diff.compliant_now ? '✓ RECOVERED' : '✗ REGRESSED'}`);
    }
  }

  if (savedPath) console.log(`Saved   : ${savedPath}`);
  console.log(`Exit    : ${totalV > 0 ? '1 (violations detected)' : '0 (all clear)'}`);
}

function printJson(results, logSource, runId, durationMs, diff) {
  const totalV        = results.reduce((s, r) => s + r.violations.length, 0);
  const anyViolations = results.some(r => !r.compliant);
  const out = {
    command:   'examples',
    status:    anyViolations ? 'violations' : 'ok',
    exit_code: anyViolations ? 1 : 0,
    payload: {
      log_source: logSource,
      results,
      summary: {
        total:            results.length,
        violating:        results.filter(r => !r.compliant).length,
        compliant:        results.filter(r =>  r.compliant).length,
        total_violations: totalV,
      },
      diff: diff || null,
    },
    meta: {
      run_id:      runId,
      timestamp:   new Date().toISOString(),
      duration_ms: durationMs,
      version:     '26.4.15',
    },
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// ─── main ────────────────────────────────────────────────────────────────────

function main(wasm, args, isWatchTick) {
  const { xes, source } = loadXes(args.log);
  const modules = args.jtbd === 'all' ? MODULES : [JTBD_MAP[args.jtbd]];
  const jtbdKey = args.jtbd === 'all' ? 'all' : args.jtbd;

  // Load previous result BEFORE running (so we diff against saved, not current)
  const previous = (args.compare || isWatchTick) ? loadLast(jtbdKey) : null;

  const run_id   = crypto.randomUUID();
  const t0       = Date.now();
  const results  = modules.map(m => runJtbd(wasm, m, xes));
  const duration = Date.now() - t0;

  const diff = previous ? computeDiff(previous.results, results) : null;

  let savedPath = null;
  if (args.save) {
    const envelope = { run_id, timestamp: new Date().toISOString(), jtbd: jtbdKey, log_source: source, results };
    savedPath = saveResult(jtbdKey, envelope);
  }

  const logLabel = source === 'embedded'
    ? 'embedded demo data'
    : path.relative(process.cwd(), source);

  if (args.format === 'json') {
    printJson(results, source, run_id, duration, diff);
  } else {
    printHuman(results, logLabel, savedPath, diff);
  }

  return results.some(r => !r.compliant) ? 1 : 0;
}

// ─── entry point ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
const wasm = loadWasm();

if (args.watch) {
  const intervalMs = args.watch * 1000;
  if (args.format === 'human') {
    console.log(`Watch mode — re-running every ${args.watch}s (Ctrl+C to stop)\n`);
  }
  main(wasm, args, false);
  setInterval(() => {
    if (args.format === 'human') console.log(`\n${'─'.repeat(50)}\n${new Date().toISOString()}\n`);
    main(wasm, args, true);
  }, intervalMs);
} else {
  const exitCode = main(wasm, args, false);
  process.exit(exitCode);
}
