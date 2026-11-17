/**
 * zod-validators.ts — Runtime validation schemas for @wasm4pm/contracts
 *
 * Zod is NOT a declared dependency of this package (no external dep bloat).
 * These validators are implemented as plain TypeScript structural validators
 * with the same API surface as Zod's safeParse / parse — so they can be
 * swapped for real Zod schemas if the dep is ever added.
 *
 * Schemas covered (priority order):
 *   1. ReceiptSchema            — Receipt + sub-types
 *   2. ConformanceResultSchema  — FitnessResult / ConformanceEvaluation
 *   3. EventLogSchema           — EventLogIR / LogTrace / LogEvent
 *
 * Corresponding wasm4pm-compat bindings (for reference):
 *   /Users/sac/wasm4pm-compat/bindings/zod_schemas.ts
 *   - ReceiptSchema (line 689), ConformanceResultSchema (line 119)
 *   - EventLogSchema (line 269), EventSchema (line 248), TraceSchema (line 752)
 */
import { z } from 'zod';
export const ParseErrorSchema = z.object({
    success: z.literal(false),
    error: z.object({
        issues: z.array(z.object({
            path: z.array(z.union([z.string(), z.number()])),
            message: z.string(),
        })),
    }),
});
function ok(data) {
    return { success: true, data };
}
function fail(issues) {
    return { success: false, error: { issues } };
}
// ── 1. ReceiptSchema ──────────────────────────────────────────────────────────
function validateErrorInfo(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.code !== 'string')
        errs.push(`${path.join('.')}.code: must be string`);
    if (typeof o.message !== 'string')
        errs.push(`${path.join('.')}.message: must be string`);
    return errs;
}
function validateExecutionSummary(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.traces_processed !== 'number')
        errs.push(`${path.join('.')}.traces_processed: must be number`);
    if (typeof o.objects_processed !== 'number')
        errs.push(`${path.join('.')}.objects_processed: must be number`);
    if (typeof o.variants_discovered !== 'number')
        errs.push(`${path.join('.')}.variants_discovered: must be number`);
    return errs;
}
function validateAlgorithmInfo(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.name !== 'string')
        errs.push(`${path.join('.')}.name: must be string`);
    if (typeof o.version !== 'string')
        errs.push(`${path.join('.')}.version: must be string`);
    if (typeof o.parameters !== 'object' || o.parameters === null)
        errs.push(`${path.join('.')}.parameters: must be object`);
    return errs;
}
function validateModelInfo(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.nodes !== 'number')
        errs.push(`${path.join('.')}.nodes: must be number`);
    if (typeof o.edges !== 'number')
        errs.push(`${path.join('.')}.edges: must be number`);
    return errs;
}
/**
 * Parse and validate a Receipt at runtime.
 *
 * Mirrors wasm4pm-compat ReceiptSchema.safeParse().
 */
export function parseReceipt(value) {
    const issues = [];
    if (!value || typeof value !== 'object') {
        return fail([{ path: [], message: 'Receipt must be an object' }]);
    }
    const r = value;
    const stringFields = [
        'run_id', 'trace_id', 'schema_version',
        'config_hash', 'input_hash', 'plan_hash', 'output_hash',
        'start_time', 'end_time',
    ];
    for (const f of stringFields) {
        if (typeof r[f] !== 'string' || r[f].length === 0) {
            issues.push({ path: [f], message: `must be a non-empty string` });
        }
    }
    if (typeof r.duration_ms !== 'number' || !isFinite(r.duration_ms) || r.duration_ms < 0) {
        issues.push({ path: ['duration_ms'], message: 'must be a non-negative finite number' });
    }
    if (!['success', 'partial', 'failed'].includes(r.status)) {
        issues.push({ path: ['status'], message: "must be 'success' | 'partial' | 'failed'" });
    }
    if (r.error !== undefined) {
        for (const msg of validateErrorInfo(r.error, ['error'])) {
            issues.push({ path: ['error'], message: msg });
        }
    }
    for (const msg of validateExecutionSummary(r.summary, ['summary'])) {
        issues.push({ path: ['summary'], message: msg });
    }
    for (const msg of validateAlgorithmInfo(r.algorithm, ['algorithm'])) {
        issues.push({ path: ['algorithm'], message: msg });
    }
    for (const msg of validateModelInfo(r.model, ['model'])) {
        issues.push({ path: ['model'], message: msg });
    }
    if (issues.length > 0)
        return fail(issues);
    return ok(value);
}
/**
 * Assert a value is a valid Receipt or throw a descriptive error.
 */
export function assertReceipt(value) {
    const result = parseReceipt(value);
    if (!result.success) {
        const msgs = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new TypeError(`Invalid Receipt — ${msgs}`);
    }
    return result.data;
}
// ── 2. ConformanceResultSchema ────────────────────────────────────────────────
/**
 * Parse and validate a FitnessResult at runtime.
 *
 * Mirrors wasm4pm-compat ConformanceResultSchema / TokenReplayResultSchema.
 */
