/**
 * Agent violation semantics tests.
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * Each agent encodes a specific Van der Aalst doctrine:
 *   - Critical violations MUST set blocked_manufacturing = true
 *   - Warning violations MUST set blocked_manufacturing = false
 *   - ProcessMiningProof fields must be in [0, 1]
 *   - Authority escalation: release without validation or benchmark is critical
 *   - Evidence fabrication: fabricated trace IDs are critical; zero-duration spans are warning
 *   - Theater detector: empty span attributes are warning (not critical)
 *
 * These tests call executeAgent() directly to test individual agent logic
 * without going through the full MAPE-K cycle.
 */
import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestration.js';

// ---------------------------------------------------------------------------
// Severity-to-blocked_manufacturing invariant (Rank 1 — mathematical theorem)
// ---------------------------------------------------------------------------

describe('Violation severity ↔ blocked_manufacturing invariant', () => {
  it('critical violations always set blocked_manufacturing = true (mock-interceptor)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('mock-interceptor', {
      artifact_id: 'test',
      traces: [{ name: 'mock_load', service: 'test-svc', trace_id: 'abc123', duration_ms: 10 }],
      dry_run: true,
    });

    const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
    // FM-5: mock-interceptor must find at least one critical violation for mock_load
    // traces — a bug that degrades severity to 'warning' would change this count.
    expect(criticalViolations.length).toBeGreaterThan(0);
    for (const v of criticalViolations) {
      expect(v.blocked_manufacturing).toBe(true);
    }
  });

  it('warning violations always set blocked_manufacturing = false (config-drift-guardian)', async () => {
    // config-drift-guardian emits a warning when wasm4pm.toml is absent
    // In test context the file is absent, so we get a warning violation
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('config-drift-guardian', {
      artifact_id: 'test',
      dry_run: true,
    });

    const warningViolations = result.violations.filter((v) => v.severity === 'warning');
    for (const v of warningViolations) {
      expect(v.blocked_manufacturing).toBe(false);
    }
  });

  it('stub patterns are detected as critical by mock-interceptor', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('mock-interceptor', {
      artifact_id: 'test',
      traces: [{ name: 'stub_handler', service: 'real-svc', trace_id: 'def456', duration_ms: 5 }],
      dry_run: true,
    });

    const stubViolation = result.violations.find((v) => v.violation_type === 'stub_operation_detected');
    expect(stubViolation).toBeDefined();
    expect(stubViolation!.severity).toBe('critical');
    expect(stubViolation!.blocked_manufacturing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Evidence fabrication detector
// ---------------------------------------------------------------------------

describe('evidence-fabrication-detector — violation semantics', () => {
  it('detects fabricated trace ID (literal "fake") as critical, blocks manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('evidence-fabrication-detector', {
      artifact_id: 'test-artifact',
      traces: [{ name: 'some_operation', service: 'svc', trace_id: 'fake', duration_ms: 100 }],
      dry_run: true,
    });

    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.violation_type === 'fabricated_trace_id');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
    expect(violation!.blocked_manufacturing).toBe(true);
  });

  it('detects synthetic- prefixed trace ID as critical', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('evidence-fabrication-detector', {
      artifact_id: 'test-artifact',
      traces: [{ name: 'real_op', service: 'svc', trace_id: 'synthetic-001', duration_ms: 50 }],
      dry_run: true,
    });

    const violation = result.violations.find((v) => v.violation_type === 'fabricated_trace_id');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
  });

  it('detects missing trace ID as critical (empty string)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('evidence-fabrication-detector', {
      artifact_id: 'test-artifact',
      traces: [{ name: 'real_op', service: 'svc', trace_id: '', duration_ms: 50 }],
      dry_run: true,
    });

    const violation = result.violations.find((v) => v.violation_type === 'fabricated_trace_id');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
  });

  it('flags zero-duration span as warning (not critical) — does NOT block manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('evidence-fabrication-detector', {
      artifact_id: 'test-artifact',
      // Valid trace_id but zero duration
      traces: [{ name: 'zero_op', service: 'svc', trace_id: 'real-trace-id-123', duration_ms: 0 }],
      dry_run: true,
    });

    const zeroDurationViolation = result.violations.find(
      (v) => v.violation_type === 'zero_duration_span'
    );
    expect(zeroDurationViolation).toBeDefined();
    expect(zeroDurationViolation!.severity).toBe('warning');
    expect(zeroDurationViolation!.blocked_manufacturing).toBe(false);
  });

  it('passes cleanly for traces with valid trace IDs and non-zero durations', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('evidence-fabrication-detector', {
      artifact_id: 'test-artifact',
      traces: [
        { name: 'good_op', service: 'svc', trace_id: 'abc-valid-id-123', duration_ms: 42 },
      ],
      dry_run: true,
    });

    const fabricationViolations = result.violations.filter(
      (v) => v.violation_type === 'fabricated_trace_id'
    );
    expect(fabricationViolations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Theater detector
// ---------------------------------------------------------------------------

describe('theater-detector — violation semantics', () => {
  it('empty span attributes are flagged as warning (not critical)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('theater-detector', {
      artifact_id: 'test-artifact',
      traces: [{ name: 'hollow_span', service: 'svc', trace_id: 't001', duration_ms: 10, attributes: {} }],
      dry_run: true,
    });

    const theaterViolation = result.violations.find(
      (v) => v.violation_type === 'empty_span_attributes'
    );
    expect(theaterViolation).toBeDefined();
    expect(theaterViolation!.severity).toBe('warning');
    expect(theaterViolation!.blocked_manufacturing).toBe(false);
  });

  it('suspiciously fast operation (duration 0 < d < 1) is flagged as warning', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('theater-detector', {
      artifact_id: 'test-artifact',
      traces: [{ name: 'instant_op', service: 'svc', trace_id: 't002', duration_ms: 0.5 }],
      dry_run: true,
    });

    const fastViolation = result.violations.find(
      (v) => v.violation_type === 'suspiciously_fast_operation'
    );
    expect(fastViolation).toBeDefined();
    expect(fastViolation!.severity).toBe('warning');
    expect(fastViolation!.blocked_manufacturing).toBe(false);
  });

  it('passes cleanly for traces with non-empty attributes and normal duration', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('theater-detector', {
      artifact_id: 'test-artifact',
      traces: [
        {
          name: 'normal_op',
          service: 'svc',
          trace_id: 't003',
          duration_ms: 25,
          attributes: { algorithm: 'dfg', log_size: 1000 },
        },
      ],
      dry_run: true,
    });

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Authority escalation watcher
// ---------------------------------------------------------------------------

describe('authority-escalation-watcher — violation semantics', () => {
  it('release without validate-ontology is critical and blocks manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('authority-escalation-watcher', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' }, // missing validate-ontology
      ],
      dry_run: true,
    });

    const violation = result.violations.find(
      (v) => v.violation_type === 'release_without_validation'
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
    expect(violation!.blocked_manufacturing).toBe(true);
  });

  it('release without run-benchmark is critical and blocks manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('authority-escalation-watcher', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'release-package' }, // missing run-benchmark
      ],
      dry_run: true,
    });

    const violation = result.violations.find(
      (v) => v.violation_type === 'release_without_benchmark'
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
    expect(violation!.blocked_manufacturing).toBe(true);
  });

  it('no violations when release is preceded by both validate-ontology and run-benchmark', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('authority-escalation-watcher', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ],
      dry_run: true,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('no violations when no release event is present (no release = no authority check)', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('authority-escalation-watcher', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
      ],
      dry_run: true,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProcessMiningSkeptic — ProcessMiningProof quality dimension contract
// ---------------------------------------------------------------------------

describe('process-mining-skeptic — ProcessMiningProof contract', () => {
  it('all 4 quality dimensions are in [0, 1] when OCEL events are present', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ],
      dry_run: true,
    });

    // With all expected stages present: perfect fitness and precision
    expect(result.process_mining_proof).not.toBeNull();
    const proof = result.process_mining_proof!;
    expect(proof.fitness).toBeGreaterThanOrEqual(0);
    expect(proof.fitness).toBeLessThanOrEqual(1);
    expect(proof.precision).toBeGreaterThanOrEqual(0);
    expect(proof.precision).toBeLessThanOrEqual(1);
    expect(proof.generalization).toBeGreaterThanOrEqual(0);
    expect(proof.generalization).toBeLessThanOrEqual(1);
    expect(proof.simplicity).toBeGreaterThanOrEqual(0);
    expect(proof.simplicity).toBeLessThanOrEqual(1);
  });

  it('fitness = 1.0 and precision = 1.0 when all expected stages are present', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ],
      dry_run: true,
    });

    expect(result.process_mining_proof!.fitness).toBe(1.0);
    expect(result.process_mining_proof!.precision).toBe(1.0);
    expect(result.passed).toBe(true);
  });

  it('fitness degrades as stages are skipped (monotonic domain contract)', async () => {
    const orchestrator = new AgentOrchestrator();

    // All 7 stages: fitness = 1.0
    const resultFull = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'full',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
      ],
      dry_run: true,
    });

    // Only 4 stages: fitness < 1.0
    const resultPartial = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'partial',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        // missing: compile-artifact, run-benchmark, release-package
      ],
      dry_run: true,
    });

    expect(resultFull.process_mining_proof!.fitness).toBeGreaterThan(
      resultPartial.process_mining_proof!.fitness
    );
  });

  it('skipped_stages violation is critical and blocks manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        // rest of stages missing
      ],
      dry_run: true,
    });

    const skippedViolation = result.violations.find((v) => v.violation_type === 'skipped_stages');
    expect(skippedViolation).toBeDefined();
    expect(skippedViolation!.severity).toBe('critical');
    expect(skippedViolation!.blocked_manufacturing).toBe(true);
  });

  it('extra_stages violation is warning and does NOT block manufacturing', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'test-artifact',
      ocel_events: [
        { activity: 'seed-ontology' },
        { activity: 'breed-ontology' },
        { activity: 'validate-ontology' },
        { activity: 'project-artifact' },
        { activity: 'compile-artifact' },
        { activity: 'run-benchmark' },
        { activity: 'release-package' },
        { activity: 'unknown-custom-stage' }, // extra stage
      ],
      dry_run: true,
    });

    const extraViolation = result.violations.find((v) => v.violation_type === 'extra_stages');
    expect(extraViolation).toBeDefined();
    expect(extraViolation!.severity).toBe('warning');
    expect(extraViolation!.blocked_manufacturing).toBe(false);
  });

  it('returns passed=true and no proof when no OCEL events are provided', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.executeAgent('process-mining-skeptic', {
      artifact_id: 'test-artifact',
      // no ocel_events
      dry_run: true,
    });

    // No events = nothing to check = pass
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.process_mining_proof).toBeNull();
  });
});
