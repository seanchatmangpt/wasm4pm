/**
 * UX Gap Fixes Module
 *
 * Addresses 5 critical CLI usability gaps:
 * 1. Vague error messages (WASM, modules, validation)
 * 2. Missing warning severity levels in JSON
 * 3. No shell completion hints
 * 4. Algorithm jargon clarity (tier vs profile)
 * 5. Log quality context warnings
 */

// Optional OTEL integration for observability
let getActiveSpan: (() => any) | null = null;
try {
  const otel = require('@opentelemetry/api');
  getActiveSpan = otel.tracing?.getActiveSpan;
} catch {
  // OTEL not available in test environment
}

// ─── Gap 1: Enriched Error Messages ────────────────────────────────────────

export interface EnrichedErrorContext {
  operation: string;          // What operation failed (e.g., "wasm_memory_init")
  rootCause: string;          // Why it failed (e.g., "memory buffer unmapped")
  severity: 'recoverable' | 'fatal';
  affectedData?: {
    type: string;             // e.g., "memory", "config", "log"
    identifier?: string;      // e.g., offset, filename, log name
    expected?: string | number;
    actual?: string | number;
    bytesNeeded?: number;     // e.g., bytes required for allocation
  };
  suggestedActions: string[]; // Ordered list of concrete steps (run X, check Y, try Z)
  docsUrl?: string;
}

/**
 * Gap 1A: WASM Memory Errors
 * Replaces vague "WASM memory is inaccessible or empty" with actionable diagnostics
 */
export function enrichWasmMemoryError(
  cause: 'empty' | 'corrupted' | 'readonly' | 'allocation-failed',
  details?: { offset?: number; bytesNeeded?: number; nodeVersion?: string }
): EnrichedErrorContext {
  const span = getActiveSpan?.();

  const rootCauses: Record<typeof cause, string> = {
    empty: 'No memory buffer allocated. WasmLoader.init() may not have completed.',
    corrupted:
      'Memory buffer exists but is unmapped or corrupted. Usually indicates binary incompatibility.',
    readonly: 'Memory protection flags prevent write access. Check system/binary configuration.',
    'allocation-failed': `Insufficient contiguous memory. System has limited free RAM.`,
  };

  const suggestions: Record<typeof cause, string[]> = {
    empty: [
      'Ensure WasmLoader.init() is called before running any algorithm',
      'Run `wpm doctor` to diagnose initialization issues',
      'Check: npm list @wasm4pm/engine (should be installed)',
    ],
    corrupted: [
      'Try: npm reinstall @wasm4pm/engine',
      'Verify Node.js version matches (requires 16+)',
      'Run `wpm doctor` for full diagnostics',
    ],
    readonly: [
      'Check file permissions: chmod 755 node_modules/@wasm4pm/',
      'Verify SELinux/AppArmor policies allow WASM execution',
      'Run `wpm doctor --security-check`',
    ],
    'allocation-failed': [
      'Reduce dataset size (use smaller XES file)',
      'Increase available RAM or close other applications',
      'Try: --max-memory 512m to limit WASM heap',
    ],
  };

  span?.addEvent('ux_gap_1_wasm_error_enriched', {
    cause,
    offset: details?.offset?.toString(),
    nodeVersion: details?.nodeVersion,
  });

  return {
    operation: 'wasm_memory_initialization',
    rootCause: rootCauses[cause],
    severity: cause === 'empty' ? 'recoverable' : 'fatal',
    affectedData: {
      type: 'memory',
      identifier: `0x${(details?.offset ?? 0).toString(16)}`,
      bytesNeeded: details?.bytesNeeded,
    },
    suggestedActions: suggestions[cause],
    docsUrl: 'https://wasm4pm.dev/troubleshoot/wasm-memory',
  };
}

/**
 * Gap 1B: Module Loading Errors
 * Replaces vague "Module not loaded" with specific context
 */
export function enrichModuleLoadError(
  module: 'kernel' | 'cognition' | 'ml' | 'ml-classifier',
  context?: { state?: string; lastError?: string }
): EnrichedErrorContext {
  const span = getActiveSpan?.();

  const moduleDescriptions: Record<typeof module, string> = {
    kernel: 'Core WASM discovery engine',
    cognition: 'AI reasoning and proof generation module',
    ml: 'Machine learning analysis module',
    'ml-classifier': 'ML classification submodule',
  };

  const suggestions: Record<typeof module, string[]> = {
    kernel: [
      'Run: `wpm status` to check kernel state',
      'Try: `wpm doctor --verbose` for full diagnostics',
      'If unresponsive: wpm doctor --reset-cache',
    ],
    cognition: [
      'Check: npm list @wasm4pm/cognition (may be optional)',
      'For proof generation: ensure cognition module is installed',
      'Try: wpm proof audit --help',
    ],
    ml: [
      'ML module requires feature flag: feature-ml',
      'Try: wpm ml --help to list available tasks',
      'If error persists: wpm doctor',
    ],
    'ml-classifier': [
      'Run: wpm ml classify --help for required options',
      'Ensure input log has sufficient labeled traces (>100)',
      'Try: wpm ml classify -i log.xes --method knn --k 5',
    ],
  };

  span?.addEvent('ux_gap_1_module_error_enriched', {
    module,
    state: context?.state,
    hasLastError: !!context?.lastError,
  });

  return {
    operation: `${module}_module_load`,
    rootCause: `${moduleDescriptions[module]} not initialized. State: ${context?.state || 'unknown'}`,
    severity: 'recoverable',
    affectedData: {
      type: 'module',
      identifier: module,
    },
    suggestedActions: suggestions[module],
    docsUrl: `https://wasm4pm.dev/modules/${module}`,
  };
}

