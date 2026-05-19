/**
 * Error Recovery Suggestions
 * Maps error codes to actionable hints for users
 */

export interface ErrorContext {
  errorCode: string;
  message?: string;
  filePath?: string;
  algorithm?: string;
  logSize?: number;
  details?: Record<string, unknown>;
}

export interface RecoverySuggestion {
  errorCode: string;
  primarySuggestion: string;
  secondarySuggestions: string[];
  relatedCommands: string[];
}

const RECOVERY_MAP: Record<string, RecoverySuggestion> = {
  CONFIG_ERROR: {
    errorCode: 'CONFIG_ERROR',
    primarySuggestion:
      'Check your configuration: run `wpm init` to scaffold wasm4pm.toml, or verify existing config with `wpm doctor`',
    secondarySuggestions: [
      'Verify TOML syntax: check for missing quotes, colons, or bracket pairs in wasm4pm.toml or wasm4pm.json',
      'Check environment variables: ensure WASM4PM_* env vars are set correctly if using ENV config layer',
      'Review algorithm name: run `wpm algorithms` to list valid algorithm IDs',
      'Verify parameter types: algorithm parameters must match declared types (string, number, boolean)',
    ],
    relatedCommands: ['wpm init', 'wpm doctor', 'wpm algorithms', 'wpm explain'],
  },

  SOURCE_ERROR: {
    errorCode: 'SOURCE_ERROR',
    primarySuggestion:
      'Check your input event log: verify file exists, is readable XES/JSON, and conforms to schema',
    secondarySuggestions: [
      'File path: ensure the file exists at the specified path (relative or absolute)',
      'File format: XES files must be valid XML; JSON must be valid JSON (use a linter)',
      'Event log validation: run `wpm validate <log>` to check for missing required attributes (concept:name, time:timestamp)',
      'Log size: very small logs (<10 traces) may cause discovery to fail; try a larger sample',
      'Character encoding: ensure file is UTF-8 encoded, not UTF-16 or Latin-1',
    ],
    relatedCommands: ['wpm validate', 'wpm run --help'],
  },

  EXECUTION_ERROR: {
    errorCode: 'EXECUTION_ERROR',
    primarySuggestion:
      'Algorithm execution failed: try a simpler algorithm (dfg or alpha_plus_plus) or reduce log size',
    secondarySuggestions: [
      'Algorithm choice: DFG is fastest; genetic_algorithm is slowest. Try `wpm run <log> --algorithm dfg` first',
      'Memory limit: if using large logs (>100K events), increase memory or run on a machine with more RAM',
      'Timeout: use `wpm run <log> --profile fast` for 30ms timeout or `--profile quality` for 85ms',
      'WASM backend: run `wpm status` to verify WASM engine is loaded and healthy',
    ],
    relatedCommands: ['wpm status', 'wpm algorithms', 'wpm explain'],
  },

  PARTIAL_FAILURE: {
    errorCode: 'PARTIAL_FAILURE',
    primarySuggestion:
      'Some operations succeeded but others failed: check the detailed error message for which step failed',
    secondarySuggestions: [
      'Log conformance: model was discovered but conformance check failed; try a different algorithm',
      'Output writing: discovery succeeded but file write failed; check disk space and permissions',
      'Partial results: some results were saved to `.wasm4pm/results/` even though overall command failed',
    ],
    relatedCommands: ['wpm results', 'wpm conformance'],
  },

  SYSTEM_ERROR: {
    errorCode: 'SYSTEM_ERROR',
    primarySuggestion:
      'Internal system error: run `wpm doctor` to diagnose environment issues, or report to maintainers',
    secondarySuggestions: [
      'WASM binary: ensure wasm4pm/pkg/wasm4pm_bg.wasm exists and is readable',
      'Node.js version: wasm4pm requires Node.js 18+; check with `node --version`',
      'Disk space: ensure `/tmp` and current directory have free space for temporary files',
      'Environment: unset conflicting env vars like WASM4PM_WATCH or WASM4PM_OTEL_ENDPOINT',
    ],
    relatedCommands: ['wpm doctor', 'wpm status'],
  },

  CONFORMANCE_FAIL: {
    errorCode: 'CONFORMANCE_FAIL',
    primarySuggestion:
      'Model does not conform to log (fitness < 0.85): try a more flexible algorithm or check log quality',
    secondarySuggestions: [
      'Algorithm selection: genetic_algorithm or ilp may improve fitness; try `wpm compare dfg,genetic_algorithm -i <log>`',
      'Log quality: check for incomplete traces, missing attributes, or data entry errors; run `wpm validate <log>`',
      'Model overfitting: if precision is high but fitness is low, model is too strict; use genetic_algorithm instead of alpha_plus_plus',
      'Process complexity: if model is too simple (DFG), try inductive_miner for richer process trees',
    ],
    relatedCommands: ['wpm conformance', 'wpm compare', 'wpm quality'],
  },

  WASM_NOT_FOUND: {
    errorCode: 'WASM_NOT_FOUND',
    primarySuggestion:
      'WASM binary not found: rebuild the WASM module with `cd wasm4pm && npm run build`',
    secondarySuggestions: [
      'Binary location: check wasm4pm/pkg/wasm4pm_bg.wasm exists',
      'Build artifacts: if directory is missing, run `wasm-pack build --target nodejs` in wasm4pm/',
      'Installation: if using npm install, ensure @wasm4pm/wasm package was installed correctly',
    ],
    relatedCommands: ['wpm status', 'wpm doctor'],
  },

  INVALID_ALGORITHM: {
    errorCode: 'INVALID_ALGORITHM',
    primarySuggestion: 'Unknown algorithm name: run `wpm algorithms` to see all available algorithms',
    secondarySuggestions: [
      'Algorithm name: algorithm IDs are lowercase with underscores (e.g., genetic_algorithm, not GA)',
      'Typo check: common misspellings are "genetic" vs "genetic_algorithm", "ilp" vs "integer_linear_programming"',
    ],
    relatedCommands: ['wpm algorithms --search <pattern>'],
  },

  FILE_NOT_FOUND: {
    errorCode: 'FILE_NOT_FOUND',
    primarySuggestion: 'Input file not found: verify file path is correct and file exists',
    secondarySuggestions: [
      'Relative paths: current directory is the directory where you ran `wpm`, not the wasm4pm repo root',
      'Absolute paths: use full path /home/user/data/log.xes for unambiguous access',
      'Wildcards: file names with * or ? must be quoted: `wpm run "logs/*.xes"`',
    ],
    relatedCommands: [],
  },

  PARSE_ERROR: {
    errorCode: 'PARSE_ERROR',
    primarySuggestion:
      'Failed to parse input file: check file format is valid XES/JSON and not corrupted',
    secondarySuggestions: [
      'XES files: validate XML syntax with an XML linter (missing closing tags, unescaped characters)',
      'JSON files: validate syntax with jq or a JSON linter (missing commas, trailing commas, unquoted keys)',
      'Character encoding: ensure file is UTF-8, not UTF-16 or Latin-1',
      'Byte order mark (BOM): some editors add BOM; use an editor that removes it',
    ],
    relatedCommands: ['wpm validate'],
  },

  TIMEOUT: {
    errorCode: 'TIMEOUT',
    primarySuggestion:
      'Algorithm execution timed out: try a faster algorithm or increase timeout with `--profile quality`',
    secondarySuggestions: [
      'Algorithm speed: dfg (5ms), alpha_plus_plus (20ms), genetic_algorithm (75ms). Choose based on speed tier',
      'Log size: large logs (>100K events) may exceed timeout; try sampling a subset first',
      'Profile: use `--profile fast` for 30ms or `--profile quality` for 85ms; default is balanced (55ms)',
    ],
    relatedCommands: ['wpm algorithms', 'wpm explain'],
  },

  PERMISSION_DENIED: {
    errorCode: 'PERMISSION_DENIED',
    primarySuggestion:
      'Permission denied: check file permissions and ensure you have read/write access',
    secondarySuggestions: [
      'Read access: ensure file is readable with `ls -l <file>` (should show r flag)',
      'Write access: ensure output directory is writable (run from a directory you own)',
      'TMPDIR: ensure /tmp directory is accessible and writable',
    ],
    relatedCommands: [],
  },
};

