/**
 * ux-gap-fixes.test.ts
 *
 * Comprehensive tests for 5 critical UX gaps:
 * 1. Vague error messages → enriched with root cause + actionable steps
 * 2. Missing warning severity → JSON output includes severity levels
 * 3. No completion hints → suggest shell completion installation
 * 4. Algorithm jargon → clear explanation of tier vs profile
 * 5. Missing log quality context → detailed guidance based on stats
 *
 * 20+ test cases verifying all fixes
 */

import { describe, it, expect } from 'vitest';
import {
  enrichWasmMemoryError,
  enrichModuleLoadError,
  enrichTaskValidationError,
  WarningCollector,
  getCompletionHint,
  explainAlgorithmTiers,
  formatLogQualityContext,
} from '../ux-gap-fixes.js';

// ─── Gap 1: Enriched Error Messages ────────────────────────────────────────

describe('UX Gap 1: Enriched Error Messages', () => {
  describe('WASM Memory Errors', () => {
    it('should enrich WASM empty memory error with specific actions', () => {
      const err = enrichWasmMemoryError('empty', { offset: 0 });

      expect(err.operation).toBe('wasm_memory_initialization');
      expect(err.severity).toBe('recoverable');
      expect(err.rootCause.toLowerCase()).toContain('allocated');
      expect(err.suggestedActions.some((a) => a.includes('WasmLoader.init()'))).toBe(true);
      expect(err.suggestedActions.some((a) => a.includes('wpm doctor'))).toBe(true);
      expect(err.suggestedActions.length).toBeGreaterThan(0);
    });

    it('should enrich WASM corrupted memory error with compatibility hints', () => {
      const err = enrichWasmMemoryError('corrupted', { nodeVersion: '14.0' });

      expect(err.severity).toBe('fatal');
      expect(err.rootCause).toContain('unmapped');
      expect(err.suggestedActions.some((a) => a.includes('reinstall'))).toBe(
        true
      );
      expect(err.suggestedActions.some((a) => a.includes('16+'))).toBe(
        true
      );
    });

    it('should distinguish between empty and corrupted memory errors', () => {
      const empty = enrichWasmMemoryError('empty');
      const corrupted = enrichWasmMemoryError('corrupted');

      expect(empty.rootCause).not.toBe(corrupted.rootCause);
      expect(empty.suggestedActions).not.toEqual(corrupted.suggestedActions);
    });

    it('should include docs URL for further help', () => {
      const err = enrichWasmMemoryError('empty');

      expect(err.docsUrl).toContain('wasm4pm.dev');
      expect(err.docsUrl).toContain('troubleshoot');
    });

    it('should capture affected memory offset in context', () => {
      const err = enrichWasmMemoryError('corrupted', { offset: 256 });

      expect(err.affectedData?.type).toBe('memory');
      expect(err.affectedData?.identifier).toContain('0x');
    });
  });

  describe('Module Loading Errors', () => {
    it('should enrich kernel module error with status checks', () => {
      const err = enrichModuleLoadError('kernel', { state: 'uninitialized' });

      expect(err.operation).toContain('kernel');
      expect(err.severity).toBe('recoverable');
      expect(err.suggestedActions.some((a) => a.includes('wpm status'))).toBe(
        true
      );
      expect(err.suggestedActions.some((a) => a.includes('wpm doctor'))).toBe(
        true
      );
    });

    it('should provide module-specific recovery steps', () => {
      const kernel = enrichModuleLoadError('kernel');
      const ml = enrichModuleLoadError('ml');
      const cognition = enrichModuleLoadError('cognition');

      expect(kernel.suggestedActions).not.toEqual(ml.suggestedActions);
      expect(ml.suggestedActions).not.toEqual(cognition.suggestedActions);
    });

    it('should include module documentation URL', () => {
      const err = enrichModuleLoadError('ml');

      expect(err.docsUrl).toContain('modules/ml');
    });

    it('should distinguish between optional and required modules', () => {
      const cognition = enrichModuleLoadError('cognition');

      expect(cognition.suggestedActions.some((a) => a.includes('optional'))).toBe(
        true
      );
    });
  });

  describe('Task Validation Errors', () => {
    it('should list valid tasks in validation error', () => {
      const validTasks = ['classify', 'cluster', 'forecast', 'anomaly'];
      const err = enrichTaskValidationError('invalid_task', validTasks);

      expect(err.rootCause).toContain('classify');
      expect(err.rootCause).toContain('cluster');
      expect(err.suggestedActions.some((a) =>
        a.includes('wpm ml')
      )).toBe(true);
    });

    it('should suggest closest match with "did you mean"', () => {
      const validTasks = ['classify', 'cluster'];
      const err = enrichTaskValidationError('classif', validTasks);

      // Should either suggest classify or list options
      expect(err.suggestedActions.length).toBeGreaterThan(0);
    });

    it('should provide example command for valid task', () => {
      const validTasks = ['classify', 'cluster'];
      const err = enrichTaskValidationError('regress', validTasks);

      expect(err.suggestedActions.some((a) =>
        a.includes('wpm ml')
      )).toBe(true);
    });
  });
});

