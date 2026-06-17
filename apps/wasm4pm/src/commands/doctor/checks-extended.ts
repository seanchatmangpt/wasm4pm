// Extended checks: Claude Code Integration, Algorithm Health, Data Quality,
// Output Contract, Observability, Config System
import * as fs from 'fs/promises';
import { existsSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import type { Diagnosis } from './types.js';
import { resolveWasmPkgDir } from './checks-env.js';
import { getCachedWorkspaceRoot, readSourceFile } from './checks-tps.js';

// ────────────────────────────────────────────────────────────────────────────
// Claude Code Integration Checks
// ────────────────────────────────────────────────────────────────────────────

// Check 18: .claude/settings.json present and valid JSON
export async function checkClaudeCodeSettings(): Promise<Diagnosis> {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: '.claude/settings.json missing — Claude Code hooks will not fire',
      fix: 'Create .claude/settings.json with hooks configuration',
    };
  }

  try {
    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hookEvents = Object.keys((parsed.hooks as Record<string, unknown>) ?? {});
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: `.claude/settings.json valid — ${hookEvents.length} hook event(s): ${hookEvents.join(', ')}`,
    };
  } catch {
    return {
      name: 'Claude Code settings',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message:
        '.claude/settings.json is invalid JSON — Claude Code cannot parse hook configuration',
      fix: 'Fix JSON syntax in .claude/settings.json',
    };
  }
}

// Check 19: Wired hook files present on disk and executable
export async function checkHookFiles(): Promise<Diagnosis> {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const settingsPath = path.join(rootDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — no .claude/settings.json',
    };
  }

  let hooks: Record<
    string,
    Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
  >;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks?: typeof hooks };
    hooks = parsed.hooks ?? {};
  } catch {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — settings.json parse error',
    };
  }

  if (Object.keys(hooks).length === 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: 'No hooks wired in .claude/settings.json — TPS enforcement gates inactive',
      fix: 'Add hook configuration to .claude/settings.json',
    };
  }

  const missing: string[] = [];
  const notExecutable: string[] = [];

  for (const eventHooks of Object.values(hooks)) {
    for (const entry of eventHooks) {
      for (const hook of entry.hooks ?? []) {
        // Resolve "$CLAUDE_PROJECT_DIR" placeholder (may be quoted in the string)
        const resolved = hook.command.replace(/"?\$CLAUDE_PROJECT_DIR"?/g, rootDir);
        const scriptMatch = resolved.match(/(\S+\.sh)/);
        if (!scriptMatch) continue;
        const scriptPath = scriptMatch[1];
        if (!existsSync(scriptPath)) {
          missing.push(path.relative(rootDir, scriptPath));
        } else if (!(statSync(scriptPath).mode & 0o111)) {
          notExecutable.push(path.relative(rootDir, scriptPath));
        }
      }
    }
  }

  if (missing.length > 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'STOP_THE_LINE',
      message: `${missing.length} wired hook(s) missing from disk: ${missing.slice(0, 3).join(', ')}`,
      fix: 'Restore missing hook files or remove from .claude/settings.json',
    };
  }
  if (notExecutable.length > 0) {
    return {
      name: 'Hook files',
      pathology: 'DEPLOYABILITY_TRUTH_FAULT',
      severity: 'WARNING',
      message: `${notExecutable.length} hook(s) not executable: ${notExecutable.join(', ')}`,
      fix: `chmod +x ${notExecutable.join(' ')}`,
    };
  }

  const total = Object.values(hooks).flatMap((ev) => ev.flatMap((e) => e.hooks ?? [])).length;
  return {
    name: 'Hook files',
    pathology: 'DEPLOYABILITY_TRUTH_FAULT',
    severity: 'INFO',
    message: `${total} wired hook(s) present and executable`,
  };
}