/**
 * Gap 1C: Validation Errors for ML Tasks
 * Replaces vague "Unhandled task" with options
 */
export function enrichTaskValidationError(
  invalidTask: string,
  validOptions: string[]
): EnrichedErrorContext {
  const span = getActiveSpan?.();
  const closest = findClosestMatch(invalidTask, validOptions);

  span?.addEvent('ux_gap_1_task_validation_error', {
    invalid_task: invalidTask,
    valid_count: validOptions.length,
    closest_match: closest,
  });

  return {
    operation: 'ml_task_validation',
    rootCause: `Task "${invalidTask}" is not supported. Valid tasks: ${validOptions.join(', ')}`,
    severity: 'recoverable',
    affectedData: {
      type: 'task',
      identifier: invalidTask,
      expected: validOptions[0],
      actual: invalidTask,
    },
    suggestedActions: [
      closest ? `Did you mean: wpm ml ${closest}` : `Available tasks: ${validOptions.join(', ')}`,
      `Try: wpm ml ${validOptions[0]} --help for usage`,
      `List all: wpm algorithms --tier ml`,
    ],
    docsUrl: 'https://wasm4pm.dev/commands/ml',
  };
}

// ─── Gap 2: Warning Severity Levels in JSON ────────────────────────────────

export type WarningLevel = 'info' | 'warn' | 'critical';

export interface StructuredWarning {
  code: string;               // Machine-readable (e.g., "LOW_EVENT_RATE")
  level: WarningLevel;        // Severity
  message: string;            // Human-readable
  metric?: {                  // Optional: quantified context
    name: string;
    value: number;
    threshold: number;
    unit?: string;
  };
  recommendedAction?: string; // What to do about it
  affectedComponent?: string; // What part of the system (e.g., "algorithm", "input_log")
}

/**
 * Gap 2: Warning collector for JSON output
 * Ensures CI/CD and monitoring tools can distinguish info/warn/critical
 */
export class WarningCollector {
  private warnings: StructuredWarning[] = [];

  addWarning(
    code: string,
    message: string,
    level: WarningLevel = 'warn',
    context?: Partial<StructuredWarning>
  ): void {
    const span = getActiveSpan?.();

    this.warnings.push({
      code,
      level,
      message,
      recommendedAction: context?.recommendedAction,
      metric: context?.metric,
      affectedComponent: context?.affectedComponent,
    });

    span?.addEvent(`warning_${level}`, { code, message });
  }

  getWarnings(): StructuredWarning[] {
    return [...this.warnings];
  }

  hasWarnings(minLevel: WarningLevel = 'warn'): boolean {
    const levels: Record<WarningLevel, number> = { info: 0, warn: 1, critical: 2 };
    return this.warnings.some((w) => levels[w.level] >= levels[minLevel]);
  }

  countByLevel(): Record<WarningLevel, number> {
    const counts: Record<WarningLevel, number> = { info: 0, warn: 0, critical: 0 };
    for (const w of this.warnings) {
      counts[w.level]++;
    }
    return counts;
  }

  // Gap 2A: Log quality warnings
  addLogQualityWarning(stats: {
    traceCount: number;
    eventRate: number;  // events/second
    uniqueActivities: number;
    avgTraceDuration: number; // seconds
  }): void {
    const warnings: Array<{ code: string; level: WarningLevel; message: string }> = [];

    if (stats.traceCount < 100) {
      warnings.push({
        code: 'LOW_TRACE_COUNT',
        level: 'warn',
        message: `Log has only ${stats.traceCount} traces; models may be overfitted`,
      });
    }

    if (stats.eventRate < 0.5) {
      warnings.push({
        code: 'LOW_EVENT_RATE',
        level: 'info',
        message: `Event rate is ${stats.eventRate.toFixed(2)} events/sec; discovery may be slow`,
      });
    }

    if (stats.uniqueActivities < 5) {
      warnings.push({
        code: 'SIMPLE_PROCESS',
        level: 'info',
        message: `Process has only ${stats.uniqueActivities} activities; consider detailed analysis`,
      });
    }

    if (stats.avgTraceDuration > 3600) {
      warnings.push({
        code: 'LONG_TRACES',
        level: 'warn',
        message: `Average trace duration is ${(stats.avgTraceDuration / 3600).toFixed(1)} hours; check for process drift`,
      });
    }

    for (const w of warnings) {
      this.addWarning(w.code, w.message, w.level, {
        affectedComponent: 'input_log',
        metric: {
          name: 'log_characteristics',
          value: stats.traceCount,
          threshold: 100,
        },
      });
    }
  }
}