/**
 * Suggest recovery steps for an error
 * @param errorCode Error code or error type string
 * @param context Optional context (filePath, algorithm, logSize, etc.)
 * @returns RecoverySuggestion with primary and secondary suggestions
 */
export function suggestRecovery(errorCode: string, context?: ErrorContext): RecoverySuggestion {
  const normalized = errorCode.toUpperCase().replace(/-/g, '_');
  const suggestion = RECOVERY_MAP[normalized];

  if (!suggestion) {
    return {
      errorCode: normalized,
      primarySuggestion: `Unknown error code: ${errorCode}. Run 'wpm doctor' to diagnose your environment.`,
      secondarySuggestions: [
        'Check error message for details',
        'Run `wpm doctor` to verify environment setup',
        'Run `wpm status` to check WASM engine health',
      ],
      relatedCommands: ['wpm doctor', 'wpm status'],
    };
  }

  return suggestion;
}

/**
 * Format recovery suggestion for CLI output
 * @param suggestion RecoverySuggestion from suggestRecovery()
 * @returns Formatted string for console output
 */
export function formatRecoverySuggestion(suggestion: RecoverySuggestion): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`💡 Recovery Suggestion for [${suggestion.errorCode}]:`);
  lines.push('');
  lines.push(`   ${suggestion.primarySuggestion}`);

  if (suggestion.secondarySuggestions.length > 0) {
    lines.push('');
    lines.push('   Additional help:');
    for (const secondary of suggestion.secondarySuggestions) {
      lines.push(`   • ${secondary}`);
    }
  }

  if (suggestion.relatedCommands.length > 0) {
    lines.push('');
    lines.push('   Try these commands:');
    for (const cmd of suggestion.relatedCommands) {
      lines.push(`   $ wpm ${cmd}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
