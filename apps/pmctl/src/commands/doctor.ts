import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface DoctorOptions extends OutputOptions {
  fix?: boolean;
}

/** Result of a single health check */
interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

/** Aggregate report */
interface DoctorReport {
  checks: CheckResult[];
  ok: number;
  warn: number;
  fail: number;
  healthy: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Individual checks
// ────────────────────────────────────────────────────────────────────────────

/** Verify Node.js is new enough (≥ 18) */
async function checkNodeVersion(): Promise<CheckResult> {
  const raw = process.version; // e.g. "v20.11.0"
  const major = parseInt(raw.slice(1).split('.')[0] ?? '0', 10);
  if (major >= 18) {
    return { name: 'Node.js version', status: 'ok', message: `${raw} (≥ 18 required)` };
  }
  return {
    name: 'Node.js version',
    status: 'fail',
    message: `${raw} is too old — Node.js ≥ 18 is required`,
    fix: 'Install Node.js 18+ from https://nodejs.org or use a version manager: nvm install 20',
  };
}

/**
 * Verify the WASM binary exists and is non-empty.
 * We locate pkg/ by walking up from this file's expected dist location to the
 * workspace root, then descending into wasm4pm/pkg/.
 */
async function checkWasmBinary(): Promise<CheckResult> {
  // The pmctl package lives at <workspace>/apps/pmctl.
  // The WASM binary lives at <workspace>/wasm4pm/pkg/wasm4pm_bg.wasm.
  // We anchor to the pmctl package root by walking up from cwd until we find
  // the workspace marker (pnpm-workspace.yaml or package.json with workspaces).
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM binary',
      status: 'fail',
      message: 'Cannot locate wasm4pm/pkg/ directory (workspace root not found)',
      fix: 'Run this command from inside the wasm4pm workspace, then rebuild: cd wasm4pm && npm run build',
    };
  }

  const wasmFile = path.join(wasmPkgDir, 'wasm4pm_bg.wasm');
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');

  try {
    const [wasmStat, jsStat] = await Promise.all([
      fs.stat(wasmFile),
      fs.stat(jsFile),
    ]);

    if (wasmStat.size === 0) {
      return {
        name: 'WASM binary',
        status: 'fail',
        message: `${wasmFile} exists but is empty`,
        fix: 'Rebuild WASM: cd wasm4pm && npm run build',
      };
    }

    const sizeMb = (wasmStat.size / 1024 / 1024).toFixed(1);
    void jsStat; // used for existence check above
    return {
      name: 'WASM binary',
      status: 'ok',
      message: `wasm4pm_bg.wasm found (${sizeMb} MB)`,
    };
  } catch {
    return {
      name: 'WASM binary',
      status: 'fail',
      message: `WASM binary not built — ${wasmFile} not found`,
      fix: 'Build the WASM module: cd wasm4pm && npm run build',
    };
  }
}

/** Try to actually load the WASM module and call get_version() */
async function checkWasmLoads(): Promise<CheckResult> {
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return {
      name: 'WASM loads',
      status: 'fail',
      message: 'Skipped — pkg/ directory not found',
      fix: 'Run from inside the wasm4pm workspace',
    };
  }

  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return {
      name: 'WASM loads',
      status: 'fail',
      message: 'wasm4pm.js not found — module not built',
      fix: 'cd wasm4pm && npm run build',
    };
  }

  try {
    // Dynamic import with a file:// URL so it works regardless of cwd
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);

    // get_version() is a free function exported by the WASM module
    if (typeof mod.get_version === 'function') {
      const v: string = mod.get_version();
      return { name: 'WASM loads', status: 'ok', message: `Loaded OK — module version ${v}` };
    }

    return { name: 'WASM loads', status: 'ok', message: 'Loaded OK (get_version not exported)' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'WASM loads',
      status: 'fail',
      message: `Failed to import WASM module: ${msg}`,
      fix: 'Rebuild with: cd wasm4pm && npm run build',
    };
  }
}

/** Look for a pmctl config file (wasm4pm.toml / wasm4pm.json) in cwd or ancestors */
async function checkConfigFound(): Promise<CheckResult> {
  const configNames = ['wasm4pm.toml', 'wasm4pm.json', 'pmctl.toml', 'pmctl.json'];
  const cwd = process.cwd();

  // Search cwd and up to 3 parent directories
  const searchDirs: string[] = [cwd];
  let current = cwd;
  for (let i = 0; i < 3; i++) {
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    searchDirs.push(parent);
    current = parent;
  }

  for (const dir of searchDirs) {
    for (const name of configNames) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) {
        const relative = path.relative(cwd, candidate) || name;
        return {
          name: 'Config file',
          status: 'ok',
          message: `Found ${relative}`,
        };
      }
    }
  }

  return {
    name: 'Config file',
    status: 'warn',
    message: 'No wasm4pm.toml / wasm4pm.json found in current directory or parents',
    fix: 'Create a config with: pmctl init    (defaults work fine without one)',
  };
}

/**
 * Scan current directory (up to depth 2) for XES files.
 * If none found, it is a warning (not a hard failure — user may pass --input explicitly).
 */