export function parseFitnessResult(value) {
    if (!value || typeof value !== 'object') {
        return fail([{ path: [], message: 'FitnessResult must be an object' }]);
    }
    const r = value;
    const issues = [];
    if (typeof r.avg_trace_fitness !== 'number' || !isFinite(r.avg_trace_fitness)) {
        issues.push({ path: ['avg_trace_fitness'], message: 'must be a finite number' });
    }
    if (typeof r.avg_trace_precision !== 'number' || !isFinite(r.avg_trace_precision)) {
        issues.push({ path: ['avg_trace_precision'], message: 'must be a finite number' });
    }
    if (issues.length > 0)
        return fail(issues);
    return ok(value);
}
/**
 * Assert a value is a valid FitnessResult or throw.
 */
export function assertFitnessResult(value) {
    const result = parseFitnessResult(value);
    if (!result.success) {
        const msgs = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new TypeError(`Invalid FitnessResult — ${msgs}`);
    }
    return result.data;
}
// ── 3. EventLogSchema ─────────────────────────────────────────────────────────
function validateLogEvent(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.activity !== 'string' || o.activity.length === 0) {
        errs.push(`${path.join('.')}.activity: must be a non-empty string`);
    }
    if (typeof o.timestamp !== 'string' || o.timestamp.length === 0) {
        errs.push(`${path.join('.')}.timestamp: must be a non-empty ISO-8601 string`);
    }
    if (typeof o.attributes !== 'object' || o.attributes === null) {
        errs.push(`${path.join('.')}.attributes: must be an object`);
    }
    return errs;
}
function validateLogTrace(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    if (typeof o.case_id !== 'string' || o.case_id.length === 0) {
        errs.push(`${path.join('.')}.case_id: must be a non-empty string`);
    }
    if (!Array.isArray(o.events)) {
        errs.push(`${path.join('.')}.events: must be an array`);
    }
    else {
        for (let i = 0; i < o.events.length; i++) {
            for (const msg of validateLogEvent(o.events[i], [...path, 'events', i])) {
                errs.push(msg);
            }
        }
    }
    return errs;
}
function validateLogMetadata(v, path) {
    const errs = [];
    if (!v || typeof v !== 'object') {
        errs.push(`${path.join('.')}: must be an object`);
        return errs;
    }
    const o = v;
    const numFields = ['trace_count', 'event_count', 'activity_count'];
    for (const f of numFields) {
        if (typeof o[f] !== 'number' || !isFinite(o[f])) {
            errs.push(`${path.join('.')}.${f}: must be a finite number`);
        }
    }
    const strFields = ['start_time', 'end_time', 'source_hash'];
    for (const f of strFields) {
        if (typeof o[f] !== 'string' || o[f].length === 0) {
            errs.push(`${path.join('.')}.${f}: must be a non-empty string`);
        }
    }
    return errs;
}
/**
 * Parse and validate an EventLogIR at runtime.
 *
 * Mirrors wasm4pm-compat EventLogSchema.safeParse().
 * All 60 algorithms ingest EventLogIR — catching bad input here prevents
 * runtime panics or silent corruption in WASM.
 */
export function parseEventLogIR(value) {
    if (!value || typeof value !== 'object') {
        return fail([{ path: [], message: 'EventLogIR must be an object' }]);
    }
    const r = value;
    const issues = [];
    if (r.format_version !== '1.0') {
        issues.push({ path: ['format_version'], message: "must be '1.0'" });
    }
    const validFormats = ['xes', 'ocel', 'json', 'csv'];
    if (!validFormats.includes(r.source_format)) {
        issues.push({ path: ['source_format'], message: `must be one of: ${validFormats.join(', ')}` });
    }
    if (!Array.isArray(r.traces)) {
        issues.push({ path: ['traces'], message: 'must be an array' });
    }
    else {
        for (let i = 0; i < r.traces.length; i++) {
            for (const msg of validateLogTrace(r.traces[i], ['traces', i])) {
                issues.push({ path: ['traces', i], message: msg });
            }
        }
    }
    for (const msg of validateLogMetadata(r.metadata, ['metadata'])) {
        issues.push({ path: ['metadata'], message: msg });
    }
    if (issues.length > 0)
        return fail(issues);
    return ok(value);
}
/**
 * Assert a value is a valid EventLogIR or throw.
 */
export function assertEventLogIR(value) {
    const result = parseEventLogIR(value);
    if (!result.success) {
        const msgs = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new TypeError(`Invalid EventLogIR — ${msgs}`);
    }
    return result.data;
}
//# sourceMappingURL=zod-validators.js.map