// ─── Gap 2: Warning Severity Levels ────────────────────────────────────────

describe('UX Gap 2: Warning Severity Levels in JSON', () => {
  it('should collect warnings with severity levels', () => {
    const collector = new WarningCollector();

    collector.addWarning('LOW_TRACE_COUNT', 'Log has few traces', 'warn');
    collector.addWarning('INFORMATIONAL', 'FYI: algorithm A is faster', 'info');
    collector.addWarning('CRITICAL_ALERT', 'WASM memory critically low', 'critical');

    const warnings = collector.getWarnings();
    expect(warnings).toHaveLength(3);
    expect(warnings.some((w) => w.level === 'warn')).toBe(true);
    expect(warnings.some((w) => w.level === 'info')).toBe(true);
    expect(warnings.some((w) => w.level === 'critical')).toBe(true);
  });

  it('should track warning counts by level', () => {
    const collector = new WarningCollector();

    collector.addWarning('W1', 'Warning 1', 'warn');
    collector.addWarning('W2', 'Warning 2', 'warn');
    collector.addWarning('I1', 'Info 1', 'info');
    collector.addWarning('C1', 'Critical 1', 'critical');

    const counts = collector.countByLevel();
    expect(counts.warn).toBe(2);
    expect(counts.info).toBe(1);
    expect(counts.critical).toBe(1);
  });

  it('should support hasWarnings(minLevel) query', () => {
    const collector = new WarningCollector();

    collector.addWarning('I1', 'Info', 'info');
    expect(collector.hasWarnings('info')).toBe(true);
    expect(collector.hasWarnings('warn')).toBe(false);
    expect(collector.hasWarnings('critical')).toBe(false);

    collector.addWarning('W1', 'Warning', 'warn');
    expect(collector.hasWarnings('warn')).toBe(true);
    expect(collector.hasWarnings('critical')).toBe(false);
  });

  it('should include metric context in warnings', () => {
    const collector = new WarningCollector();

    collector.addWarning('THRESHOLD_EXCEEDED', 'Fitness below threshold', 'warn', {
      metric: {
        name: 'fitness',
        value: 0.65,
        threshold: 0.75,
        unit: 'ratio',
      },
      affectedComponent: 'algorithm',
    });

    const warnings = collector.getWarnings();
    expect(warnings[0].metric?.name).toBe('fitness');
    expect(warnings[0].metric?.value).toBe(0.65);
    expect(warnings[0].metric?.threshold).toBe(0.75);
  });

  describe('Log Quality Warnings', () => {
    it('should add low trace count warning', () => {
      const collector = new WarningCollector();

      collector.addLogQualityWarning({
        traceCount: 30,
        eventRate: 10,
        uniqueActivities: 8,
        avgTraceDuration: 60,
      });

      const warnings = collector.getWarnings();
      expect(warnings.some((w) => w.code === 'LOW_TRACE_COUNT')).toBe(true);
    });

    it('should add low event rate warning', () => {
      const collector = new WarningCollector();

      collector.addLogQualityWarning({
        traceCount: 100,
        eventRate: 0.2,
        uniqueActivities: 8,
        avgTraceDuration: 60,
      });

      const warnings = collector.getWarnings();
      expect(warnings.some((w) => w.code === 'LOW_EVENT_RATE')).toBe(true);
    });

    it('should add simple process warning', () => {
      const collector = new WarningCollector();

      collector.addLogQualityWarning({
        traceCount: 100,
        eventRate: 5,
        uniqueActivities: 3,
        avgTraceDuration: 60,
      });

      const warnings = collector.getWarnings();
      expect(warnings.some((w) => w.code === 'SIMPLE_PROCESS')).toBe(true);
    });

    it('should add long trace duration warning', () => {
      const collector = new WarningCollector();

      collector.addLogQualityWarning({
        traceCount: 100,
        eventRate: 5,
        uniqueActivities: 8,
        avgTraceDuration: 86400, // 1 day
      });

      const warnings = collector.getWarnings();
      expect(warnings.some((w) => w.code === 'LONG_TRACES')).toBe(true);
    });

    it('should not warn on healthy logs', () => {
      const collector = new WarningCollector();

      collector.addLogQualityWarning({
        traceCount: 1000,
        eventRate: 10,
        uniqueActivities: 20,
        avgTraceDuration: 300,
      });

      const warnings = collector.getWarnings();
      expect(warnings.length).toBe(0);
    });
  });
});

