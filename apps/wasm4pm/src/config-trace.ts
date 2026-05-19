/**
 * Config Resolution Tracing
 *
 * When verbose mode is enabled, track which config source was chosen for each field
 * (CLI > TOML > JSON > ENV > defaults) and explain why algorithm/profile was selected.
 *
 * Used at verboseLevel >= 1 for debug output, verboseLevel >= 2 for decision trees.
 */

import { ConsoleProjection } from './output.js';
import type { ResolvedConfigPath } from './config/resolver.js';

export interface ConfigSource {
  field: string;
  value: unknown;
  source: 'cli' | 'wasm4pm.toml' | 'wasm4pm.json' | 'env' | 'defaults';
  path?: string; // File path if from file source
  envVar?: string; // Environment variable name if from env
}

export interface ConfigResolutionTrace {
  sources: ConfigSource[];
  algorithm?: {
    chosen: string;
    reason: string;
    candidates: string[];
    scoreDetails?: Record<string, unknown>;
  };
  profile?: {
    chosen: string;
    reason: string;
    reasons?: string[];
  };
}

/**
 * Track a config field's resolution source.
 * Called during config loading to record where each value came from.
 */
export class ConfigTracer {
  private sources: ConfigSource[] = [];

  recordSource(
    field: string,
    value: unknown,
    source: 'cli' | 'wasm4pm.toml' | 'wasm4pm.json' | 'env' | 'defaults',
    path?: string,
    envVar?: string
  ): void {
    this.sources.push({ field, value, source, path, envVar });
  }

  /**
   * Record why a specific algorithm was chosen (for decision tree output).
   */
  recordAlgorithmChoice(
    chosen: string,
    reason: string,
    candidates: string[],
    scoreDetails?: Record<string, unknown>
  ): void {
    this.algorithmChoice = { chosen, reason, candidates, scoreDetails };
  }

  /**
   * Record why a specific execution profile was chosen.
   */
  recordProfileChoice(chosen: string, reason: string, reasons?: string[]): void {
    this.profileChoice = { chosen, reason, reasons };
  }

  private algorithmChoice?: ConfigResolutionTrace['algorithm'];
  private profileChoice?: ConfigResolutionTrace['profile'];

  getTrace(): ConfigResolutionTrace {
    return {
      sources: this.sources,
      algorithm: this.algorithmChoice,
      profile: this.profileChoice,
    };
  }

  /**
   * Format the trace for human output at different verbose levels.
   */
  format(verboseLevel: 0 | 1 | 2 | 3): string {
    const lines: string[] = [];

    if (verboseLevel >= 1) {
      // Level 1: Show config resolution chain (which sources were checked)
      lines.push('\n[DEBUG] Config Resolution:');
      const precedence = new Map<string, ConfigSource>();
      for (const src of this.sources) {
        if (!precedence.has(src.field) || this.sourcePrecedence(src.source) > this.sourcePrecedence(precedence.get(src.field)!.source)) {
          precedence.set(src.field, src);
        }
      }
      for (const [field, src] of precedence) {
        const marker = src.source === 'defaults' ? '(default)' : `(from ${src.source})`;
        lines.push(`  • ${field}: ${JSON.stringify(src.value)} ${marker}`);
      }
    }

    if (verboseLevel >= 2) {
      // Level 2: Show decision tree (why algorithm and profile were chosen)
      if (this.algorithmChoice) {
        lines.push('\n[DECISION] Algorithm Selection:');
        lines.push(`  Chosen: ${this.algorithmChoice.chosen}`);
        lines.push(`  Reason: ${this.algorithmChoice.reason}`);
        if (this.algorithmChoice.candidates.length > 0) {
          lines.push(`  Candidates considered: ${this.algorithmChoice.candidates.join(', ')}`);
        }
        if (this.algorithmChoice.scoreDetails) {
          lines.push(`  Details: ${JSON.stringify(this.algorithmChoice.scoreDetails, null, 4)}`);
        }
      }

      if (this.profileChoice) {
        lines.push('\n[DECISION] Profile Selection:');
        lines.push(`  Chosen: ${this.profileChoice.chosen}`);
        lines.push(`  Reason: ${this.profileChoice.reason}`);
        if (this.profileChoice.reasons && this.profileChoice.reasons.length > 0) {
          lines.push(`  Contributing factors:`);
          this.profileChoice.reasons.forEach((r) => lines.push(`    - ${r}`));
        }
      }
    }

    if (verboseLevel >= 3) {
      // Level 3: Show all config sources and precedence chain
      lines.push('\n[DEBUG] All Config Sources (precedence order):');
      const sourcesByField = new Map<string, ConfigSource[]>();
      for (const src of this.sources) {
        if (!sourcesByField.has(src.field)) {
          sourcesByField.set(src.field, []);
        }
        sourcesByField.get(src.field)!.push(src);
      }
      for (const [field, srcs] of sourcesByField) {
        lines.push(`  ${field}:`);
        srcs.sort((a, b) => this.sourcePrecedence(b.source) - this.sourcePrecedence(a.source));
        for (const src of srcs) {
          const info =
            src.envVar ? ` ${src.envVar}` : src.path ? ` ${src.path}` : '';
          lines.push(`    • ${src.source}${info}: ${JSON.stringify(src.value)}`);
        }
      }
    }

    return lines.join('\n');
  }

  private sourcePrecedence(source: ConfigSource['source']): number {
    const order = {
      cli: 5,
      'wasm4pm.toml': 4,
      'wasm4pm.json': 3,
      env: 2,
      defaults: 1,
    };
    return order[source];
  }
}

/**
 * Emit config resolution trace to console (helper for commands).
 */
export function emitConfigTrace(
  projection: ConsoleProjection,
  tracer: ConfigTracer,
  verboseLevel: 0 | 1 | 2 | 3
): void {
  if (verboseLevel >= 1) {
    const formatted = tracer.format(verboseLevel);
    if (formatted.trim()) {
      projection.debug(formatted);
    }
  }
}