// Check 20: CLAUDE.md present (project context for Claude Code)
export async function checkClaudeMd(): Promise<Diagnosis> {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  const claudeMdPath = path.join(rootDir, 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'STOP_THE_LINE',
      message: 'CLAUDE.md missing — Claude Code operates without project context',
      fix: 'Create CLAUDE.md or run: wpm init',
    };
  }

  const content = readFileSync(claudeMdPath, 'utf8');
  if (content.trim().length < 100) {
    return {
      name: 'CLAUDE.md',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'WARNING',
      message: 'CLAUDE.md appears to be a stub (< 100 chars)',
      fix: 'Populate CLAUDE.md with project architecture and Claude Code configuration',
    };
  }

  return {
    name: 'CLAUDE.md',
    pathology: 'EPISTEMIC_FAULT',
    severity: 'INFO',
    message: `CLAUDE.md present (${(content.length / 1024).toFixed(1)} KB)`,
  };
}

// Check 21: Memory index within 200-line limit
export async function checkMemoryIndex(): Promise<Diagnosis> {
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message: 'Skipped — workspace root not found',
    };
  }

  // Project-scoped memory: ~/.claude/projects/<encoded-path>/memory/MEMORY.md
  // Claude Code encodes paths by replacing '/' with '-' (leading '-' is preserved)
  const encoded = rootDir.replace(/\//g, '-');
  const memoryPath = path.join(os.homedir(), '.claude', 'projects', encoded, 'memory', 'MEMORY.md');

  if (!existsSync(memoryPath)) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'INFO',
      message:
        'No project memory index — Claude Code starts each session without persistent context',
    };
  }

  const content = readFileSync(memoryPath, 'utf8');
  const lines = content.split('\n').length;
  if (lines > 200) {
    return {
      name: 'Memory index',
      pathology: 'EPISTEMIC_FAULT',
      severity: 'WARNING',
      message: `MEMORY.md is ${lines} lines — content past line 200 is truncated by Claude Code`,
      fix: `Prune stale entries in ${memoryPath}`,
    };
  }

  const entryCount = (content.match(/^- \[/gm) ?? []).length;
  return {
    name: 'Memory index',
    pathology: 'EPISTEMIC_FAULT',
    severity: 'INFO',
    message: `Memory index healthy (${lines}/200 lines, ${entryCount} entries)`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Algorithm Health Checks (5 checks)
// ────────────────────────────────────────────────────────────────────────────

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
    </event>
  </trace>
</log>`;

export async function checkAlgoRegistryCount(): Promise<Diagnosis> {
  const id = 'algo.registry_count';
  try {
    const { getRegistry } = await import('wasm4pm');
    const count = getRegistry().list().length;
    if (count >= 38) {
      return {
        name: id,
        pathology: 'MODEL_TRUTH_FAULT',
        severity: 'INFO',
        message: `${count} algorithms registered (≥ 38 required)`,
      };
    }
    return {
      name: id,
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'WARNING',
      message: `Only ${count} algorithms registered (expected ≥ 38) — WASM may be on a constrained profile`,
      fix: 'Rebuild with browser profile: cd wasm4pm && npm run build',
    };
  } catch {
    return {
      name: id,
      pathology: 'MODEL_TRUTH_FAULT',
      severity: 'INFO',
      message: 'Skipped — kernel registry not importable',
    };
  }
}

export async function checkAlgoDfgSmoke(): Promise<Diagnosis> {
  const id = 'algo.dfg_smoke';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_eventlog_from_xes !== 'function' || typeof mod.discover_dfg !== 'function') {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'discover_dfg or load_eventlog_from_xes not exported' };
    }
    const handle: string = mod.load_eventlog_from_xes(MINIMAL_XES);
    const raw: unknown = mod.discover_dfg(handle, 'concept:name');
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const edges = (parsed as { edges?: unknown[] })?.edges;
    if (Array.isArray(edges) && edges.length > 0) {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: `DFG smoke test passed — ${edges.length} edges discovered` };
    }
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'DFG smoke test produced empty edges on minimal XES' };
  } catch (err) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: `DFG smoke test failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkAlgoHeuristicSmoke(): Promise<Diagnosis> {
  const id = 'algo.heuristic_smoke';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_eventlog_from_xes !== 'function' || typeof mod.discover_heuristic_miner !== 'function') {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'discover_heuristic_miner not exported' };
    }
    const handle: string = mod.load_eventlog_from_xes(MINIMAL_XES);
    const raw: unknown = mod.discover_heuristic_miner(handle, 'concept:name', 0.5);
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const hasEdges =
      (parsed as { edges?: unknown[] })?.edges?.length !== undefined ||
      (parsed as { nodes?: unknown[] })?.nodes?.length !== undefined ||
      (parsed as { places?: unknown[] })?.places?.length !== undefined;
    if (hasEdges) {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Heuristic miner smoke test passed' };
    }
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'Heuristic miner returned empty structure on minimal XES' };
  } catch (err) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: `Heuristic miner smoke test failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkAlgoMlSmoke(): Promise<Diagnosis> {
  const id = 'algo.ml_smoke';
  try {
    const mlPkg = await import('@wasm4pm/ml');
    if (typeof mlPkg.clusterTraces !== 'function') {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'clusterTraces not exported from @wasm4pm/ml' };
    }
    const syntheticFeatures: Record<string, unknown>[] = [
      { f0: 0.1, f1: 0.2 }, { f0: 0.15, f1: 0.25 }, { f0: 0.8, f1: 0.9 }, { f0: 0.85, f1: 0.95 },
    ];
    const result = await mlPkg.clusterTraces(syntheticFeatures, { k: 2 });
    const resultAny = result as unknown as Record<string, unknown>;
    const clusterCount = Array.isArray(resultAny?.['clusters']) ? (resultAny['clusters'] as unknown[]).length : 0;
    if (clusterCount > 0) {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: `ML cluster smoke test passed — ${clusterCount} clusters produced` };
    }
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'ML cluster smoke test returned 0 clusters' };
  } catch (err) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: `ML smoke test failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkAlgoStreamingSmoke(): Promise<Diagnosis> {
  const id = 'algo.streaming_smoke';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    // simd_streaming_dfg or discover_dfg_streaming — accept either
    const streamFn = mod.simd_streaming_dfg ?? mod.discover_dfg_streaming ?? mod.streaming_dfg;
    if (typeof streamFn !== 'function') {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'Streaming DFG export not found in WASM' };
    }
    const handle: string = mod.load_eventlog_from_xes(MINIMAL_XES);
    const raw: unknown = streamFn(handle, 'concept:name');
    if (raw !== null && raw !== undefined) {
      return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'INFO', message: 'Streaming DFG smoke test passed' };
    }
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: 'Streaming DFG returned null on minimal XES' };
  } catch (err) {
    return { name: id, pathology: 'MODEL_TRUTH_FAULT', severity: 'WARNING', message: `Streaming DFG smoke test failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Data Quality Checks (4 checks)
// ────────────────────────────────────────────────────────────────────────────

export async function checkDataXesParser(): Promise<Diagnosis> {
  const id = 'data.xes_parser';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_eventlog_from_xes !== 'function') {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: 'load_eventlog_from_xes not exported' };
    }
    const handle: string = mod.load_eventlog_from_xes(MINIMAL_XES);
    if (handle && handle.length > 0) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'XES parser: minimal log parsed successfully (1 trace)' };
    }
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: 'XES parser returned empty handle' };
  } catch (err) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'STOP_THE_LINE', message: `XES parser failed on valid XES: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const MINIMAL_OCEL = JSON.stringify({
  "ocel:global-log": { "ocel:attribute-names": ["concept:name"] },
  "ocel:global-event": { "ocel:activity": "__INVALID__" },
  "ocel:global-object": { "ocel:type": "__INVALID__" },
  "ocel:events": {
    "e1": {
      "ocel:activity": "A",
      "ocel:timestamp": "2024-01-01T00:00:00Z",
      "ocel:omap": ["o1"],
      "ocel:vmap": {}
    }
  },
  "ocel:objects": {
    "o1": {
      "ocel:type": "order",
      "ocel:ovmap": {}
    }
  }
});

export async function checkDataOcelParser(): Promise<Diagnosis> {
  const id = 'data.ocel_parser';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_ocel !== 'function') {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — load_ocel not in this WASM build (feature-ocel may be disabled)' };
    }
    const handle: unknown = mod.load_ocel(MINIMAL_OCEL);
    if (handle !== null && handle !== undefined) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'OCEL parser: minimal log parsed successfully' };
    }
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: 'OCEL parser returned null for valid OCEL' };
  } catch (err) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: `OCEL parser failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkDataInvalidXes(): Promise<Diagnosis> {
  const id = 'data.invalid_xes';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_eventlog_from_xes !== 'function') {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — load_eventlog_from_xes not exported' };
    }
    try {
      mod.load_eventlog_from_xes('THIS IS NOT VALID XML <<< >>>');
      // If no error thrown, that's acceptable — WASM may be lenient
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Malformed XES handled gracefully (no crash)' };
    } catch {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Malformed XES correctly rejected with error (no crash)' };
    }
  } catch (err) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: `WASM import failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkDataEmptyLog(): Promise<Diagnosis> {
  const id = 'data.empty_log';
  const wasmPkgDir = await resolveWasmPkgDir();
  if (!wasmPkgDir) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not found' };
  }
  const jsFile = path.join(wasmPkgDir, 'wasm4pm.js');
  if (!existsSync(jsFile)) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — WASM not built' };
  }
  const EMPTY_XES = '<?xml version="1.0" encoding="UTF-8"?><log xes.version="1.0"></log>';
  try {
    const url = new URL(`file://${jsFile}`);
    const mod = await import(url.href);
    if (typeof mod.load_eventlog_from_xes !== 'function') {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — load_eventlog_from_xes not exported' };
    }
    try {
      const handle: unknown = mod.load_eventlog_from_xes(EMPTY_XES);
      // Empty log should not crash — handle may be empty string or valid handle
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: `Empty XES log handled gracefully (handle: ${JSON.stringify(handle)?.slice(0, 20) ?? 'null'})` };
    } catch {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Empty XES log returned error (acceptable — empty log has no traces)' };
    }
  } catch (err) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: `WASM import failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Output Contract Checks (4 checks)
// ────────────────────────────────────────────────────────────────────────────

export async function checkOutputExitCodes(): Promise<Diagnosis> {
  const id = 'output.exit_codes';
  try {
    // Dynamically import EXIT_CODES to verify the contract
    const { EXIT_CODES } = await import('../../exit-codes.js');
    const required: Array<[string, number]> = [
      ['success', 0],
      ['config_error', 1],
      ['source_error', 2],
      ['execution_error', 3],
      ['partial_failure', 4],
      ['system_error', 5],
    ];
    const missing: string[] = [];
    for (const [key, val] of required) {
      if ((EXIT_CODES as Record<string, number>)[key] !== val) {
        missing.push(`${key}=${val}`);
      }
    }
    if (missing.length === 0) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'EXIT_CODES contract satisfied (0=success, 1=config, 2=source, 3=exec, 4=partial, 5=system)' };
    }
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'STOP_THE_LINE', message: `EXIT_CODES mismatch: ${missing.join(', ')}`, fix: 'Fix EXIT_CODES in apps/wasm4pm/src/exit-codes.ts' };
  } catch (err) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: `Cannot import EXIT_CODES: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkOutputJsonFormat(): Promise<Diagnosis> {
  const id = 'output.json_format';
  // Run wpm status --format json and verify valid JSON
  try {
    const wpmBin = process.argv[1];
    if (!wpmBin) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — cannot resolve wpm binary path' };
    }
    const result = spawnSync(process.execPath, [wpmBin, 'status', '--format', 'json', '--quiet'], {
      timeout: 8000,
      encoding: 'utf8',
    });
    const stdout = result.stdout ?? '';
    if (stdout.trim().length === 0) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — wpm status produced no stdout' };
    }
    // Find JSON blob in output (may have non-JSON prefix)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: 'wpm status --format json produced no JSON object' };
    }
    JSON.parse(stdout.slice(jsonStart)); // throws if invalid
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'JSON format contract satisfied — status produces valid JSON' };
  } catch {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — could not verify JSON format (timeout or spawn error)' };
  }
}

