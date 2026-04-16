/**
 * Audit pictl's own process execution
 * Captures OTEL spans and produces conformance report
 *
 * @param {Array} otelSpans - OTEL spans from collector
 * @param {Object} options - Audit configuration
 * @returns {Promise<Object>} Audit report
 */
export function auditPictlProcess(otelSpans: any[], options?: Object): Promise<Object>;
/**
 * Load OTEL spans from JSON file (e.g., from OTEL collector export)
 * @param {string} filePath - Path to JSON file with spans
 * @returns {Array}
 */
export function loadSpansFromFile(filePath: string): any[];
/**
 * Load OTEL spans from Jaeger API
 * @param {string} jaegerUrl - Jaeger API base URL
 * @param {string} serviceName - Service name to query
 * @param {Object} options - Query options (limit, lookback, etc.)
 * @returns {Promise<Array>}
 */
export function loadSpansFromJaeger(jaegerUrl: string, serviceName: string, options?: Object): Promise<any[]>;
/**
 * OCEL event log structure
 * Object-centric event log for conformance checking
 */
export class OCELEventLog {
    /**
     * Convert OTEL spans to OCEL events
     * @param {Array} spans - Array of OTEL spans from collector
     * @returns {OCELEventLog}
     */
    static fromOtelSpans(spans: any[]): OCELEventLog;
    events: any[];
    objects: Map<any, any>;
    timestamps: any[];
    /**
     * Extract object references from span attributes
     * Maps span attributes to OCEL object types
     * @private
     */
    private _extractObjects;
    /**
     * Generate DFG (Directly-Follows Graph) from events
     * @returns {Object} DFG with nodes and edges
     */
    toDFG(): Object;
    /**
     * Serialize to JSON
     */
    toJSON(): {
        event_count: number;
        object_count: number;
        timestamp_range: (number | null)[];
        events: any[];
        objects: any[];
    };
}
/**
 * Process Mining Auditor
 * Compares discovered vs declared process
 */
export class PictlAuditor {
    constructor(declaredProcess: any, config?: {});
    declaredProcess: any;
    discoveredProcess: {
        model_type: string;
        activities: any;
        transitions: any;
        start_activities: any[];
        end_activities: any[];
    } | null;
    ocel: OCELEventLog | null;
    config: {
        fitnessThreshold: any;
        varianceThreshold: any;
        maxDeviations: any;
    };
    /**
     * Run conformance audit
     * @param {Array} spans - OTEL spans from session
     * @returns {Promise<Object>} Audit report
     */
    audit(spans: any[]): Promise<Object>;
    /**
     * Discover process from OCEL using DFG
     * In production, would use pm4py or wasm4pm
     * For now: simple DFG-based discovery
     * @private
     */
    private _discoverProcess;
    /**
     * Compare discovered vs declared process
     * @private
     */
    private _compareProcesses;
    /**
     * Calculate conformance metrics
     * @private
     */
    private _calculateMetrics;
    /**
     * Generate audit verdict based on metrics
     * @private
     */
    private _generateVerdict;
    /**
     * Generate evidence for verdict
     * @private
     */
    private _generateEvidence;
    /**
     * Discover trace variants from event log
     * @private
     */
    private _discoverVariants;
    /**
     * Normalize declared process from YAML/config
     * @private
     */
    private _normalizeDeclaredProcess;
}
//# sourceMappingURL=conformance-audit.d.mts.map