async function checkXesFiles(): Promise<CheckResult> {
  const cwd = process.cwd();
  const found: string[] = [];

  async function scanDir(dir: string, depth: number): Promise<void> {
    if (depth > 2) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      if (name.startsWith('.') || name === 'node_modules') continue;
      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        await scanDir(fullPath, depth + 1);
      } else if (entry.isFile() && name.endsWith('.xes')) {
        found.push(path.relative(cwd, fullPath));
      }
    }
  }

  await scanDir(cwd, 0);

  if (found.length === 0) {
    return {
      name: 'XES event logs',
      status: 'warn',
      message: 'No .xes files found in current directory (depth ≤ 2)',
      fix: 'Place an XES event log here, or pass --input <path> to pmctl run/predict',
    };
  }

  const preview = found.slice(0, 3).join(', ') + (found.length > 3 ? ` (+${found.length - 3} more)` : '');
  return {
    name: 'XES event logs',
    status: 'ok',
    message: `${found.length} file(s): ${preview}`,
  };
}

/** Check that enough free memory is available (warn below 256 MB) */
async function checkSystemMemory(): Promise<CheckResult> {
  const freeMb = os.freemem() / 1024 / 1024;
  const totalMb = os.totalmem() / 1024 / 1024;
  const pct = ((freeMb / totalMb) * 100).toFixed(0);

  if (freeMb < 128) {
    return {
      name: 'System memory',
      status: 'warn',
      message: `Low free memory: ${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}%)`,
      fix: 'Close other applications; process mining on large logs requires ≥ 256 MB free',
    };
  }

  return {
    name: 'System memory',
    status: 'ok',
    message: `${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB total (${pct}% free)`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Walk up from cwd until a workspace marker is found, return wasm4pm/pkg/ path */
async function resolveWasmPkgDir(): Promise<string | null> {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    // pnpm-workspace.yaml is the definitive workspace root marker
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const candidate = path.join(dir, 'wasm4pm', 'pkg');
      return candidate;
    }
    // Also accept a package.json whose name is "@wasm4pm/root" or "wasm4pm"
    const pkgJson = path.join(dir, 'package.json');
    if (existsSync(pkgJson)) {
      try {
        const raw = await fs.readFile(pkgJson, 'utf-8');
        const pkg = JSON.parse(raw) as { name?: string; workspaces?: unknown };
        if (pkg.name === 'wasm4pm' || pkg.name === '@wasm4pm/root') {
          const candidate = path.join(dir, 'wasm4pm', 'pkg');
          return candidate;
        }
      } catch {
        // ignore parse errors
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────────────────

const BADGE = {
  ok: '  ok  ',
  warn: ' warn ',
  fail: ' FAIL ',
} as const;

function renderBadge(status: CheckResult['status']): string {
  // We output plain text that works without ANSI support; keep it readable
  return `[${BADGE[status]}]`;
}

function printReport(formatter: HumanFormatter, report: DoctorReport): void {
  formatter.log('');
  formatter.log('pmctl doctor — system health check');
  formatter.log('─'.repeat(58));

  for (const check of report.checks) {
    const badge = renderBadge(check.status);
    formatter.log(`${badge}  ${check.name}`);
    formatter.log(`         ${check.message}`);
    if (check.fix && check.status !== 'ok') {
      formatter.log(`         Fix: ${check.fix}`);
    }
    formatter.log('');
  }

  formatter.log('─'.repeat(58));
  formatter.log(`Result: ${report.ok} ok  ${report.warn} warn  ${report.fail} fail`);
  formatter.log('');

  if (report.healthy) {
    formatter.success('All required checks passed. pmctl is ready to use.');
  } else {
    formatter.error('One or more required checks failed. Fix the issues above and re-run: pmctl doctor');
  }
  formatter.log('');
}

// ────────────────────────────────────────────────────────────────────────────
// Command definition
// ────────────────────────────────────────────────────────────────────────────

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check environment health and print a fix guide for any issues found',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show all checks including passing ones',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    // Run all checks in parallel (they are independent)
    const [nodeCheck, wasmBinaryCheck, wasmLoadsCheck, configCheck, xesCheck, memoryCheck] =
      await Promise.all([
        checkNodeVersion(),
        checkWasmBinary(),
        checkWasmLoads(),
        checkConfigFound(),
        checkXesFiles(),
        checkSystemMemory(),
      ]);

    const checks: CheckResult[] = [
      nodeCheck,
      wasmBinaryCheck,
      wasmLoadsCheck,
      configCheck,
      xesCheck,
      memoryCheck,
    ];

    const report: DoctorReport = {
      checks,
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      // Warnings are advisory; only failures block usage
      healthy: checks.every((c) => c.status !== 'fail'),
    };

    if (formatter instanceof JSONFormatter) {
      if (report.healthy) {
        formatter.success('pmctl environment is healthy', {
          ...report,
          checks: report.checks.map((c) => ({ ...c })),
        });
      } else {
        formatter.warn('pmctl environment has issues', {
          ...report,
          checks: report.checks.map((c) => ({ ...c })),
        });
      }
    } else {
      printReport(formatter as HumanFormatter, report);
    }

    // Exit 0 when healthy (even with warnings), 1 when there are failures
    process.exit(report.healthy ? EXIT_CODES.success : EXIT_CODES.config_error);
  },
});
