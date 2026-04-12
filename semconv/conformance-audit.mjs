/**
 * Process Mining Conformance Auditor — Van der Aalst Doctrine
 * "If the code says it worked but the event log cannot prove a lawful process happened, then it did not work."
 *
 * This module captures pictl's own OTel spans as an OCEL event log, discovers the actual process,
 * and compares against the declared process to produce a conformance verdict.
 *
 * Verdicts:
 * - TRUTHFUL: fitness ≥ 0.95 (implementation matches declared behavior)
 * - VARIANCE: fitness 0.7–0.95 (undocumented branches or rework detected)
 * - DECEPTIVE: fitness < 0.7 (implementation contradicts declared model)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * OCEL event log structure
 * Object-centric event log for conformance checking
 */
export class OCELEventLog {
  constructor() {
    this.events = [];
    this.objects = new Map();
    this.timestamps = [];
  }

  /**
   * Convert OTEL spans to OCEL events
   * @param {Array} spans - Array of OTEL spans from collector
   * @returns {OCELEventLog}
   */
  static fromOtelSpans(spans) {
    const log = new OCELEventLog();

    // Group spans by trace_id for object-centric view
    const byTrace = new Map();
    for (const span of spans) {
      const traceId = span.trace_id;
      if (!byTrace.has(traceId)) {
        byTrace.set(traceId, []);
      }
      byTrace.get(traceId).push(span);
    }

    // Convert each trace to object-centric events
    for (const [traceId, traceSpans] of byTrace.entries()) {
      const sortedSpans = traceSpans.sort((a, b) =>
        new Date(a.start_time) - new Date(b.start_time)
      );

      for (const span of sortedSpans) {
        const event = {
          id: `event:${span.span_id}`,
          timestamp: span.start_time,
          activity: span.name,
          service: span.attributes?.service_name || 'pictl',
          status: span.status?.code || 'UNSET',
          duration_ms: span.end_time
            ? new Date(span.end_time) - new Date(span.start_time)
            : 0,
          attributes: span.attributes || {},
          omap: [],
        };

        // Determine object references from span attributes
        const objectRefs = log._extractObjects(span, traceId);
        event.omap = objectRefs;

        // Track objects
        for (const objRef of objectRefs) {
          if (!log.objects.has(objRef.object_id)) {
            log.objects.set(objRef.object_id, {
              object_id: objRef.object_id,
              object_type: objRef.object_type,
              attributes: {},
              lifecycle: [],
            });
          }

          const obj = log.objects.get(objRef.object_id);
          obj.lifecycle.push({
            event_id: event.id,
            activity: event.activity,
            timestamp: event.timestamp,
          });

          // Capture object attributes from span
          if (span.attributes) {
            Object.assign(obj.attributes, span.attributes);
          }
        }

        log.events.push(event);
        log.timestamps.push(new Date(span.start_time).getTime());
      }
    }

    return log;
  }

  /**
   * Extract object references from span attributes
   * Maps span attributes to OCEL object types
   * @private
   */
  _extractObjects(span, traceId) {
    const objects = [];

    // Tool invocation as primary object
    if (span.name) {
      objects.push({
        object_id: `tool:${span.span_id}`,
        object_type: 'tool_invocation',
        qualifier: span.name,
      });
    }

    // Extract secondary objects based on attributes
    const attrs = span.attributes || {};

    // Discovery result object
    if (attrs.pm_discovery_algorithm) {
      objects.push({
        object_id: `discovery:${traceId}`,
        object_type: 'discovery_result',
        qualifier: attrs.pm_discovery_algorithm,
      });
    }

    // Conformance result object
    if (attrs.pm_conformance_fitness !== undefined) {
      objects.push({
        object_id: `conformance:${traceId}`,
        object_type: 'conformance_result',
        qualifier: 'conformance_check',
      });
    }

    // Analysis result object
    if (attrs.pm_analysis_type) {
      objects.push({
        object_id: `analysis:${traceId}:${attrs.pm_analysis_type}`,
        object_type: 'analysis_result',
        qualifier: attrs.pm_analysis_type,
      });
    }

    // Federation/voting object
    if (attrs.federation_quorum_id) {
      objects.push({
        object_id: `federation:${attrs.federation_quorum_id}`,
        object_type: 'federation_vote',
        qualifier: attrs.federation_node_id || 'unknown',
      });
    }

    return objects;
  }