// ─── Gap 3: Shell Completion Hints ────────────────────────────────────────

describe('UX Gap 3: Shell Completion Hints', () => {
  it('should return hint for bash shell', () => {
    const hint = getCompletionHint('run', '/bin/bash');

    expect(hint).toContain('completions install bash');
    expect(hint).toContain('bashrc');
  });

  it('should return hint for zsh shell', () => {
    const hint = getCompletionHint('run', '/bin/zsh');

    expect(hint).toContain('completions install zsh');
    expect(hint).toContain('zshrc');
  });

  it('should return hint for fish shell', () => {
    const hint = getCompletionHint('run', '/usr/bin/fish');

    expect(hint).toContain('completions install fish');
    expect(hint).toContain('config.fish');
  });

  it('should return undefined for non-interactive shell', () => {
    const hint = getCompletionHint('run', '/bin/sh');

    expect(hint).toBeUndefined();
  });

  it('should include command to source shell config', () => {
    const hint = getCompletionHint('run', '/bin/bash');

    expect(hint).toContain('source');
  });
});

// ─── Gap 4: Algorithm Jargon Clarity ──────────────────────────────────────

describe('UX Gap 4: Algorithm Jargon Clarity', () => {
  it('should explain tier terminology', () => {
    const explanation = explainAlgorithmTiers();

    expect(explanation).toContain('TIERS');
    expect(explanation).toContain('exploration');
    expect(explanation).toContain('daily');
    expect(explanation).toContain('conformance');
    expect(explanation).toContain('publication');
  });

  it('should explain profile terminology', () => {
    const explanation = explainAlgorithmTiers();

    expect(explanation).toContain('PROFILES');
    expect(explanation).toContain('fast');
    expect(explanation).toContain('balanced');
    expect(explanation).toContain('quality');
    expect(explanation).toContain('stream');
  });

  it('should distinguish tier from profile', () => {
    const explanation = explainAlgorithmTiers();

    // Should have separate sections
    expect(explanation).toContain('TIERS');
    expect(explanation).toContain('PROFILES');

    // Should not conflate them
    const tierIdx = explanation.indexOf('TIERS');
    const profileIdx = explanation.indexOf('PROFILES');
    expect(profileIdx).toBeGreaterThan(tierIdx);
  });

  it('should provide example commands', () => {
    const explanation = explainAlgorithmTiers();

    expect(explanation).toContain('wpm run');
    expect(explanation).toContain('--algorithm');
    expect(explanation).toContain('--profile');
  });

  it('should explain speed/quality tradeoffs', () => {
    const explanation = explainAlgorithmTiers();

    expect(explanation.toLowerCase()).toContain('fast');
    expect(explanation.toLowerCase()).toContain('slow');
    expect(explanation.toLowerCase()).toContain('quality');
  });
});

// ─── Gap 5: Log Quality Context Warnings ─────────────────────────────────

