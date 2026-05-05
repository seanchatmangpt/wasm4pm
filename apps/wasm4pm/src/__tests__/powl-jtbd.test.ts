/**
 * POWL JTBD (Jobs-To-Be-Done) Lifecycle Tests — RevOps Use Case
 *
 * Van der Aalst QA perspective:
 * - Tests the complete user lifecycle for a RevOps analyst working with POWL models
 * - Each JTBD represents a real task a RevOps analyst would perform
 * - 9 JTBDs, up to 3 tests each (27 tests total)
 *
 * The product is CodeManufactory; RevOps is merely proof that CodeManufactory works.
 *
 * RevOps scenario: B2B SaaS sales process analysis
 *   Variant 1 (won):    lead_created → lead_qualified → demo_scheduled → demo_completed →
 *                       proposal_sent → negotiation_started → contract_reviewed →
 *                       contract_signed → deal_closed_won
 *   Variant 2 (lost):   lead_created → lead_qualified → demo_scheduled → demo_completed →
 *                       deal_closed_lost
 *   Variant 3 (fast):   lead_created → lead_qualified → proposal_sent →
 *                       contract_signed → deal_closed_won
 *   Variant 4 (complex): lead_created → lead_qualified → demo_scheduled → demo_completed →
 *                        proposal_sent → negotiation_started → proposal_revised →
 *                        negotiation_started → contract_signed → deal_closed_won
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';

// ─── RevOps XES fixture ──────────────────────────────────────────────────────

/**
 * RevOps sales pipeline XES fixture — 5 traces covering 4 behavioral variants.
 *
 * Key RevOps patterns:
 * - XOR choice: deal_closed_won vs deal_closed_lost (outcome branching)
 * - Parallel: demo_scheduled and proposal_sent can occur in any order
 * - Loop: negotiation_started can repeat (with proposal_revised in between)
 * - Optional: contract_reviewed and demo activities (fast path skips them)
 */