  /**
   * Generate DFG (Directly-Follows Graph) from events
   * @returns {Object} DFG with nodes and edges
   */
  toDFG() {
    const nodes = new Set();
    const edges = new Map();

    // Collect activities and transitions
    for (let i = 0; i < this.events.length - 1; i++) {
      const current = this.events[i];
      const next = this.events[i + 1];

      nodes.add(current.activity);
      nodes.add(next.activity);

      const edge = `${current.activity} -> ${next.activity}`;
      edges.set(edge, (edges.get(edge) || 0) + 1);
    }

    // Add start/end nodes
    if (this.events.length > 0) {
      nodes.add('START');
      nodes.add('END');
      const first = this.events[0].activity;
      const last = this.events[this.events.length - 1].activity;
      edges.set(`START -> ${first}`, (edges.get(`START -> ${first}`) || 0) + 1);
      edges.set(`${last} -> END`, (edges.get(`${last} -> END`) || 0) + 1);
    }

    return {
      nodes: Array.from(nodes),
      edges: Array.from(edges.entries()).map(([edge, count]) => ({ edge, count })),
    };
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      event_count: this.events.length,
      object_count: this.objects.size,
      timestamp_range: [
        this.timestamps.length > 0 ? Math.min(...this.timestamps) : null,
        this.timestamps.length > 0 ? Math.max(...this.timestamps) : null,
      ],
      events: this.events,
      objects: Array.from(this.objects.values()),
    };
  }
}

/**
 * Process Mining Auditor
 * Compares discovered vs declared process
 */
export class PictlAuditor {
  constructor(declaredProcess, config = {}) {
    this.declaredProcess = declaredProcess;
    this.discoveredProcess = null;
    this.ocel = null;
    this.config = {
      fitnessThreshold: config.fitnessThreshold || 0.95,
      varianceThreshold: config.varianceThreshold || 0.7,
      maxDeviations: config.maxDeviations || 10,
      ...config,
    };
  }