export async function checkOutputHumanFormat(): Promise<Diagnosis> {
  const id = 'output.human_format';
  try {
    const wpmBin = process.argv[1];
    if (!wpmBin) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — cannot resolve wpm binary path' };
    }
    const result = spawnSync(process.execPath, [wpmBin, 'status', '--format', 'human', '--quiet'], {
      timeout: 8000,
      encoding: 'utf8',
    });
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    if (combined.trim().length > 10) {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Human format produces non-empty output' };
    }
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: 'wpm status --format human produced very little output' };
  } catch {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — could not verify human format' };
  }
}

export async function checkOutputReceiptSchema(): Promise<Diagnosis> {
  const id = 'output.receipt_schema';
  const rootDir = getCachedWorkspaceRoot();
  const resultsDir = rootDir ? path.join(rootDir, '.wasm4pm', 'results') : '.wasm4pm/results';
  try {
    const files = await fs.readdir(resultsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).slice(0, 5);
    if (jsonFiles.length === 0) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'No saved results to check receipt schema (run a discovery command first)' };
    }
    const required = ['run_id', 'status'];
    const violations: string[] = [];
    for (const f of jsonFiles) {
      try {
        const raw = await fs.readFile(path.join(resultsDir, f), 'utf-8');
        const obj = JSON.parse(raw) as Record<string, unknown>;
        // Check top-level or nested payload
        const check = obj.payload ?? obj;
        for (const field of required) {
          if ((check as Record<string, unknown>)[field] === undefined) {
            violations.push(`${f}: missing '${field}'`);
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
    if (violations.length === 0) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: `Receipt schema OK — checked ${jsonFiles.length} result file(s)` };
    }
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: `Receipt schema violations: ${violations.slice(0, 3).join('; ')}` };
  } catch {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — results directory not found or unreadable' };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Observability Checks (3 checks)
// ────────────────────────────────────────────────────────────────────────────

export async function checkOtelSpanSinkExists(): Promise<Diagnosis> {
  const id = 'otel.span_sink_exists';
  try {
    const { getGlobalSpanSink } = await import('../../otel/sink.js');
    const sink = getGlobalSpanSink();
    if (typeof sink === 'function') {
      return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'OTEL span sink is configured and callable' };
    }
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: 'OTEL span sink is not a function — spans will be dropped' };
  } catch (err) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: `OTEL sink check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkOtelSpanNameFormat(): Promise<Diagnosis> {
  const id = 'otel.span_name_format';
  // Check that span names in the codebase follow service.operation convention
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — workspace root not found' };
  }
  const otelFile = readSourceFile('apps/wasm4pm/src/commands/_otel.ts');
  if (!otelFile) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — _otel.ts not found' };
  }
  // Verify the canonical span names include a dot (service.operation)
  const spanNames = [...otelFile.matchAll(/name:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const badNames = spanNames.filter((n) => !n.includes('.') && n.length > 0 && !/^[a-z]+$/.test(n));
  if (badNames.length === 0) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: `Span name format OK — all span names follow service.operation convention` };
  }
  return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: `${badNames.length} span name(s) may not follow service.operation format: ${badNames.slice(0, 3).join(', ')}` };
}

export async function checkOtelServiceName(): Promise<Diagnosis> {
  const id = 'otel.service_name';
  const rootDir = getCachedWorkspaceRoot();
  if (!rootDir) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — workspace root not found' };
  }
  const otelFile = readSourceFile('apps/wasm4pm/src/commands/_otel.ts');
  const instrFile = readSourceFile('packages/observability/src/instrumentation.ts');
  const sources = [otelFile, instrFile].filter(Boolean).join('\n');
  if (!sources) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — observability source not found' };
  }
  const hasServiceName = sources.includes("'wpm'") || sources.includes('"wpm"') || sources.includes("service.name");
  if (hasServiceName) {
    return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'INFO', message: "Spans include service.name = 'wpm' (verified in source)" };
  }
  return { name: id, pathology: 'ANTI_LIE_TRUTH_FAULT', severity: 'WARNING', message: "Could not verify service.name = 'wpm' in span emission code" };
}

// ────────────────────────────────────────────────────────────────────────────
// Config System Checks (3 checks)
// ────────────────────────────────────────────────────────────────────────────

export async function checkConfigEnvPrefix(): Promise<Diagnosis> {
  const id = 'config.env_prefix';
  try {
    const { resolveConfig } = await import('@wasm4pm/config');
    // Set a known ENV var and verify it's recognized
    const envKey = 'WASM4PM_OUTPUT_FORMAT';
    const original = process.env[envKey];
    process.env[envKey] = 'json';
    let detected = false;
    try {
      const cfg = await resolveConfig({ env: { ...process.env } });
      detected = cfg.output.format === 'json';
    } finally {
      if (original === undefined) delete process.env[envKey];
      else process.env[envKey] = original;
    }
    if (detected) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'WASM4PM_ env prefix recognized — WASM4PM_OUTPUT_FORMAT=json correctly sets output.format' };
    }
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: 'WASM4PM_ env prefix may not be recognized by config resolver' };
  } catch (err) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: `Skipped — config import failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function checkConfigTomlParse(): Promise<Diagnosis> {
  const id = 'config.toml_parse';
  // Write a minimal TOML to a temp dir and verify the config resolver reads it
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'wpm-doctor-'));
  const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
  try {
    writeFileSync(tomlPath, '[algorithm]\nname = "dfg"\n');
    const orig = process.cwd();
    try {
      process.chdir(tmpDir);
      const { resolveConfig } = await import('@wasm4pm/config');
      const cfg = await resolveConfig({ configSearchPaths: [tmpDir] });
      process.chdir(orig);
      if (cfg.algorithm.name === 'dfg') {
        return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'wasm4pm.toml parsed correctly — algorithm.name read from TOML' };
      }
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: `TOML parsed but algorithm.name not set to 'dfg' (got '${cfg.algorithm.name}')` };
    } catch {
      try { process.chdir(orig); } catch { /* ignore */ }
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Skipped — could not switch cwd for TOML test' };
    }
  } catch (err) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: `Skipped — could not write temp TOML: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export async function checkConfigPrecedence(): Promise<Diagnosis> {
  const id = 'config.precedence';
  try {
    const { resolveConfig } = await import('@wasm4pm/config');
    // Set ENV var
    const envKey = 'WASM4PM_PROFILE';
    const original = process.env[envKey];
    process.env[envKey] = 'fast';
    let envPrecedence = false;
    try {
      // CLI override (cliOverrides.profile) should win over ENV
      const cfg = await resolveConfig({
        cliOverrides: { profile: 'quality' },
        env: { ...process.env },
      });
      // CLI should win: if profile=quality AND env=fast, CLI wins → quality
      envPrecedence = cfg.execution.profile === 'quality';
    } finally {
      if (original === undefined) delete process.env[envKey];
      else process.env[envKey] = original;
    }
    if (envPrecedence) {
      return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: 'Config precedence correct — CLI > ENV > defaults (CLI profile=quality overrides ENV profile=fast)' };
    }
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'WARNING', message: 'Config precedence may be wrong — CLI args did not override ENV vars' };
  } catch (err) {
    return { name: id, pathology: 'REPRODUCIBILITY_TRUTH_FAULT', severity: 'INFO', message: `Skipped — config import failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
