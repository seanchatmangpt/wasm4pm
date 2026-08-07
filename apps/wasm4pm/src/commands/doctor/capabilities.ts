import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { blake3Hex } from '../../receipts/_shared.js';
import {
  ALGO_HEALTH_CHECKS,
  CLAUDE_CODE_CHECKS,
  CONFIG_SYSTEM_CHECKS,
  DATA_QUALITY_CHECKS,
  ENV_CHECKS,
  OBSERVABILITY_CHECKS,
  OUTPUT_CONTRACT_CHECKS,
  TPS_CHECKS,
} from './checks-arrays.js';
import {
  checkDoctorRepairBroker,
  checkReleaseCertificateClosure,
} from './safe-checks.js';
import { checkOcelPowlWasmSession } from './session-check.js';
import { checkAatLiveRuntime } from './aat-live-check.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import {
  evaluateVision2030,
  type CapabilityDefinition,
  type Vision2030Report,
  type Vision2030Subject,
} from './vision2030.js';

/**
 * Vision 2030 is represented as an executable capability graph, not a slogan.
 * Ceilings encode where current checks prove a rail exists but do not yet prove
 * its complete runtime composition or replay closure.
 */
export const VISION_2030_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    id: 'environment-substrate',
    label: 'Environment substrate',
    description: 'Node, package manager, WASM artifact, toolchain, workspace, and writable evidence surfaces.',
    checks: ENV_CHECKS,
    failureStanding: 'BUILD_BROKEN',
  },
  {
    id: 'process-route-law',
    label: 'Process route law',
    description: 'Step types, registry consistency, state-machine integrity, profiles, and canonical naming.',
    checks: TPS_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'developer-experience',
    label: 'Developer experience',
    description: 'Agent settings, hooks, operating doctrine, and memory/index surfaces.',
    checks: CLAUDE_CODE_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'algorithm-runtime',
    label: 'Algorithm runtime',
    description: 'Registry and representative DFG, heuristic, ML, and streaming execution surfaces.',
    checks: ALGO_HEALTH_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'real-data-boundaries',
    label: 'Real data boundaries',
    description: 'XES and OCEL parsing plus invalid and empty-log refusal behavior.',
    checks: DATA_QUALITY_CHECKS,
  },
  {
    id: 'receipt-contract',
    label: 'Receipt contract',
    description: 'Exit codes, machine/human projections, and receipt schema integrity.',
    checks: OUTPUT_CONTRACT_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'observability-contract',
    label: 'Observability contract',
    description: 'OTEL sink, span naming, and service identity.',
    checks: OBSERVABILITY_CHECKS,
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'configuration-admission',
    label: 'Configuration admission',
    description: 'Environment prefix, TOML parse, and precedence behavior.',
    checks: CONFIG_SYSTEM_CHECKS,
  },
  {
    id: 'brce-repair-admission',
    label: 'BRCE repair admission',
    description: 'Structured, shell-free repair intents with mandatory pre-actuation and outcome receipts.',
    checks: [checkDoctorRepairBroker],
    ceiling: 'PARTIAL_ALIVE',
  },
  {
    id: 'ocel-powl-wasm-session',
    label: 'OCEL → POWL → WASM session',
    description: 'One admitted runtime session composes object-centric input, process semantics, WASM execution, and replay.',
    checks: [checkOcelPowlWasmSession],
  },
  {
    id: 'aat-live-runtime',
    label: 'AAT-Live admission runtime',
    description: 'Signed AAT observations, Weaver vocabulary evidence, POWL route, wasm4pm release identity, MCP+ proof, passport, and replay.',
    checks: [checkAatLiveRuntime],
  },
  {
    id: 'release-certificate-closure',
    label: 'Release certificate closure',
    description: 'Package, WASM bundle, examples, behavior evidence, and certificate hashes recompute against one commit.',
    checks: [checkReleaseCertificateClosure],
  },
] as const;

function readPackageVersion(root: string): string | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(root, 'apps', 'wasm4pm', 'package.json'), 'utf8')
    ) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function exactCommit(root: string): string | null {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
  } catch {
    const fromEnvironment = process.env.GITHUB_SHA ?? process.env.WASM4PM_GIT_COMMIT;
    return fromEnvironment && /^[0-9a-f]{40}$/.test(fromEnvironment)
      ? fromEnvironment
      : null;
  }
}

export function resolveVision2030Subject(): Vision2030Subject {
  const root = resolveWorkspaceRoot();
  const commit = root ? exactCommit(root) : null;
  return {
    repository: 'seanchatmangpt/wasm4pm',
    git_commit: commit,
    package_version: root ? readPackageVersion(root) : null,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    admitted: Boolean(root && commit),
    limitation: root
      ? commit
        ? undefined
        : 'Workspace found, but exact Git commit identity could not be resolved.'
      : 'Workspace root not found; the audited subject is not admitted.',
  };
}

export async function runVision2030Audit(options: {
  readonly only?: readonly string[];
  readonly now?: () => Date;
  readonly subject?: Vision2030Subject;
} = {}): Promise<Vision2030Report> {
  return evaluateVision2030(VISION_2030_CAPABILITIES, blake3Hex, {
    ...options,
    subject: options.subject ?? resolveVision2030Subject(),
  });
}