// ─── Gap 3: Shell Completion Hints ────────────────────────────────────────

/**
 * Gap 3: Embed completion hints in error messages
 * Guides users to run `wpm completions install bash` when they get stuck
 */
export function getCompletionHint(
  shell = process.env.SHELL || ''
): string | undefined {
  const isInteractiveShell = shell.includes('bash') || shell.includes('zsh') || shell.includes('fish');
  if (!isInteractiveShell) return undefined;

  const shell_type = shell.includes('bash') ? 'bash' : shell.includes('zsh') ? 'zsh' : 'fish';

  return (
    `\n💡 Shell completion available. Install with:\n` +
    `   wpm completions install ${shell_type}\n` +
    `   source ~/.bashrc  # or ~/.zshrc / ~/.config/fish/config.fish`
  );
}

// ─── Gap 4: Algorithm Jargon Clarity ──────────────────────────────────────

/**
 * Gap 4: Explain tier vs profile terminology clearly
 */
export interface AlgorithmRecommendation {
  algorithm: string;
  tier: 'exploration' | 'daily' | 'conformance' | 'publication';
  speedScore: number; // 0-100
  qualityScore: number; // 0-100
  shortDescription: string;
  bestFor: string[];
  notBestFor?: string[];
  exampleCommand: string;
}

export function explainAlgorithmTiers(): string {
  return `
TIERS (use-case guidance):
  exploration  — First look at unfamiliar logs (fast, basic understanding)
  daily        — Routine operational analysis (balanced speed/quality)
  conformance  — Validate logs against known models (strict accuracy required)
  publication  — Final model for reports/papers (highest quality, slowest)

PROFILES (execution strategy):
  fast         — Minimal algorithms (dfg only, <1s)
  balanced     — Mix of speed/quality (heuristic miner + ML, <10s)
  quality      — Best algorithms (genetic + ILP, <60s)
  stream       — Continuous monitoring (low-latency, approximate)

EXAMPLE:
  # For exploration: fast algorithm, any profile
  wpm run log.xes --algorithm dfg --profile fast

  # For daily: balanced speed/quality
  wpm run log.xes --algorithm heuristic --profile balanced

  # For publication: best quality, regardless of time
  wpm run log.xes --algorithm ilp --profile quality
`;
}

// ─── Gap 5: Log Quality Context Warnings ─────────────────────────────────

/**
 * Gap 5: Contextualize quality metrics in human-readable warnings
 */
export function formatLogQualityContext(stats: {
  traceCount: number;
  eventCount: number;
  uniqueActivities: number;
  avgTraceDuration: number;
  minTraceDuration: number;
  maxTraceDuration: number;
  'variant count': number;
}): string {
  const lines: string[] = [
    '📊 Log Quality Context:',
    `   Traces: ${stats.traceCount} (${stats.traceCount < 100 ? '⚠️ small' : '✓ adequate'})`,
    `   Events: ${stats.eventCount} (${stats.eventCount / stats.traceCount} avg per trace)`,
    `   Activities: ${stats.uniqueActivities} (${stats.uniqueActivities < 10 ? '⚠️ simple' : '✓ realistic'})`,
    `   Duration: ${stats.minTraceDuration.toFixed(1)}s–${stats.maxTraceDuration.toFixed(1)}s ` +
      `(avg ${stats.avgTraceDuration.toFixed(1)}s)`,
    `   Variants: ${stats['variant count']} (${stats['variant count'] > stats.traceCount * 0.8 ? '⚠️ highly variable' : '✓ repeating patterns'})`,
  ];

  if (stats.traceCount < 50) {
    lines.push('   ⚠️ TIP: Small logs benefit from simpler algorithms (DFG, Heuristic Miner)');
  }
  if (stats.uniqueActivities > 100) {
    lines.push('   ⚠️ TIP: Complex processes may need advanced algorithms (ILP, Genetic)');
  }
  if (stats['variant count'] / stats.traceCount > 0.8) {
    lines.push('   ⚠️ TIP: High variant count suggests process drift; try `wpm drift-watch`');
  }
  if (stats.uniqueActivities < 10 && stats.traceCount < 100) {
    lines.push('   ⚠️ TIP: Small logs with simple processes benefit from simpler algorithms (DFG, Heuristic)');
  }

  return lines.join('\n');
}

// ─── Helper: Fuzzy matching for "did you mean?" ────────────────────────────

function findClosestMatch(input: string, options: string[]): string | undefined {
  if (!input) return options[0];

  const distance = (a: string, b: string): number => {
    // Simple Levenshtein distance
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  };

  const candidates = options
    .map((opt) => ({ option: opt, dist: distance(input, opt) }))
    .filter((c) => c.dist <= 3) // Levenshtein distance threshold
    .sort((a, b) => a.dist - b.dist);

  return candidates[0]?.option;
}
