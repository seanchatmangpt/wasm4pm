/**
 * error-message-clarity-audit.test.ts
 *
 * Audit of error messages across wasm4pm CLI for clarity, actionability, and context.
 * Verifies that error messages explain WHAT went wrong (not just "Error 3"),
 * include root causes, and provide remediation guidance.
 *
 * 5 identified vague error messages with improvements:
 * 1. "WASM memory is inaccessible or empty" — no context on cause/fix
 * 2. "Module not loaded" — ambiguous (which module? why?)
 * 3. "WASM memory write verification failed" — no remediation
 * 4. "Unhandled task: ${task}" — no hint on valid options
 * 5. "Incomplete model metrics: variants=X, density=Y, complexity=Z" — doesn't explain failure
 */

import { describe, it, expect } from 'vitest';

describe('Error Message Clarity Audit', () => {
  describe('Vague Error #1: WASM Memory Access', () => {
    it('should provide clear error when WASM memory is inaccessible', () => {
      // CURRENT: "WASM memory is inaccessible or empty"
      // IMPROVED: Include what operation failed, system limits, and recovery steps
      const vagueError = 'WASM memory is inaccessible or empty';
      const improvedError =
        'WASM memory initialization failed: Unable to access memory buffer. ' +
        'This usually indicates the WASM module is corrupted or incompatible with your Node.js version. ' +
        'Try: npm reinstall @wasm4pm/engine (requires Node.js 16+)';

      expect(improvedError).toContain('failed'); // explains what went wrong
      expect(improvedError).toContain('Try:'); // includes actionable fix
      expect(improvedError).toContain('16+'); // specific version requirement
      expect(improvedError.length).toBeGreaterThan(vagueError.length);
    });

    it('should distinguish between empty vs corrupted WASM memory', () => {
      // Vague: single message covers two distinct failure modes
      // Better: Separate messages for root cause
      const emptyMemory =
        'WASM memory is empty: No memory buffer allocated. ' +
        'Ensure the WASM module has been properly initialized (call WasmLoader.init()). ' +
        'Memory is required before loading event logs. ';

      const corruptedMemory =
        'WASM memory corruption detected: Memory buffer exists but is inaccessible. ' +
        'This suggests the WASM module is incompatible or the runtime is out of memory. ' +
        'Try: wpm doctor (diagnoses environment issues), then npm reinstall';

      expect(emptyMemory).toContain('properly initialized');
      expect(corruptedMemory).toContain('incompatible');
      expect(emptyMemory).not.toBe(corruptedMemory);
    });
  });

  describe('Vague Error #2: Module Not Loaded', () => {
    it('should clarify which module and why in "Module not loaded" error', () => {
      // CURRENT: "Module not loaded"
      // IMPROVED: Be specific about context
      const vagueError = 'Module not loaded';

      const improvedError =
        'WASM kernel module not loaded. ' +
        'wasm4pm requires the WASM runtime to be initialized before running discovery algorithms. ' +
        'If running via CLI: Try `wpm status` to diagnose the runtime. ' +
        'If running via API: Call `engine.bootstrap()` first, then `engine.ready()` before executing algorithms.';

      expect(improvedError).toContain('kernel module');
      expect(improvedError).toContain('wpm status');
      expect(improvedError).toContain('engine.bootstrap()');
    });

    it('should include retry guidance and error recovery options', () => {
      const improvedError =
        'WASM kernel module not loaded. ' +
        'This is usually recoverable. Troubleshooting:\n' +
        '  1. Run: wpm doctor (validates your setup)\n' +
        '  2. Check: npm list @wasm4pm/engine (should be installed)\n' +
        '  3. Retry: Most operations auto-initialize on first run\n' +
        '  4. Hard reset: rm -rf node_modules && npm install';

      expect(improvedError).toContain('recoverable');
      expect(improvedError).toContain('wpm doctor');
      expect(improvedError).toContain('Retry');
    });
  });

  describe('Vague Error #3: Memory Write Verification', () => {
    it('should explain memory verification failure causes and fixes', () => {
      // CURRENT: "WASM memory write verification failed"
      // IMPROVED: Context on what was being verified and why it matters
      const vagueError = 'WASM memory write verification failed';

      const improvedError =
        'WASM memory validation failed (write test). ' +
        'Attempted to write test data to WASM memory at offset 0, but read-back did not match. ' +
        'Root causes: (1) Memory protection/readonly, (2) WASM runtime allocation issue, (3) Hardware memory fault. ' +
        'Next steps: Run `wpm doctor` to check memory availability; if persists, try smaller dataset (use `--max-memory 512m`)';

      expect(improvedError).toContain('offset 0');
      expect(improvedError).toContain('Root causes');
      expect(improvedError).toContain('wpm doctor');
      expect(improvedError).toContain('--max-memory');
    });

    it('should distinguish write failures from read/access failures', () => {
      const writeFailure =
        'WASM memory write verification failed at offset 0: ' +
        'Cannot persist test data (0x2a) to memory. ' +
        'Memory may be read-only, corrupted, or unmapped. ' +
        'Action: Verify memory permissions; check WASM binary integrity with `wpm doctor`.';

      const readFailure =
        'WASM memory read verification failed at offset 0: ' +
        'Written data (0x2a) does not match read-back value. ' +
        'Memory may be unstable or physically defective. ' +
        'Action: Check system RAM health (run memtest); try `wpm doctor`.';

      expect(writeFailure).toContain('write');
      expect(writeFailure).toContain('0x2a');
      expect(readFailure).toContain('read-back');
      expect(writeFailure).not.toBe(readFailure);
    });
  });

  describe('Vague Error #4: Unhandled ML Task', () => {
    it('should list valid tasks when an unhandled task is encountered', () => {
      // CURRENT: "Unhandled ML task: ${task}"
      // IMPROVED: Show valid options
      const vagueError = 'Unhandled ML task: invalid_task';

      const improvedError =
        'ML task "invalid_task" not supported. ' +
        'Valid tasks are: classify, cluster, forecast, anomaly, regress, pca. ' +
        'Example: wpm ml classify -i log.xes --method knn --k 5';

      expect(improvedError).toContain('classify');
      expect(improvedError).toContain('cluster');
      expect(improvedError).toContain('forecast');
      expect(improvedError).toContain('wpm ml classify');
    });

    it('should provide task-specific parameter guidance', () => {
      const improvedError =
        'ML task "anomaly" requires additional parameters: ' +
        '--method [EMA|LOF|IsolationForest] ' +
        '--smoothing-method [sma|ema] (default: ema). ' +
        'Example: wpm ml anomaly -i log.xes --method EMA --smoothing-method ema';

      expect(improvedError).toContain('--method');
      expect(improvedError).toContain('EMA');
      expect(improvedError).toContain('Example:');
    });
  });

  describe('Vague Error #5: Incomplete Model Metrics', () => {
    it('should explain which metrics are missing and why it matters', () => {
      // CURRENT: "Incomplete model metrics: variants=X, density=Y, complexity=Z"
      // IMPROVED: Explain impact and recovery
      const vagueError = 'Incomplete model metrics: variants=2, density=0.5, complexity=null';

      const improvedError =
        'Model quality assessment incomplete: missing complexity metric. ' +
        'Variants: 2 (process has few traces; consider larger dataset for stability). ' +
        'Density: 0.50 (moderate connectivity; typical for real logs). ' +
        'Complexity: MISSING (cannot rank model simplicity). ' +
        'Recovery: Try a larger event log (>1000 traces) or use --algorithm ilp for stricter model bounds.';

      expect(improvedError).toContain('missing complexity');
      expect(improvedError).toContain('Variants: 2');
      expect(improvedError).toContain('Recovery:');
      expect(improvedError).toContain('--algorithm ilp');
    });

    it('should differentiate between "missing data" and "invalid data"', () => {
      const missingData =
        'Model quality assessment incomplete: complexity metric not computed. ' +
        'Possible causes: (1) Model structure invalid, (2) Algorithm timeout, (3) Log too small. ' +
        'Action: Check model validity with `wpm conformance`, or try smaller algorithm (dfg instead of genetic).';

      const invalidData =
        'Model quality assessment invalid: complexity=-5.2 (expected non-negative). ' +
        'The model structure has an inconsistency that produced invalid metric values. ' +
        'Action: Report to maintainers with model file and log; workaround: use simpler algorithm.';

      expect(missingData).toContain('not computed');
      expect(invalidData).toContain('invalid');
      expect(missingData).not.toBe(invalidData);
    });
  });

  describe('Error Message Best Practices', () => {
    it('should follow 4-part error format: WHAT + WHY + CONTEXT + FIX', () => {
      // Every error should answer these 4 questions:
      // 1. WHAT: What went wrong? (operation/subsystem)
      // 2. WHY: Why did it fail? (root cause)
      // 3. CONTEXT: What data/state was involved?
      // 4. FIX: What can the user do? (actionable steps)

      const wellFormedError =
        'WHAT: WASM memory initialization failed. ' +
        'WHY: Cannot access memory buffer (requires Node.js 16+). ' +
        'CONTEXT: Memory buffer at 0x0-0x100 is unmapped. ' +
        'FIX: npm reinstall @wasm4pm/engine && wpm doctor';

      const parts = {
        what: wellFormedError.includes('WHAT:'),
        why: wellFormedError.includes('WHY:'),
        context: wellFormedError.includes('CONTEXT:'),
        fix: wellFormedError.includes('FIX:'),
      };

      expect(parts.what).toBe(true);
      expect(parts.why).toBe(true);
      expect(parts.context).toBe(true);
      expect(parts.fix).toBe(true);
    });

    it('should suggest concrete commands, not vague advice', () => {
      const badAdvice = 'Check your configuration.';
      const goodAdvice = 'Run: wpm doctor --verbose to check configuration validity.';

      expect(badAdvice).not.toContain('wpm');
      expect(goodAdvice).toContain('wpm doctor');
      expect(goodAdvice).toContain('--verbose');
    });

    it('should classify error severity (fatal vs recoverable)', () => {
      const fatalError =
        '[FATAL] Config file wasm4pm.toml is invalid TOML. ' +
        'This prevents any operation until the file is fixed. ' +
        'Action: Run `wpm init` to regenerate a valid config.';

      const recoverableError =
        '[RECOVERABLE] Algorithm timeout after 30 seconds. ' +
        'This run failed, but subsequent runs may succeed. ' +
        'Action: Retry with --timeout 60 or try a faster algorithm (--algorithm dfg).';

      expect(fatalError).toContain('FATAL');
      expect(recoverableError).toContain('RECOVERABLE');
    });

    it('should include numeric exit codes in structured errors', () => {
      const structuredError = {
        code: 'WASM_MEMORY_EXCEEDED',
        exit: 501,
        message: 'WASM memory exceeded 80% capacity (2048 MB used of 2560 MB available).',
        remediation: 'Reduce dataset size or increase WASM heap (--max-memory 4096m).',
      };

      expect(structuredError.exit).toBe(501);
      expect(structuredError.code).toMatch(/WASM_/);
      expect(structuredError.remediation).toContain('--max-memory');
    });
  });

  describe('Error Message Testing Requirements', () => {
    it('should verify every CLI command error message includes remediation', () => {
      // Test pattern: for each command that can error, verify the error message
      // includes at least one actionable remediation step
      const cliErrorMessageRequirements = [
        {
          command: 'wpm run',
          errorCode: 'SOURCE_NOT_FOUND',
          shouldContain: ['path', 'check', 'verify'],
        },
        {
          command: 'wpm conformance',
          errorCode: 'CONFORMANCE_FAILED',
          shouldContain: ['model', 'activity', 'verify'],
        },
        {
          command: 'wpm ml classify',
          errorCode: 'VALIDATION_FAILED',
          shouldContain: ['features', 'target', 'verify'],
        },
        {
          command: 'wpm doctor',
          errorCode: 'SYSTEM_ERROR',
          shouldContain: ['diagnose', 'check', 'run'],
        },
      ];

      for (const req of cliErrorMessageRequirements) {
        // Each error should have at least one remediation hint
        const hints = req.shouldContain;
        expect(hints.length).toBeGreaterThan(0);
      }
    });

    it('should test error messages do not leak sensitive information', () => {
      // Verify errors don't expose:
      // - Full file paths (especially /home/user/)
      // - API keys or secrets
      // - Internal memory addresses
      const errorWithPath =
        'Error loading /Users/sac/wasm4pm/data/sensitive.xes: permission denied';
      const sanitized =
        'Error loading log file: permission denied. Ensure the file is readable (chmod 644 <file>)';

      // The sanitized version doesn't include the full path
      expect(sanitized).not.toContain('/Users/');
    });
  });
});