  /**
   * Run conformance audit
   * @param {Array} spans - OTEL spans from session
   * @returns {Promise<Object>} Audit report
   */
  async audit(spans) {
    const startTime = new Date();

    try {
      // Step 1: Convert OTEL spans to OCEL
      this.ocel = OCELEventLog.fromOtelSpans(spans);

      // Step 2: Discover actual process from event log
      this.discoveredProcess = await this._discoverProcess();

      // Step 3: Compare discovered vs declared
      const comparison = this._compareProcesses();

      // Step 4: Calculate metrics
      const metrics = this._calculateMetrics();

      // Step 5: Generate verdict
      const verdict = this._generateVerdict(metrics);

      return {
        timestamp: startTime.toISOString(),
        duration_ms: new Date() - startTime,
        verdict,
        metrics,
        comparison,
        ocel_summary: {
          event_count: this.ocel.events.length,
          object_count: this.ocel.objects.size,
          object_types: Array.from(
            new Set(Array.from(this.ocel.objects.values()).map((o) => o.object_type))
          ),
        },
        evidence: this._generateEvidence(),
      };
    } catch (error) {
      return {
        timestamp: startTime.toISOString(),
        duration_ms: new Date() - startTime,
        verdict: 'ERROR',
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Discover process from OCEL using DFG
   * In production, would use pm4py or wasm4pm
   * For now: simple DFG-based discovery
   * @private
   */
  async _discoverProcess() {
    const dfg = this.ocel.toDFG();

    return {
      model_type: 'dfg',
      activities: dfg.nodes,
      transitions: dfg.edges,
      start_activities: this.ocel.events.length > 0 ? [this.ocel.events[0].activity] : [],
      end_activities:
        this.ocel.events.length > 0
          ? [this.ocel.events[this.ocel.events.length - 1].activity]
          : [],
    };
  }

  /**
   * Compare discovered vs declared process
   * @private
   */
  _compareProcesses() {
    if (!this.discoveredProcess) {
      return { status: 'no_discovery' };
    }

    const declared = this._normalizeDeclaredProcess();
    const discovered = this.discoveredProcess;

    // Analyze differences
    const deviations = [];

    // Normalize activities (remove START/END)
    const declaredActivities = declared.activities.filter((a) => a !== 'START' && a !== 'END');
    const discoveredActivities = (discovered.activities || []).filter(
      (a) => a !== 'START' && a !== 'END'
    );

    // Check for undeclared activities (high severity)
    for (const activity of discoveredActivities) {
      if (!declaredActivities.includes(activity)) {
        deviations.push({
          type: 'undeclared_activity',
          activity,
          severity: 'high',
          message: `Activity '${activity}' not in declared process`,
        });
      }
    }

    // Check for missing activities (high severity)
    for (const activity of declaredActivities) {
      if (!discoveredActivities.includes(activity)) {
        deviations.push({
          type: 'missing_activity',
          activity,
          severity: 'high',
          message: `Activity '${activity}' declared but not executed`,
        });
      }
    }

    // Check transition violations (medium severity)
    const declaredEdges = new Set(
      (declared.transitions || []).map((t) => {
        const from = t.from === 'START' || t.from === 'END' ? t.from : t.from;
        const to = t.to === 'START' || t.to === 'END' ? t.to : t.to;
        return `${from}->${to}`;
      })
    );
    const discoveredEdges = discovered.transitions || [];

    for (const { edge } of discoveredEdges) {
      if (!declaredEdges.has(edge)) {
        // Check if this is a critical ordering violation
        const [fromAct, toAct] = edge.split('->');
        const isOrderingViolation =
          declaredActivities.includes(fromAct) &&
          declaredActivities.includes(toAct) &&
          declaredActivities.indexOf(toAct) < declaredActivities.indexOf(fromAct);

        deviations.push({
          type: 'undeclared_transition',
          transition: edge,
          severity: isOrderingViolation ? 'high' : 'medium',
          message: isOrderingViolation
            ? `Critical: '${toAct}' must come before '${fromAct}' but executed after`
            : `Transition '${edge}' not in declared process`,
        });
      }
    }

    // Activity coverage (what percent of declared activities were executed)
    const coverage =
      declaredActivities.length > 0
        ? discoveredActivities.filter((a) => declaredActivities.includes(a)).length /
          declaredActivities.length
        : 1;

    return {
      activities_match: discoveredActivities.length === declaredActivities.length,
      activity_coverage: coverage,
      deviations: deviations.slice(0, this.config.maxDeviations),
      total_deviations: deviations.length,
      declared_activities: declaredActivities,
      executed_activities: discoveredActivities,
    };
  }

  /**
   * Calculate conformance metrics
   * @private
   */
  _calculateMetrics() {
    const comparison = this._compareProcesses();

    // Fitness calculation: penalize deviations heavily
    // Token replay fitness in production; simplified version here
    let fitness = 1.0;
    let highSeverityCount = 0;
    let mediumSeverityCount = 0;

    if (comparison.deviations) {
      for (const dev of comparison.deviations) {
        if (dev.severity === 'high') {
          highSeverityCount++;
          fitness -= 0.10; // Heavy penalty for high severity
        } else if (dev.severity === 'medium') {
          mediumSeverityCount++;
          fitness -= 0.05; // Medium penalty
        } else {
          fitness -= 0.02; // Low penalty
        }
      }
    }

    // Additional penalty based on total deviation count
    const totalPenalty = Math.min(0.5, (comparison.total_deviations || 0) * 0.03);
    fitness -= totalPenalty;

    // Precision: how specific discovered model is
    // Low precision if many undeclared activities
    const declaredProc = this._normalizeDeclaredProcess();
    const undeclaredCount = (comparison.deviations || []).filter(
      (d) => d.type === 'undeclared_activity'
    ).length;
    const precision = Math.max(
      0,
      (1.0 - undeclaredCount * 0.1) * (comparison.activity_coverage || 1.0)
    );

    // Generalization: model's flexibility
    // Lower if fitness is high (deterministic) and model is strict
    const generalization =
      fitness > 0.85
        ? 0.85 + (0.15 * Math.min(1, (comparison.total_deviations || 0) / 5))
        : fitness * 0.9;

    // Simplicity: inverse of deviation count
    // Simpler = fewer deviations, less rework
    const simplicity = Math.max(0, 1.0 - Math.min(1.0, (comparison.total_deviations || 0) * 0.15));

    return {
      fitness: Math.max(0, Math.min(1.0, parseFloat(fitness.toFixed(2)))),
      precision: Math.max(0, Math.min(1.0, parseFloat(precision.toFixed(2)))),
      generalization: Math.max(0, Math.min(1.0, parseFloat(generalization.toFixed(2)))),
      simplicity: Math.max(0, Math.min(1.0, parseFloat(simplicity.toFixed(2)))),
    };
  }

  /**
   * Generate audit verdict based on metrics
   * @private
   */
  _generateVerdict(metrics) {
    const { fitness } = metrics;

    if (fitness >= this.config.fitnessThreshold) {
      return {
        status: 'TRUTHFUL',
        confidence: fitness,
        message:
          'Process is truthful — implementation matches declared behavior (fitness ≥ 0.95)',
      };
    } else if (fitness >= this.config.varianceThreshold) {
      return {
        status: 'VARIANCE',
        confidence: fitness,
        message:
          'Process shows variance — undocumented branches or rework detected (0.70 ≤ fitness < 0.95)',
      };
    } else {
      return {
        status: 'DECEPTIVE',
        confidence: fitness,
        message:
          'Process is deceptive — implementation contradicts declared model (fitness < 0.70)',
      };
    }
  }

  /**
   * Generate evidence for verdict
   * @private
   */
  _generateEvidence() {
    if (!this.ocel) {
      return { status: 'no_data' };
    }

    const dfg = this.ocel.toDFG();
    const variants = this._discoverVariants();

    return {
      event_log_size: this.ocel.events.length,
      object_count: this.ocel.objects.size,
      dfg_nodes: dfg.nodes.length,
      dfg_edges: dfg.edges.length,
      variant_count: variants.length,
      most_common_variant: variants.length > 0 ? variants[0].sequence : null,
      variant_frequencies: variants.slice(0, 5),
      object_lifecycles: Array.from(this.ocel.objects.values())
        .slice(0, 5)
        .map((obj) => ({
          id: obj.object_id,
          type: obj.object_type,
          lifecycle_length: obj.lifecycle.length,
        })),
    };
  }

  /**
   * Discover trace variants from event log
   * @private
   */
  _discoverVariants() {
    const variants = new Map();

    // Group events by object ID (simplified variant grouping)
    const byObject = new Map();
    for (const event of this.ocel.events) {
      for (const obj of event.omap) {
        if (!byObject.has(obj.object_id)) {
          byObject.set(obj.object_id, []);
        }
        byObject.get(obj.object_id).push(event);
      }
    }

    // Build variant sequences
    for (const [objId, events] of byObject.entries()) {
      const sequence = events.map((e) => e.activity).join(' -> ');
      variants.set(sequence, (variants.get(sequence) || 0) + 1);
    }

    // Sort by frequency
    return Array.from(variants.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sequence, count]) => ({
        sequence,
        frequency: count,
        percentage: ((count / Math.max(1, byObject.size)) * 100).toFixed(1),
      }));
  }

  /**
   * Normalize declared process from YAML/config
   * @private
   */
  _normalizeDeclaredProcess() {
    // Extract from pictl-process-mining.yaml span definitions
    // Simplified: assume declared spans define activities and sequencing

    const activities = [
      'pm.discovery',
      'pm.conformance',
      'pm.analysis',
      'federation.quorum_vote',
      'federation.receipt_chain',
    ];

    const transitions = [
      { from: 'START', to: 'pm.discovery' },
      { from: 'pm.discovery', to: 'pm.conformance' },
      { from: 'pm.conformance', to: 'pm.analysis' },
      { from: 'pm.analysis', to: 'federation.quorum_vote' },
      { from: 'federation.quorum_vote', to: 'federation.receipt_chain' },
      { from: 'federation.receipt_chain', to: 'END' },
    ];

    return { activities, transitions };
  }
}

/**
 * Audit pictl's own process execution
 * Captures OTEL spans and produces conformance report
 *
 * @param {Array} otelSpans - OTEL spans from collector
 * @param {Object} options - Audit configuration
 * @returns {Promise<Object>} Audit report
 */
export async function auditPictlProcess(otelSpans, options = {}) {
  const declaredProcess = {
    // Declared span sequence from pictl-process-mining.yaml
    spans: [
      'pm.discovery',
      'pm.conformance',
      'pm.analysis',
      'federation.quorum_vote',
      'federation.receipt_chain',
    ],
  };

  const auditor = new PictlAuditor(declaredProcess, options);
  return auditor.audit(otelSpans);
}

/**
 * Load OTEL spans from JSON file (e.g., from OTEL collector export)
 * @param {string} filePath - Path to JSON file with spans
 * @returns {Array}
 */
export function loadSpansFromFile(filePath) {
  try {
    const data = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(data);
    return json.resourceSpans
      ? json.resourceSpans.flatMap((rs) =>
          rs.scopeSpans.flatMap((ss) =>
            ss.spans.map((span) => ({
              span_id: span.spanId,
              trace_id: span.traceId,
              parent_span_id: span.parentSpanId,
              name: span.name,
              start_time: new Date(parseInt(span.startTimeUnixNano) / 1000000).toISOString(),
              end_time: new Date(parseInt(span.endTimeUnixNano) / 1000000).toISOString(),
              status: span.status,
              attributes: span.attributes,
            }))
          )
        )
      : [];
  } catch (error) {
    console.error(`Failed to load spans from ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Load OTEL spans from Jaeger API
 * @param {string} jaegerUrl - Jaeger API base URL
 * @param {string} serviceName - Service name to query
 * @param {Object} options - Query options (limit, lookback, etc.)
 * @returns {Promise<Array>}
 */
export async function loadSpansFromJaeger(jaegerUrl, serviceName, options = {}) {
  const limit = options.limit || 100;
  const lookback = options.lookback || '1h';

  try {
    const url = new URL(`${jaegerUrl}/api/traces`);
    url.searchParams.set('service', serviceName);
    url.searchParams.set('limit', limit);
    url.searchParams.set('lookback', lookback);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Jaeger API error: ${response.status}`);
    }

    const data = await response.json();
    const spans = [];

    for (const trace of data.data || []) {
      for (const span of trace.spans || []) {
        spans.push({
          span_id: span.spanID,
          trace_id: span.traceID,
          parent_span_id: span.parentSpanID,
          name: span.operationName,
          start_time: new Date(span.startTime / 1000).toISOString(),
          end_time: new Date((span.startTime + span.duration) / 1000).toISOString(),
          status: { code: span.logs ? 'OK' : 'ERROR' },
          attributes: Object.fromEntries(
            (span.tags || []).map((tag) => [tag.key, tag.value])
          ),
        });
      }
    }

    return spans;
  } catch (error) {
    console.error(`Failed to load spans from Jaeger:`, error.message);
    return [];
  }
}

export { OCELEventLog, PictlAuditor };
