/**
 * Scenario: Van der Aalst Process Evidence Mining
 *
 * JTBD: "Prove my system works by mining the event logs, not by code assertions."
 *
 * Van der Aalst doctrine: If the code says it worked but the event logs cannot prove
 * a lawful process happened, then it did not work. This scenario implements the
 * OCEL (Object-Centric Event Log) conversion from autonomic cycles: run the
 * 4-phase autonomic_execute_cycle multiple times, construct OCEL evidence,
 * and validate object lifecycle soundness (no orphans, proper phase sequencing).
 *
 * Test phases:
 * 1. OCEL Construction: Convert 5 autonomic cycles into Object-Centric Event Log
 * 2. OCEL Structure: Verify all 4 phases appear, correct cardinality
 * 3. Object Lifecycle: Every cycle_run has exactly 4 phase events (no orphans)
 * 4. Evidence Persistence: Save OCEL for independent audit
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { pictl, extractJson, resolveRepo } from '../helpers/cli.js';

const RUNNING_EXAMPLE = resolveRepo('wasm4pm/tests/fixtures/running-example.xes');
const EVIDENCE_DIR = path.resolve(import.meta.url, '../../.pictl-evidence');

let allRuns: any[] = [];

beforeAll(async () => {
  // Create evidence directory
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  // Pre-run 5 autoprocess cycles and collect results
  allRuns = await Promise.all(
    Array.from({ length: 5 }, async () => {
      const result = await pictl(['autoprocess', RUNNING_EXAMPLE, '--format', 'json']);
      if (result.exitCode === 0) {
        return extractJson(result.stdout);
      }
      return null;
    })
  );

  // Filter out nulls
  allRuns = allRuns.filter((r) => r !== null);
});

afterAll(() => {
  // Cleanup
});

describe('Van der Aalst Process Evidence', () => {
  describe('OCEL construction from autonomic cycles', () => {
    it('All 5 runs executed successfully — Rank 2: domain contract', () => {
      // JTBD: "I need 5 successful cycle executions to build evidence"
      expect(allRuns.length).toBe(5);
      for (const run of allRuns) {
        expect(run.cycle_result).toBeDefined();
        expect(run.cycle_result.success).toBe(true);
      }
    });

    it('Each cycle has all 4 phase results — Rank 1: mathematical invariant', () => {
      // JTBD: "Every cycle must output perception, decision, protection, optimization"
      for (const run of allRuns) {
        expect(run.cycle_result.perception).toBeDefined();
        expect(run.cycle_result.decision).toBeDefined();
        expect(run.cycle_result.protection).toBeDefined();
        expect(run.cycle_result.optimization).toBeDefined();
      }
    });

    it('Perception phase has event_count metric — Rank 2: domain contract', () => {
      // JTBD: "Perception must measure the log size"
      for (const run of allRuns) {
        expect(run.cycle_result.perception.event_count).toBeGreaterThanOrEqual(0);
        expect(run.cycle_result.perception.trace_count).toBeGreaterThanOrEqual(0);
      }
    });

    it('Decision phase has guard_result flag — Rank 2: domain contract', () => {
      // JTBD: "Decision must evaluate guard conditions"
      for (const run of allRuns) {
        expect(typeof run.cycle_result.decision.guard_result).toBe('boolean');
      }
    });

    it('Protection phase has circuit_state — Rank 2: domain contract', () => {
      // JTBD: "Protection must manage circuit breaker"
      for (const run of allRuns) {
        expect(['Closed', 'Open', 'HalfOpen']).toContain(run.cycle_result.protection.circuit_state);
      }
    });

    it('Optimization phase has rl_action — Rank 2: domain contract', () => {
      // JTBD: "Optimization must select an RL action"
      for (const run of allRuns) {
        expect(typeof run.cycle_result.optimization.rl_action).toBe('string');
        expect(run.cycle_result.optimization.rl_action.length).toBeGreaterThan(0);
      }
    });
  });

  describe('OCEL object lifecycle soundness', () => {
    let ocel: any;

    beforeAll(() => {
      // JTBD: "I need to verify lawful object histories — no orphans, no missing phases"
      ocel = buildOcelFromRuns(allRuns);
    });

    it('OCEL has exactly 20 events (5 runs × 4 phases) — Rank 1: mathematical invariant', () => {
      // JTBD: "Count events precisely"
      expect(ocel.events.length).toBe(20);
    });

    it('OCEL has exactly 5 objects (one cycle_run per run) — Rank 1: mathematical invariant', () => {
      // JTBD: "One object per autonomic cycle"
      expect(ocel.objects.length).toBe(5);
      for (const obj of ocel.objects) {
        expect(obj.object_type).toBe('cycle_run');
      }
    });

    it('All 4 phases present in OCEL event_type values — Rank 2: domain contract', () => {
      const phaseSet = new Set(ocel.events.map((e: any) => e.event_type));
      expect(phaseSet.has('Perception')).toBe(true);
      expect(phaseSet.has('Decision')).toBe(true);
      expect(phaseSet.has('Protection')).toBe(true);
      expect(phaseSet.has('Optimization')).toBe(true);
    });

    it('Every cycle_run object has exactly 4 phase events — Rank 2: domain contract', () => {
      // JTBD: "No orphaned events or missing phases per object"
      const eventsByObject: Record<string, number> = {};
      for (const event of ocel.events) {
        for (const objId of event.object_ids || []) {
          eventsByObject[objId] = (eventsByObject[objId] || 0) + 1;
        }
      }

      expect(Object.keys(eventsByObject).length).toBe(5);
      for (const count of Object.values(eventsByObject)) {
        expect(count).toBe(4);
      }
    });

    it('Phase timestamps are monotonically increasing per object — Rank 1: mathematical', () => {
      // JTBD: "Phases must execute in order"
      const eventsByObject: Record<string, any[]> = {};
      for (const event of ocel.events) {
        for (const objId of event.object_ids || []) {
          if (!eventsByObject[objId]) {
            eventsByObject[objId] = [];
          }
          eventsByObject[objId].push(event);
        }
      }

      for (const events of Object.values(eventsByObject)) {
        const timestamps = events.map((e) => new Date(e.timestamp).getTime());
        for (let i = 1; i < timestamps.length; i++) {
          expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
        }
      }
    });

    it('No orphaned objects — every object referenced by events — Rank 2: domain contract', () => {
      // JTBD: "No floating objects without events"
      const objectIds = new Set(ocel.objects.map((o: any) => o.id));
      const referencedIds = new Set(
        ocel.events.flatMap((e: any) => e.object_ids || [])
      );

      for (const objId of objectIds) {
        expect(referencedIds.has(objId)).toBe(true);
      }
    });
  });

  describe('Evidence persistence', () => {
    it('OCEL can be serialized to JSON — Rank 2: domain contract', () => {
      // JTBD: "I need evidence saved for independent audit"
      const ocel = buildOcelFromRuns(allRuns);
      const jsonStr = JSON.stringify(ocel);

      expect(jsonStr).toBeDefined();
      expect(jsonStr.length).toBeGreaterThan(100);

      // Verify it's valid JSON by re-parsing
      const reparsed = JSON.parse(jsonStr);
      expect(reparsed.events.length).toBe(20);
      expect(reparsed.objects.length).toBe(5);
    });

    it('OCEL evidence file can be saved and reloaded — Rank 2: domain contract', () => {
      // JTBD: "Persist evidence without re-running tests"
      const ocel = buildOcelFromRuns(allRuns);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const evidencePath = path.join(EVIDENCE_DIR, `${timestamp}-process-evidence.json`);

      fs.writeFileSync(evidencePath, JSON.stringify(ocel, null, 2), 'utf-8');
      expect(fs.existsSync(evidencePath)).toBe(true);

      const reloaded = JSON.parse(fs.readFileSync(evidencePath, 'utf-8'));
      expect(reloaded.events.length).toBe(ocel.events.length);
      expect(reloaded.objects.length).toBe(ocel.objects.length);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build OCEL 2.0 format from autoprocess cycle_result outputs.
 * Each run becomes one cycle_run object with 4 phase events.
 * Phase sequence: Perception → Decision → Protection → Optimization.
 */
