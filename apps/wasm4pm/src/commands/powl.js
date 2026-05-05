/**
 * POWL (Partially Ordered Workflow Language) command group
 *
 * Process model analysis following van der Aalst's framework:
 *   - Parse/serialize POWL models
 *   - Simplify (XOR/LOOP merging, SPO inlining)
 *   - Convert to Petri Net, Process Tree, BPMN
 *   - Structural + behavioral diff
 *   - Complexity metrics (cyclomatic, CFC, cognitive, Halstead)
 *   - Behavioral footprints
 *   - Token replay conformance checking
 */
import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { WasmLoader } from '@wasm4pm/engine';
import { savePredictionResult } from './results.js';
const POWL_SUBCOMMANDS = [
    'parse',
    'simplify',
    'convert',
    'diff',
    'complexity',
    'footprints',
    'conformance',
    'import',
    'discover',
    'get-children',
    'node-info',
];
const CONVERT_TARGETS = ['petri-net', 'process-tree', 'bpmn'];
const IMPORT_SOURCES = ['process-tree', 'petri-net'];
export const powl = defineCommand({
    meta: {
        name: 'powl',
        description: 'POWL model analysis — parse, convert, simplify, diff, complexity, footprints, conformance, import, discover, get-children, node-info',
    },
    args: {
        subcommand: {
            type: 'positional',
            description: `Operation: ${POWL_SUBCOMMANDS.join(', ')}`,
        },
        model: {
            type: 'string',
            description: 'POWL model string, .powl file, or file to import (for import subcommand)',
        },
        model2: {
            type: 'string',
            description: 'Second POWL model (for diff)',
        },
        log: {
            type: 'string',
            description: 'Path to XES event log (for conformance)',
            alias: 'l',
        },
        to: {
            type: 'string',
            description: 'Target format for convert: petri-net, process-tree, bpmn',
        },
        from: {
            type: 'string',
            description: 'Source format for import: process-tree, petri-net',
        },
        format: {
            type: 'string',
            description: 'Output format (human or json)',
            default: 'human',
        },
        verbose: {
            type: 'boolean',
            description: 'Enable verbose output',
            alias: 'v',
        },
        quiet: {
            type: 'boolean',
            description: 'Suppress non-error output',
            alias: 'q',
        },
        'no-save': {
            type: 'boolean',
            description: 'Do not persist the result to .wasm4pm/results/',
        },
        index: {
            type: 'string',
            description: 'Arena node index (for get-children, node-info)',
        },
        input: {
            type: 'string',
            description: 'Path to XES event log (for discover)',
            alias: 'i',
        },
        variant: {
            type: 'string',
            description: 'POWL discovery variant: decision_graph_cyclic (default), decision_graph_cyclic_strict, decision_graph_max, decision_graph_clustering, dynamic_clustering, maximal, tree',
        },
        'activity-key': {
            type: 'string',
            description: 'Event attribute key for activity names (default: concept:name)',
        },
        'min-trace-count': {
            type: 'string',
            description: 'Minimum trace count for a cut (default: 1)',
        },
        'noise-threshold': {
            type: 'string',
            description: 'Noise threshold for fall-through (default: 0.0)',
        },
    },
    async run(ctx) {
        const formatter = getFormatter({
            format: ctx.args.format,
            verbose: !!ctx.args.verbose,
            quiet: !!ctx.args.quiet,
        });
        try {
            const subcommand = ctx.args.subcommand;
            if (!POWL_SUBCOMMANDS.includes(subcommand)) {
                formatter.error(`Unknown operation: "${subcommand}". Valid: ${POWL_SUBCOMMANDS.join(', ')}`);
                process.exit(EXIT_CODES.source_error);
            }
            // Step 1: Resolve model input (inline string or file)
            // discover subcommand uses --input instead of --model
            const needsModel = !['discover'].includes(subcommand);
            const modelInput = ctx.args.model;
            if (needsModel && !modelInput) {
                formatter.error(`Missing required argument: --model`);
                process.exit(EXIT_CODES.source_error);
            }
            const modelStr = needsModel ? (await resolveModelInput(modelInput)) ?? '' : '';
            if (needsModel && !modelStr) {
                process.exit(EXIT_CODES.source_error);
            }
            // Step 2: Load WASM
            // Reset singleton to respect quiet flag for each command
            WasmLoader.reset();
            const loader = WasmLoader.getInstance({ quiet: ctx.args.quiet });
            await loader.init();
            const wasm = loader.get();
            // Step 3: Execute subcommand
            const result = await executePowlCommand(wasm, subcommand, modelStr, modelInput ?? '', ctx.args);
            // Step 4: Output
            if (formatter instanceof JSONFormatter) {
                formatter.success(`POWL ${subcommand} complete`, result);
            }
            else {
                formatter.success(`POWL ${subcommand} complete`);
                formatHumanOutput(formatter, subcommand, result);
            }
            // Step 5: Persist
            if (!ctx.args['no-save']) {
                const inputLabel = modelInput && modelInput.length > 100 ? modelInput.slice(0, 100) + '...' : (modelInput || '');
                const savedPath = await savePredictionResult(`powl-${subcommand}`, inputLabel, '', result);
                if (savedPath && formatter instanceof HumanFormatter) {
                    formatter.debug(`Result saved: ${savedPath}`);
                }
            }
            process.exit(EXIT_CODES.success);
        }
        catch (error) {
            if (formatter instanceof JSONFormatter) {
                formatter.error('POWL operation failed', error);
            }
            else {
                formatter.error(`POWL operation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
            process.exit(EXIT_CODES.execution_error);
        }
    },
});
// ─── Helpers ────────────────────────────────────────────────────────────
/**
 * Normalize WASM return value to a plain object.
 * serde_wasm_bindgen converts serde_json::Map to JS Map — convert to plain object.
 */
function normalizeResult(raw) {
    if (raw instanceof Map) {
        return Object.fromEntries(raw);
    }
    if (typeof raw === 'string') {
        return JSON.parse(raw);
    }
    return raw;
}
/**
 * Convert models::EventLog JSON (nested attributes with tagged enums) to
 * powl_event_log::EventLog JSON (flat {name, case_id, timestamp} fields).
 *
 * models::EventLog:  { "traces": [{ "attributes": {...}, "events": [{ "attributes": {...} }] }] }
 * powl_event_log:   { "traces": [{ "case_id": "...", "events": [{ "name": "...", "timestamp": "..." }] }] }
 */
function convertModelsLogToPowlLog(modelsJson, activityKey) {
    const models = JSON.parse(modelsJson);
    const powlLog = {
        traces: models.traces.map((t) => {
            const traceAttrs = t.attributes ?? {};
            // Extract case_id from concept:name attribute
            const caseIdAttr = traceAttrs[activityKey];
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
/** Extract a string value from a serde adjacently-tagged attribute: {"tag":"String","value":"A"} → "A" */
function extractTaggedString(value) {
    if (typeof value === 'string')
        return value;
    if (value !== null && typeof value === 'object' && 'tag' in value) {
        const v = value['value'];
        return typeof v === 'string' ? v : null;
    }
    return null;
}
/**
 * Resolve model input: if it looks like a file path, read it; otherwise treat as inline string.
 */
async function resolveModelInput(input) {
    // If it contains path separators or ends with .powl, treat as file
    if (input.includes('/') || input.includes('\\') || input.endsWith('.powl')) {
        try {
            await fs.access(input);
            return fs.readFile(input, 'utf-8');
        }
        catch {
            // Not a valid file path — treat as inline string
            return input;
        }
    }
    return input;
}
/**
 * Dispatch to the appropriate WASM POWL function.
 */
async function executePowlCommand(wasm, subcommand, modelStr, rawInput, args) {
    switch (subcommand) {
        case 'parse': {
            const raw = wasm.parse_powl(modelStr);
            return normalizeResult(raw);
        }
        case 'simplify': {
            const raw = wasm.simplify_powl(modelStr);
            return normalizeResult(raw);
        }
        case 'convert': {
            const target = args.to;
            if (!target || !CONVERT_TARGETS.includes(target)) {
                process.exit(EXIT_CODES.source_error);
            }
            switch (target) {
                case 'petri-net': {
                    const raw = wasm.powl_to_petri_net(modelStr);
                    return { target, output: raw };
                }
                case 'process-tree': {
                    const raw = wasm.powl_to_process_tree(modelStr);
                    return { target, output: raw };
                }
                case 'bpmn': {
                    const raw = wasm.powl_to_bpmn(modelStr);
                    return { target, output: raw };
                }
            }
            throw new Error(`Unhandled convert target: ${target}`);
        }
        case 'diff': {
            const model2Input = args.model2;
            if (!model2Input) {
                process.exit(EXIT_CODES.source_error);
            }
            const model2 = await resolveModelInput(model2Input);
            if (!model2) {
                process.exit(EXIT_CODES.source_error);
            }
            const raw = wasm.diff_models(modelStr, model2);
            return normalizeResult(raw);
        }
        case 'complexity': {
            const raw = wasm.measure_complexity(modelStr);
            return JSON.parse(raw);
        }
        case 'footprints': {
            const raw = wasm.powl_footprints(modelStr);
            return JSON.parse(raw);
        }
        case 'conformance': {
            const logPath = args.log;
            if (!logPath) {
                process.exit(EXIT_CODES.source_error);
            }
            let logContent;
            try {
                await fs.access(logPath);
                logContent = await fs.readFile(logPath, 'utf-8');
            }
            catch {
                process.exit(EXIT_CODES.source_error);
            }
            const confActivityKey = args['activity-key'] || 'concept:name';
            // Load the log into WASM and convert to powl_event_log format
            // (token_replay_fitness expects flat {name, case_id} not nested attributes)
            const logHandle = wasm.load_eventlog_from_xes(logContent);
            const modelsLogJson = wasm.export_eventlog_to_json(logHandle);
            wasm.delete_object(logHandle);
            const logJson = convertModelsLogToPowlLog(modelsLogJson, confActivityKey);
            const raw = wasm.token_replay_fitness(modelStr, logJson);
            return JSON.parse(raw);
        }
        case 'import': {
            const source = args.from;
            if (!source || !IMPORT_SOURCES.includes(source)) {
                throw new Error(`Unknown source format: "${source}". Valid: ${IMPORT_SOURCES.join(', ')}`);
            }
            // Use rawInput (file path), not modelStr (already-resolved content)
            let fileContent;
            try {
                await fs.access(rawInput);
                fileContent = await fs.readFile(rawInput, 'utf-8');
            }
            catch {
                throw new Error(`Cannot read file: ${rawInput}`);
            }
            switch (source) {
                case 'process-tree': {
                    const raw = wasm.process_tree_to_powl(fileContent);
                    return normalizeResult(raw);
                }
                case 'petri-net': {
                    const raw = wasm.petri_net_to_powl(fileContent);
                    return normalizeResult(raw);
                }
            }
            throw new Error(`Unhandled import source: ${source}`);
        }
        case 'get-children': {
            const index = args.index;
            const raw = wasm.get_children(modelStr, index);
            return normalizeResult(raw);
        }
        case 'node-info': {
            const index = args.index;
            const raw = wasm.node_info_json(modelStr, index);
            return JSON.parse(raw); // node_info_json returns a JSON string, not a JsValue
        }
        case 'discover': {
            // POWL discovery from event log
            const input = args.input;
            if (!input) {
                throw new Error('Input log required: use --input or -i');
            }
            // Get discovery parameters
            const variant = args.variant || 'decision_graph_cyclic';
            const activityKey = args['activity-key'] || 'concept:name';
            const minTraceCount = args['min-trace-count'] || 1;
            const noiseThreshold = args['noise-threshold'] || 0.0;
            // Read event log — auto-detect XES vs JSON format
            let logJson;
            if (input.endsWith('.xes')) {
                // XES format: load via WASM and export as models::EventLog JSON
                // (discover_powl_from_log expects models::EventLog with tagged AttributeValue)
                const xesContent = await fs.readFile(input, 'utf-8');
                const logHandle = wasm.load_eventlog_from_xes(xesContent);
                logJson = wasm.export_eventlog_to_json(logHandle);
                wasm.delete_object(logHandle);
            }
            else {
                // JSON format: use directly
                logJson = await fs.readFile(input, 'utf-8');
            }
            // Call appropriate WASM function based on parameters
            let raw;
            if (Object.keys(args).some(k => ['min-trace-count', 'noise-threshold'].includes(k))) {
                // Use config function if custom parameters provided
                raw = wasm.discover_powl_from_log_config(logJson, activityKey, variant, minTraceCount, noiseThreshold);
            }
            else {
                // Use basic function
                raw = wasm.discover_powl_from_log(logJson, variant);
            }
            return normalizeResult(raw);
        }
        default:
            throw new Error(`Unhandled subcommand: ${subcommand}`);
    }
}
/**
 * Format results for human-readable output.
 */
function formatHumanOutput(formatter, subcommand, result) {
    switch (subcommand) {
        case 'parse': {
            formatter.log('');
            formatter.log(`  Root index:   ${result.root}`);
            formatter.log(`  Node count:   ${result.node_count}`);
            formatter.log(`  Representation: ${result.repr}`);
            formatter.log('');
            break;
        }
        case 'simplify': {
            formatter.log('');
            formatter.log(`  Root index:   ${result.root}`);
            formatter.log(`  Node count:   ${result.node_count}`);
            formatter.log(`  Representation: ${result.repr}`);
            formatter.log('');
            break;
        }
        case 'convert': {
            const target = result.target;
            formatter.log('');
            formatter.log(`  Target: ${target}`);
            formatter.log(`  Output length: ${String(result.output).length} chars`);
            // Show first few lines for BPMN/Petri Net
            const output = result.output;
            const lines = output.split('\n').slice(0, 5);
            if (lines.length > 1) {
                formatter.log('  Preview:');
                for (const line of lines) {
                    formatter.log(`    ${line}`);
                }
                if (output.split('\n').length > 5) {
                    formatter.log(`    ... (${output.split('\n').length - 5} more lines)`);
                }
            }
            formatter.log('');
            break;
        }
        case 'diff': {
            formatter.log('');
            formatter.log(`  Severity: ${result.severity}`);
            formatter.log(`  Behaviorally equivalent: ${result.behaviourally_equivalent}`);
            formatter.log(`  Trace length delta: ${result.min_trace_length_delta}`);
            if (result.added_activities && result.added_activities.length > 0) {
                formatter.log(`  Added activities: ${result.added_activities.join(', ')}`);
            }
            if (result.removed_activities && result.removed_activities.length > 0) {
                formatter.log(`  Removed activities: ${result.removed_activities.join(', ')}`);
            }
            if (result.always_changes && result.always_changes.length > 0) {
                formatter.log(`  Always-changes:`);
                for (const ac of result.always_changes) {
                    const type = Object.keys(ac)[0];
                    formatter.log(`    ${type}: ${ac[type]}`);
                }
            }
            if (result.order_changes && result.order_changes.length > 0) {
                formatter.log(`  Order changes: ${result.order_changes.length}`);
            }
            if (result.structure_changes && result.structure_changes.length > 0) {
                formatter.log(`  Structure changes: ${result.structure_changes.length}`);
            }
            formatter.log('');
            break;
        }
        case 'complexity': {
            formatter.log('');
            formatter.log(`  Activities:      ${result.activity_count}`);
            formatter.log(`  Cyclomatic:      ${result.cyclomatic}`);
            formatter.log(`  CFC:             ${result.cfc}`);
            formatter.log(`  Cognitive:       ${result.cognitive}`);
            if (result.halstead) {
                const h = result.halstead;
                formatter.log(`  Halstead volume: ${h.volume}`);
                formatter.log(`  Halstead effort: ${h.effort}`);
            }
            formatter.log('');
            break;
        }
        case 'footprints': {
            formatter.log('');
            formatter.log(`  Activities: ${JSON.stringify(result.activities)}`);
            formatter.log(`  Start activities: ${JSON.stringify(result.start_activities)}`);
            formatter.log(`  End activities:   ${JSON.stringify(result.end_activities)}`);
            formatter.log(`  Always happening: ${JSON.stringify(result.activities_always_happening)}`);
            formatter.log(`  Sequences: ${result.sequence?.length ?? 0}`);
            formatter.log(`  Parallels:  ${result.parallel?.length ?? 0}`);
            formatter.log(`  Min trace length: ${result.min_trace_length}`);
            formatter.log('');
            break;
        }
        case 'conformance': {
            formatter.log('');
            formatter.log(`  Fitness:                    ${(result.percentage * 100).toFixed(1)}%`);
            formatter.log(`  Avg trace fitness:          ${(result.avg_trace_fitness * 100).toFixed(1)}%`);
            formatter.log(`  Perfectly fitting traces:    ${result.perfectly_fitting_traces} / ${result.total_traces}`);
            if (result.trace_results && result.trace_results.length > 0) {
                formatter.log('  Per-trace results:');
                for (const tr of result.trace_results) {
                    const caseId = String(tr.case_id ?? '?');
                    const fit = (tr.fitness * 100).toFixed(1);
                    const missing = tr.missing_tokens ?? 0;
                    const remaining = tr.remaining_tokens ?? 0;
                    const marker = (tr.missing_tokens === 0 && tr.remaining_tokens === 0) ? '✓' : '✗';
                    formatter.log(`    ${marker} ${caseId.padEnd(20)} fitness=${fit}%  missing=${missing} remaining=${remaining}`);
                }
            }
            formatter.log('');
            break;
        }
        case 'import': {
            formatter.log('');
            formatter.log(`  Root index:   ${result.root}`);
            formatter.log(`  Node count:   ${result.node_count}`);
            formatter.log(`  Representation: ${result.repr}`);
            formatter.log('');
            break;
        }
        case 'get-children': {
            formatter.log('');
            formatter.log(`  Children: ${result.children.join(', ')}`);
            formatter.log('');
            break;
        }
        case 'node-info': {
            formatter.log('');
            formatter.log(`  Type: ${result.type}`);
            if (result.label !== undefined)
                formatter.log(`  Label: ${result.label}`);
            formatter.log(`  Children: ${result.children.join(', ')}`);
            if (result.edges)
                formatter.log(`  Edges: ${result.edges.length}`);
            if (result.start_nodes !== undefined)
                formatter.log(`  Start nodes: ${result.start_nodes.join(', ')}`);
            if (result.end_nodes !== undefined)
                formatter.log(`  End nodes: ${result.end_nodes.join(', ')}`);
            if (result.empty_path !== undefined)
                formatter.log(`  Empty path: ${result.empty_path}`);
            formatter.log('');
            break;
        }
        case 'discover': {
            formatter.log('');
            formatter.log(`  Root index:       ${result.root}`);
            formatter.log(`  Node count:       ${result.node_count}`);
            formatter.log(`  Variant:           ${result.variant}`);
            formatter.log(`  Representation:     ${result.repr}`);
            if (result.config) {
                const config = result.config;
                formatter.log(`  Config:`);
                formatter.log(`    Activity key:     ${config.activity_key}`);
                formatter.log(`    Min trace count:  ${config.min_trace_count}`);
                formatter.log(`    Noise threshold: ${config.noise_threshold}`);
            }
            formatter.log('');
            break;
        }
    }
}
//# sourceMappingURL=powl.js.map