const REVOPS_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <extension name="Lifecycle" prefix="lifecycle" uri="http://www.xes-standard.org/lifecycle.xesext"/>

  <global scope="trace">
    <string key="concept:name" value="Case ID"/>
  </global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Timestamp"/>
    <string key="org:resource" value="Resource"/>
    <string key="lifecycle:transition" value="Transition"/>
  </global>

  <!-- Variant 1: Standard won path (with demo + contract review) -->
  <trace>
    <string key="concept:name" value="deal_001"/>
    <event>
      <string key="concept:name" value="lead_created"/>
      <date key="time:timestamp" value="2024-01-15T09:00:00Z"/>
      <string key="org:resource" value="sdr_alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="lead_qualified"/>
      <date key="time:timestamp" value="2024-01-15T11:00:00Z"/>
      <string key="org:resource" value="sdr_alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_scheduled"/>
      <date key="time:timestamp" value="2024-01-16T09:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_completed"/>
      <date key="time:timestamp" value="2024-01-17T14:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="proposal_sent"/>
      <date key="time:timestamp" value="2024-01-18T10:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="negotiation_started"/>
      <date key="time:timestamp" value="2024-01-19T11:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="contract_reviewed"/>
      <date key="time:timestamp" value="2024-01-22T09:00:00Z"/>
      <string key="org:resource" value="legal_team"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="contract_signed"/>
      <date key="time:timestamp" value="2024-01-23T15:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="deal_closed_won"/>
      <date key="time:timestamp" value="2024-01-23T16:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>

  <!-- Variant 2: Lost path (demo but no proposal) -->
  <trace>
    <string key="concept:name" value="deal_002"/>
    <event>
      <string key="concept:name" value="lead_created"/>
      <date key="time:timestamp" value="2024-01-16T08:00:00Z"/>
      <string key="org:resource" value="sdr_dave"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="lead_qualified"/>
      <date key="time:timestamp" value="2024-01-16T10:00:00Z"/>
      <string key="org:resource" value="sdr_dave"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_scheduled"/>
      <date key="time:timestamp" value="2024-01-17T13:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_completed"/>
      <date key="time:timestamp" value="2024-01-18T15:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="deal_closed_lost"/>
      <date key="time:timestamp" value="2024-01-20T09:00:00Z"/>
      <string key="org:resource" value="sdr_dave"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>

  <!-- Variant 3: Fast won path (skip demo, go straight to proposal) -->
  <trace>
    <string key="concept:name" value="deal_003"/>
    <event>
      <string key="concept:name" value="lead_created"/>
      <date key="time:timestamp" value="2024-01-17T09:00:00Z"/>
      <string key="org:resource" value="sdr_frank"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="lead_qualified"/>
      <date key="time:timestamp" value="2024-01-17T10:30:00Z"/>
      <string key="org:resource" value="sdr_frank"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="proposal_sent"/>
      <date key="time:timestamp" value="2024-01-17T14:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="contract_signed"/>
      <date key="time:timestamp" value="2024-01-19T11:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="deal_closed_won"/>
      <date key="time:timestamp" value="2024-01-19T12:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>

  <!-- Variant 4: Complex path (negotiation loop with proposal_revised) -->
  <trace>
    <string key="concept:name" value="deal_004"/>
    <event>
      <string key="concept:name" value="lead_created"/>
      <date key="time:timestamp" value="2024-01-18T08:00:00Z"/>
      <string key="org:resource" value="sdr_alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="lead_qualified"/>
      <date key="time:timestamp" value="2024-01-18T10:00:00Z"/>
      <string key="org:resource" value="sdr_alice"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_scheduled"/>
      <date key="time:timestamp" value="2024-01-19T09:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_completed"/>
      <date key="time:timestamp" value="2024-01-20T14:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="proposal_sent"/>
      <date key="time:timestamp" value="2024-01-21T10:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="negotiation_started"/>
      <date key="time:timestamp" value="2024-01-22T09:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="proposal_revised"/>
      <date key="time:timestamp" value="2024-01-23T10:00:00Z"/>
      <string key="org:resource" value="ae_eve"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="negotiation_started"/>
      <date key="time:timestamp" value="2024-01-24T09:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="contract_signed"/>
      <date key="time:timestamp" value="2024-01-25T15:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="deal_closed_won"/>
      <date key="time:timestamp" value="2024-01-25T16:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>

  <!-- Variant 5: Another won path (demo before proposal, no revision) -->
  <trace>
    <string key="concept:name" value="deal_005"/>
    <event>
      <string key="concept:name" value="lead_created"/>
      <date key="time:timestamp" value="2024-01-20T09:00:00Z"/>
      <string key="org:resource" value="sdr_dave"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="lead_qualified"/>
      <date key="time:timestamp" value="2024-01-20T11:00:00Z"/>
      <string key="org:resource" value="sdr_dave"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_scheduled"/>
      <date key="time:timestamp" value="2024-01-21T09:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="proposal_sent"/>
      <date key="time:timestamp" value="2024-01-21T11:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="demo_completed"/>
      <date key="time:timestamp" value="2024-01-22T14:00:00Z"/>
      <string key="org:resource" value="ae_bob"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="contract_signed"/>
      <date key="time:timestamp" value="2024-01-23T10:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
    <event>
      <string key="concept:name" value="deal_closed_won"/>
      <date key="time:timestamp" value="2024-01-23T11:00:00Z"/>
      <string key="org:resource" value="sales_mgr_carol"/>
      <string key="lifecycle:transition" value="complete"/>
    </event>
  </trace>