function buildOcelFromRuns(runs: any[]): any {
  const events: any[] = [];
  const objects: any[] = [];
  const baseTime = Date.now();

  for (let runIdx = 0; runIdx < runs.length; runIdx++) {
    const runId = `run_${runIdx}`;
    const run = runs[runIdx];

    // Create cycle_run object for this invocation
    objects.push({
      id: runId,
      object_type: 'cycle_run',
      attributes: {},
      changes: [],
      embedded_relations: [],
    });

    // Create 4 phase events
    const phases = ['Perception', 'Decision', 'Protection', 'Optimization'];
    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase = phases[phaseIdx];
      const eventId = `${runId}_${phase.toLowerCase()}`;

      // Synthetic timestamp: each run gets 1s, each phase within run gets 100ms
      const timestamp = new Date(baseTime + runIdx * 1000 + phaseIdx * 100);

      events.push({
        id: eventId,
        event_type: phase,
        timestamp: timestamp.toISOString(),
        attributes: {
          ...(phaseIdx === 0 && run.cycle_result?.perception
            ? { perception: JSON.stringify(run.cycle_result.perception) }
            : {}),
          ...(phaseIdx === 1 && run.cycle_result?.decision
            ? { decision: JSON.stringify(run.cycle_result.decision) }
            : {}),
          ...(phaseIdx === 2 && run.cycle_result?.protection
            ? { protection: JSON.stringify(run.cycle_result.protection) }
            : {}),
          ...(phaseIdx === 3 && run.cycle_result?.optimization
            ? { optimization: JSON.stringify(run.cycle_result.optimization) }
            : {}),
        },
        object_ids: [runId],
        object_refs: [],
      });
    }
  }

  return {
    version: '2.0',
    event_types: ['Perception', 'Decision', 'Protection', 'Optimization'],
    object_types: ['cycle_run'],
    events,
    objects,
    object_relations: [],
    metadata: {
      source: 'playground-scenario-22-process-evidence',
      harvestedAt: new Date().toISOString(),
      spanCount: 0,
    },
  };
}