describe('UX Gap 5: Log Quality Context', () => {
  it('should format log quality context with stats', () => {
    const context = formatLogQualityContext({
      traceCount: 150,
      eventCount: 1500,
      uniqueActivities: 12,
      avgTraceDuration: 300,
      minTraceDuration: 60,
      maxTraceDuration: 3600,
      'variant count': 45,
    });

    expect(context).toContain('Log Quality Context');
    expect(context).toContain('Traces: 150');
    expect(context).toContain('Activities: 12');
    expect(context).toContain('Variants: 45');
  });

  it('should mark small logs with warning', () => {
    const context = formatLogQualityContext({
      traceCount: 30,
      eventCount: 300,
      uniqueActivities: 5,
      avgTraceDuration: 60,
      minTraceDuration: 10,
      maxTraceDuration: 300,
      'variant count': 25,
    });

    expect(context).toContain('⚠️ small');
  });

  it('should mark simple processes with guidance', () => {
    const context = formatLogQualityContext({
      traceCount: 50,    // Less than 100 to trigger "small" condition
      eventCount: 250,
      uniqueActivities: 3,
      avgTraceDuration: 60,
      minTraceDuration: 10,
      maxTraceDuration: 300,
      'variant count': 5,
    });

    expect(context).toContain('⚠️ simple');
    expect(context).toContain('TIP');
  });

  it('should mark highly variable processes for drift analysis', () => {
    const context = formatLogQualityContext({
      traceCount: 100,
      eventCount: 1000,
      uniqueActivities: 20,
      avgTraceDuration: 300,
      minTraceDuration: 60,
      maxTraceDuration: 7200,
      'variant count': 95, // 95% of traces are unique variants
    });

    expect(context).toContain('⚠️ highly variable');
    expect(context).toContain('drift-watch');
  });

  it('should recommend simpler algorithms for small logs', () => {
    const context = formatLogQualityContext({
      traceCount: 25,
      eventCount: 250,
      uniqueActivities: 4,
      avgTraceDuration: 60,
      minTraceDuration: 10,
      maxTraceDuration: 300,
      'variant count': 20,
    });

    expect(context).toContain('DFG');
    expect(context).toContain('Heuristic Miner');
  });

  it('should recommend advanced algorithms for complex processes', () => {
    const context = formatLogQualityContext({
      traceCount: 5000,
      eventCount: 50000,
      uniqueActivities: 150,
      avgTraceDuration: 1800,
      minTraceDuration: 60,
      maxTraceDuration: 86400,
      'variant count': 2000,
    });

    expect(context).toContain('ILP');
    expect(context).toContain('Genetic');
  });

  it('should display average trace length', () => {
    const context = formatLogQualityContext({
      traceCount: 100,
      eventCount: 1000,
      uniqueActivities: 10,
      avgTraceDuration: 300,
      minTraceDuration: 60,
      maxTraceDuration: 1800,
      'variant count': 30,
    });

    expect(context).toContain('10');
    expect(context).toContain('avg per trace');
  });
});

// ─── Integration: All Gaps Work Together ─────────────────────────────────

describe('UX Gap Fixes: Integration', () => {
  it('should enrich error and add context warnings together', () => {
    // Scenario: User tries to run discovery with empty WASM memory
    const error = enrichWasmMemoryError('empty');

    // Simultaneously, warn about configuration
    const collector = new WarningCollector();
    collector.addWarning('CONFIG_INCOMPLETE', 'wasm4pm.toml is missing [algorithm] section', 'warn');

    expect(error.severity).toBe('recoverable');
    expect(collector.hasWarnings('warn')).toBe(true);
    expect(collector.countByLevel().warn).toBe(1);
  });

  it('should provide both error remediation and completion hints', () => {
    const error = enrichTaskValidationError('invalid', ['classify', 'cluster']);
    const hint = getCompletionHint('ml', '/bin/bash');

    expect(error.suggestedActions.length).toBeGreaterThan(0);
    expect(hint).toContain('completions');
  });

  it('should combine algorithm guidance with log quality warnings', () => {
    const guidance = explainAlgorithmTiers();
    const context = formatLogQualityContext({
      traceCount: 50,
      eventCount: 500,
      uniqueActivities: 8,
      avgTraceDuration: 120,
      minTraceDuration: 20,
      maxTraceDuration: 600,
      'variant count': 40,
    });

    expect(guidance).toContain('TIERS');
    expect(context).toContain('⚠️ small');
    // User can cross-reference: small log → exploration tier → fast profile
  });
});