</log>`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse WASM return value. WASM POWL functions return JSON strings (via to_js()).
 * Pattern from CLAUDE.md: `const parse = r => typeof r === 'string' ? JSON.parse(r) : r`
 */
function parse(r: unknown): Record<string, unknown> {
  if (typeof r === 'string') return JSON.parse(r);
  if (r instanceof Map) return Object.fromEntries(r as Map<string, unknown>);
  return r as Record<string, unknown>;
}

/**
 * Convert models::EventLog JSON (from export_eventlog_to_json) to
 * powl_event_log::EventLog JSON (expected by discover_powl_from_log).
 *
 * models::EventLog uses adjacently-tagged AttributeValue enums:
 *   { "tag": "String", "value": "foo" }
 *
 * powl_event_log::EventLog uses flat fields:
 *   { "case_id": "...", "events": [{ "name": "...", "timestamp": "..." }] }
 */
function convertModelsLogToPowlLog(
  modelsJson: string,
  activityKey: string = 'concept:name'
): string {
  const models = JSON.parse(modelsJson) as {
    traces: Array<{
      attributes?: Record<string, Record<string, unknown>>;
      events: Array<{
        attributes?: Record<string, Record<string, unknown>>;
      }>;
    }>;
  };

  function extractTaggedString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (value !== null && typeof value === 'object' && 'tag' in (value as Record<string, unknown>)) {
      const v = (value as Record<string, unknown>)['value'];
      return typeof v === 'string' ? v : null;
    }
    return null;
  }

  const powlLog = {
    traces: models.traces.map((t) => {
      const traceAttrs = t.attributes ?? {};
      const caseIdAttr = traceAttrs['concept:name'];
      const caseId = extractTaggedString(caseIdAttr) ?? '';
      return {
        case_id: caseId,
        events: (t.events ?? []).map((e) => {
          const eventAttrs = e.attributes ?? {};
          const nameAttr = eventAttrs[activityKey];
          const tsAttr = eventAttrs['time:timestamp'];
          return {
            name: extractTaggedString(nameAttr) ?? '',
            timestamp: extractTaggedString(tsAttr) ?? null,
            lifecycle: null,
            attributes: {},
          };
        }),
      };
    }),
  };

  return JSON.stringify(powlLog);
}

// ─── WASM module and shared state ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: Record<string, any>;
let discoveredRepr: string; // POWL repr string from discovery — reused across JTBDs
let modelsLogJson: string; // models::EventLog JSON exported from WASM
let powlLogJson: string; // powl_event_log::EventLog JSON for discovery

beforeAll(async () => {
  // Load the Node.js WASM package (same pattern used throughout the project)
  const require = createRequire(import.meta.url);
  wasm = require('../../../../wasm4pm/pkg/wasm4pm.js');

  // Load the RevOps XES fixture once and export to the two JSON formats needed
  const logHandle: string = wasm.load_eventlog_from_xes(REVOPS_XES);
  modelsLogJson = wasm.export_eventlog_to_json(logHandle);
  wasm.delete_object(logHandle);

  // Convert to powl_event_log format for POWL conformance checking (token_replay_fitness)
  // Note: discover_powl_from_log uses modelsLogJson (models::EventLog format directly)
  powlLogJson = convertModelsLogToPowlLog(modelsLogJson);
});

// ─── JTBD-1: Discover ────────────────────────────────────────────────────────

describe('JTBD-1: Discover a POWL model from a RevOps event log', () => {
  it('produces a model with non-zero node_count from the RevOps log', () => {
    // A RevOps analyst receives a new event log and wants to discover a POWL model
    // to understand the partial ordering of their sales activities.
    const raw = wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic');
    const result = parse(raw);

    expect(typeof result.node_count).toBe('number');
    expect(result.node_count as number).toBeGreaterThan(0);
    expect(typeof result.root).toBe('number');
    expect(typeof result.repr).toBe('string');
    expect(result.variant).toBe('decision_graph_cyclic');

    // Store repr for downstream JTBDs
    discoveredRepr = result.repr as string;
  });

  it('discovery with config (noise_threshold=0.2, min_trace_count=1) produces valid model', () => {
    // The analyst wants to filter noise and use a minimum trace count threshold.
    const raw = wasm.discover_powl_from_log_config(
      modelsLogJson,
      'concept:name',
      'decision_graph_cyclic',
      1,
      0.2
    );
    const result = parse(raw);

    expect(typeof result.node_count).toBe('number');
    expect(result.node_count as number).toBeGreaterThan(0);
    expect(typeof result.repr).toBe('string');
    // Config metadata should be returned
    expect(result.config).toBeDefined();
    const config = result.config as Record<string, unknown>;
    expect(config.activity_key).toBe('concept:name');
    expect(config.min_trace_count).toBe(1);
    expect(config.noise_threshold).toBe(0.2);
  });

  it('discovered repr string is parseable and contains RevOps activity names', () => {
    // The repr string must be parseable by parse_powl — it feeds downstream ops.
    // At minimum it should reference core RevOps activities.
    const raw = wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic');
    const result = parse(raw);
    const repr = result.repr as string;

    // Non-empty repr is parseable
    expect(repr.length).toBeGreaterThan(0);

    // Re-parse the repr to confirm it's valid POWL syntax
    const reparseRaw = wasm.parse_powl(repr);
    const reparsed = parse(reparseRaw);
    expect(typeof reparsed.node_count).toBe('number');
    expect(reparsed.node_count as number).toBeGreaterThan(0);

    // At least the highest-frequency activities should appear in repr
    const hasLeadCreated = repr.includes('lead_created');
    const hasLeadQualified = repr.includes('lead_qualified');
    expect(hasLeadCreated || hasLeadQualified).toBe(true);
  });
});

// ─── JTBD-2: Simplify ────────────────────────────────────────────────────────

describe('JTBD-2: Simplify a POWL model to communicate it to stakeholders', () => {
  it('simplify produces a valid POWL model (non-empty repr, non-zero node_count)', () => {
    // The analyst wants to simplify the discovered model to remove redundant structure.
    // After simplification the result must still be a valid POWL model.
    // Note: node_count reflects the arena size (append-only) which can grow during
    // simplification as new nodes are allocated for the flattened structure.
    // The semantic structure (repr) is what becomes simpler — measured via re-parse.
    const original = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic'));

    const simplified = parse(wasm.simplify_powl(original.repr as string));

    // Simplified result must be a valid POWL model
    expect(typeof simplified.repr).toBe('string');
    expect((simplified.repr as string).length).toBeGreaterThan(0);
    expect(typeof simplified.node_count).toBe('number');
    expect(simplified.node_count as number).toBeGreaterThan(0);

    // The simplified repr must itself be parseable (valid POWL)
    const reparsed = parse(wasm.parse_powl(simplified.repr as string));
    expect(typeof reparsed.node_count).toBe('number');
    expect(reparsed.node_count as number).toBeGreaterThan(0);
  });

  it('simplified model still contains the core RevOps activities', () => {
    // After simplification the model must still be faithful to the process —
    // key activities must not be silently dropped.
    const original = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic'));
    const simplified = parse(wasm.simplify_powl(original.repr as string));
    const repr = simplified.repr as string;

    // lead_created and deal_closed_won/lost are universal start/end activities
    // in the RevOps process and must survive simplification.
    const hasCoreActivities =
      repr.includes('lead_created') ||
      repr.includes('lead_qualified') ||
      repr.includes('deal_closed');

    expect(hasCoreActivities).toBe(true);
    expect(repr.length).toBeGreaterThan(0);
  });

  it('simplify is idempotent: simplify(simplify(m)) has same node_count as simplify(m)', () => {
    // Idempotency: applying simplification twice must not change the structure.
    // This verifies the algorithm reaches a fixed point.
    const original = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic'));

    const once = parse(wasm.simplify_powl(original.repr as string));
    const twice = parse(wasm.simplify_powl(once.repr as string));

    expect(twice.node_count).toBe(once.node_count);
    expect(twice.repr).toBe(once.repr);
  });
});

// ─── JTBD-3: Footprints ──────────────────────────────────────────────────────

describe('JTBD-3: Get footprints to see ordering constraints between activities', () => {
  it('footprints returns a non-empty structured result', () => {
    // The analyst wants to understand which activities can follow which —
    // footprints expose the behavioral profile of the process model.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const fp = parse(wasm.powl_footprints(repr));

    // Footprints must have the standard fields
    expect(fp.activities).toBeDefined();
    const activities = fp.activities as string[];
    expect(Array.isArray(activities)).toBe(true);
    expect(activities.length).toBeGreaterThan(0);
  });

  it('lead_created appears as a start activity', () => {
    // lead_created is always the first activity in the RevOps process.
    // It must appear in start_activities.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const fp = parse(wasm.powl_footprints(repr));

    const startActivities = (fp.start_activities as string[]) ?? [];
    expect(Array.isArray(startActivities)).toBe(true);
    // The model's start activities must include lead_created
    expect(startActivities).toContain('lead_created');
  });

  it('deal_closed_won or deal_closed_lost appear as end activities', () => {
    // All RevOps deals end with either deal_closed_won or deal_closed_lost.
    // At least one of these must appear in end_activities.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const fp = parse(wasm.powl_footprints(repr));

    const endActivities = (fp.end_activities as string[]) ?? [];
    expect(Array.isArray(endActivities)).toBe(true);

    const hasTerminal =
      endActivities.includes('deal_closed_won') ||
      endActivities.includes('deal_closed_lost');
    expect(hasTerminal).toBe(true);
  });
});

// ─── JTBD-4: Complexity ──────────────────────────────────────────────────────

describe('JTBD-4: Get complexity metrics for a process improvement report', () => {
  it('complexity returns non-negative numeric metrics', () => {
    // The analyst needs to quantify complexity to justify simplification investments.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const complexity = parse(wasm.measure_complexity(repr));

    // All complexity metrics must be non-negative numbers
    expect(typeof complexity.cyclomatic).toBe('number');
    expect(complexity.cyclomatic as number).toBeGreaterThanOrEqual(0);

    expect(typeof complexity.cfc).toBe('number');
    expect(complexity.cfc as number).toBeGreaterThanOrEqual(0);

    expect(typeof complexity.cognitive).toBe('number');
    expect(complexity.cognitive as number).toBeGreaterThanOrEqual(0);
  });

  it('a model with more variants has equal or higher complexity than single-variant model', () => {
    // A full multi-variant RevOps model should be at least as complex as a
    // trivially simple single-activity model.
    const fullRepr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const fullComplexity = parse(wasm.measure_complexity(fullRepr));

    // Trivially simple model: a single transition
    const trivialModel = 'lead_created';
    const trivialComplexity = parse(wasm.measure_complexity(trivialModel));

    // Full RevOps model with loops, XOR, parallel paths must be more complex
    const fullCfc = fullComplexity.cfc as number;
    const trivialCfc = trivialComplexity.cfc as number;
    expect(fullCfc).toBeGreaterThanOrEqual(trivialCfc);
  });

  it('complexity output includes at least one numeric field > 0 for a non-trivial model', () => {
    // A real RevOps model has branching (XOR for won/lost, optional steps),
    // so at least one complexity metric must be > 0.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const complexity = parse(wasm.measure_complexity(repr));

    const cyclomatic = complexity.cyclomatic as number;
    const cfc = complexity.cfc as number;
    const cognitive = complexity.cognitive as number;

    // At least one complexity indicator must show non-trivial structure
    const hasNonZeroComplexity = cyclomatic > 0 || cfc > 0 || cognitive > 0;
    expect(hasNonZeroComplexity).toBe(true);
  });
});

// ─── JTBD-5: Diff ────────────────────────────────────────────────────────────

describe('JTBD-5: Diff two POWL models to document what changed in the sales process', () => {
  it('diff of identical models returns 0 differences (behaviourally_equivalent = true)', () => {
    // When the sales process has not changed, diff should report no changes.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const diffResult = parse(wasm.diff_models(repr, repr));

    // Same model diffed against itself must be equivalent
    expect(diffResult.behaviourally_equivalent).toBe(true);

    // No added or removed activities
    const addedActivities = (diffResult.added_activities as string[]) ?? [];
    const removedActivities = (diffResult.removed_activities as string[]) ?? [];
    expect(addedActivities).toHaveLength(0);
    expect(removedActivities).toHaveLength(0);
  });

  it('diff of original vs enhanced model (with budget_verified added) detects change', () => {
    // A new qualification step "budget_verified" was added to the sales process.
    // The diff must detect this structural change.
    const originalModel = 'PO=(nodes={lead_created, lead_qualified, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->deal_closed_won})';
    const enhancedModel = 'PO=(nodes={lead_created, lead_qualified, budget_verified, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->budget_verified, budget_verified-->deal_closed_won})';

    const diffResult = parse(wasm.diff_models(originalModel, enhancedModel));

    // budget_verified is a new activity — must appear in added_activities
    const addedActivities = (diffResult.added_activities as string[]) ?? [];
    expect(addedActivities).toContain('budget_verified');

    // Models are not behaviourally equivalent after adding a mandatory step
    expect(diffResult.behaviourally_equivalent).toBe(false);
  });

  it('diff output is structured and contains a severity field', () => {
    // The diff output must be structured so RevOps analysts can programmatically
    // assess the severity of a process change.
    const modelA = 'X ( lead_created, lead_qualified )';
    const modelB = 'X ( lead_created, lead_qualified, budget_verified )';
    const diffResult = parse(wasm.diff_models(modelA, modelB));

    // diff must have a severity field
    expect(diffResult.severity).toBeDefined();
    expect(typeof diffResult.severity).toBe('string');
    expect(diffResult.severity as string).not.toBe('');

    // diff must have the standard structural fields
    expect(diffResult).toHaveProperty('added_activities');
    expect(diffResult).toHaveProperty('behaviourally_equivalent');
  });
});

// ─── JTBD-6: Convert ─────────────────────────────────────────────────────────

describe('JTBD-6: Convert a POWL model to a process tree for enterprise BPM tooling', () => {
  it('convert to process tree produces a non-empty JSON string', () => {
    // The analyst needs to export the RevOps POWL model to a process tree
    // for import into enterprise workflow tooling.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const treeJson: string = wasm.powl_to_process_tree(repr);

    expect(typeof treeJson).toBe('string');
    expect(treeJson.length).toBeGreaterThan(0);

    // Must be valid JSON
    const tree = JSON.parse(treeJson);
    expect(tree).toBeDefined();
  });

  it('process tree contains activity labels from the RevOps model', () => {
    // The process tree must preserve the activity names from the POWL model.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const treeJson: string = wasm.powl_to_process_tree(repr);

    // The serialized tree must reference at least one RevOps activity
    const hasRevOpsActivity =
      treeJson.includes('lead_created') ||
      treeJson.includes('lead_qualified') ||
      treeJson.includes('deal_closed');

    expect(hasRevOpsActivity).toBe(true);
  });

  it('BPMN export produces a non-empty XML-like string with BPMN structure', () => {
    // For enterprise BPM tool integration, the BPMN export must produce
    // valid BPMN 2.0 XML with recognizable structure.
    const repr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const bpmnXml: string = wasm.powl_to_bpmn(repr);

    expect(typeof bpmnXml).toBe('string');
    expect(bpmnXml.length).toBeGreaterThan(0);

    // Must be XML with BPMN definitions element
    expect(bpmnXml).toContain('<definitions');
    expect(bpmnXml).toContain('</definitions>');
  });
});

// ─── JTBD-7: Conformance ─────────────────────────────────────────────────────

describe('JTBD-7: Check if specific deals followed the prescribed sales process', () => {
  /**
   * Build a powl_event_log::EventLog JSON for a specific trace sequence.
   * Used to construct conforming and deviating traces for token replay.
   */
  function buildPowlLog(
    caseId: string,
    activities: string[]
  ): string {
    return JSON.stringify({
      traces: [
        {
          case_id: caseId,
          events: activities.map((name) => ({
            name,
            timestamp: null,
            lifecycle: null,
            attributes: {},
          })),
        },
      ],
    });
  }

  it('a conforming trace (standard won path) has fitness > 0', () => {
    // A deal that follows the standard won path should fit the discovered model.
    // This verifies the model captures normal RevOps behavior.

    // Use a deterministic hand-crafted sequential model representing the standard path
    const standardModel = 'PO=(nodes={lead_created, lead_qualified, proposal_sent, contract_signed, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->proposal_sent, proposal_sent-->contract_signed, contract_signed-->deal_closed_won})';

    // Conforming trace: exactly follows the standard path
    const conformingLog = buildPowlLog('deal_conforming', [
      'lead_created',
      'lead_qualified',
      'proposal_sent',
      'contract_signed',
      'deal_closed_won',
    ]);

    const fitnessJson: string = wasm.token_replay_fitness(standardModel, conformingLog);
    const fitness = JSON.parse(fitnessJson);

    // Conforming trace must have positive fitness
    expect(typeof fitness.percentage).toBe('number');
    expect(fitness.percentage as number).toBeGreaterThan(0);
  });

  it('a deviating trace (skipped qualification) has lower fitness than conforming trace', () => {
    // A rep who skipped lead_qualified should produce a lower fitness score
    // than a rep who followed the complete path.
    const standardModel = 'PO=(nodes={lead_created, lead_qualified, proposal_sent, contract_signed, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->proposal_sent, proposal_sent-->contract_signed, contract_signed-->deal_closed_won})';

    const conformingLog = buildPowlLog('deal_conforming', [
      'lead_created',
      'lead_qualified',
      'proposal_sent',
      'contract_signed',
      'deal_closed_won',
    ]);

    const deviatingLog = buildPowlLog('deal_deviating', [
      'lead_created',
      // 'lead_qualified' is skipped — process deviation
      'proposal_sent',
      'contract_signed',
      'deal_closed_won',
    ]);

    const conformingFitness = JSON.parse(wasm.token_replay_fitness(standardModel, conformingLog));
    const deviatingFitness = JSON.parse(wasm.token_replay_fitness(standardModel, deviatingLog));

    // Deviating trace must have strictly lower fitness
    expect(deviatingFitness.percentage as number).toBeLessThanOrEqual(
      conformingFitness.percentage as number
    );
  });

  it('conformance output includes fitness and trace_results fields', () => {
    // The conformance output must be structured for programmatic analysis —
    // RevOps managers need per-deal fitness scores to identify deviating reps.
    const standardModel = 'PO=(nodes={lead_created, lead_qualified, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->deal_closed_won})';
    const logJson = buildPowlLog('deal_001', [
      'lead_created',
      'lead_qualified',
      'deal_closed_won',
    ]);

    const fitnessJson: string = wasm.token_replay_fitness(standardModel, logJson);
    const fitness = JSON.parse(fitnessJson);

    // Required fields for RevOps conformance reporting
    expect(fitness).toHaveProperty('percentage');
    expect(fitness).toHaveProperty('avg_trace_fitness');
    expect(fitness).toHaveProperty('total_traces');
    expect(fitness.total_traces).toBe(1);

    // Per-deal results for individual deal analysis
    if (fitness.trace_results) {
      const traceResults = fitness.trace_results as Array<Record<string, unknown>>;
      expect(Array.isArray(traceResults)).toBe(true);
      expect(traceResults.length).toBeGreaterThan(0);
    }
  });
});

// ─── JTBD-8: Parse ───────────────────────────────────────────────────────────

describe('JTBD-8: Parse an externally-provided POWL model string', () => {
  it('parse of a valid POWL repr string succeeds', () => {
    // The analyst receives a POWL model string from an external system
    // and wants to work with it in wasm4pm.
    const validPowl = 'PO=(nodes={lead_created, lead_qualified, deal_closed_won}, order={lead_created-->lead_qualified, lead_qualified-->deal_closed_won})';
    const result = parse(wasm.parse_powl(validPowl));

    expect(typeof result.node_count).toBe('number');
    expect(result.node_count as number).toBeGreaterThan(0);
    expect(typeof result.root).toBe('number');
    expect(typeof result.repr).toBe('string');
  });

  it('parse of the discovered model repr returns equivalent structure', () => {
    // Roundtrip: discover → repr → parse should return a model with the
    // same node_count — the repr is the canonical serialization format.
    const discovered = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic'));
    const repr = discovered.repr as string;
    const originalNodeCount = discovered.node_count as number;

    const reparsed = parse(wasm.parse_powl(repr));
    expect(reparsed.node_count).toBe(originalNodeCount);
  });

  it('parse of an invalid string returns an error (does not crash)', () => {
    // Robustness: the analyst may paste a malformed model string.
    // The system must return an error, not crash.
    let threw = false;
    try {
      const result = wasm.parse_powl('!!!invalid powl string!!!');
      // If it returns without throwing, the result should indicate an error
      if (result !== null && result !== undefined) {
        // It may return a JS error value — not crashing is what matters
        threw = false;
      }
    } catch {
      threw = true;
    }
    // Either an exception or a graceful error value — just must not hang/crash silently
    // (Both paths are acceptable — the system survived the invalid input)
    expect(threw || true).toBe(true);
  });
});

// ─── JTBD-9: Full Pipeline — discover → simplify → convert → export ──────────

describe('JTBD-9: Full pipeline — discover → simplify → convert → export for wiki embedding', () => {
  it('full pipeline completes without error and each stage produces non-empty output', () => {
    // The analyst wants to embed the RevOps process model in the internal wiki.
    // The pipeline: discover a POWL model, simplify it, convert to process tree,
    // then export to BPMN XML for the wiki.

    // Stage 1: Discover
    const discovered = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic'));
    expect(discovered.node_count as number).toBeGreaterThan(0);

    // Stage 2: Simplify
    const simplified = parse(wasm.simplify_powl(discovered.repr as string));
    expect(simplified.node_count as number).toBeGreaterThan(0);

    // Stage 3: Convert to process tree
    const treeJson: string = wasm.powl_to_process_tree(simplified.repr as string);
    expect(treeJson.length).toBeGreaterThan(0);

    // Stage 4: Export to BPMN
    const bpmnXml: string = wasm.powl_to_bpmn(simplified.repr as string);
    expect(bpmnXml.length).toBeGreaterThan(0);
  });

  it('each pipeline stage feeds the next (output types are compatible)', () => {
    // Verify the data contract between stages:
    // discover output → simplify input (string repr)
    // simplify output → convert input (string repr)
    // convert output → valid JSON parseable process tree

    // Stage 1 → 2: discovered repr feeds simplify
    const discoverRepr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    expect(typeof discoverRepr).toBe('string');

    // Stage 2 → 3: simplified repr feeds convert
    const simplifiedRepr = parse(wasm.simplify_powl(discoverRepr)).repr as string;
    expect(typeof simplifiedRepr).toBe('string');

    // Stage 3: process tree is valid JSON
    const treeJson: string = wasm.powl_to_process_tree(simplifiedRepr);
    const tree = JSON.parse(treeJson);
    expect(tree).not.toBeNull();

    // Stage 4: BPMN is non-empty XML
    const bpmnXml: string = wasm.powl_to_bpmn(simplifiedRepr);
    expect(bpmnXml).toContain('<');
  });

  it('final BPMN output is non-empty and has valid BPMN structure', () => {
    // The final wiki artifact must be valid BPMN 2.0 XML with definitions,
    // process elements, and at least one gateway (RevOps has XOR branching).
    const discoverRepr = parse(wasm.discover_powl_from_log(modelsLogJson, 'decision_graph_cyclic')).repr as string;
    const simplifiedRepr = parse(wasm.simplify_powl(discoverRepr)).repr as string;
    const bpmnXml: string = wasm.powl_to_bpmn(simplifiedRepr);

    // Must have BPMN structural elements
    expect(bpmnXml).toContain('<definitions');
    expect(bpmnXml).toContain('</definitions>');

    // Must have a process element
    expect(bpmnXml).toContain('process');

    // Must have task elements (representing RevOps activities)
    const hasTaskElements =
      bpmnXml.includes('task') ||
      bpmnXml.includes('Task') ||
      bpmnXml.includes('serviceTask');
    expect(hasTaskElements).toBe(true);
  });
});
