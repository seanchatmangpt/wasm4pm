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
export declare const powl: import("citty").CommandDef<{
    subcommand: {
        type: "positional";
        description: string;
    };
    model: {
        type: "string";
        description: string;
    };
    model2: {
        type: "string";
        description: string;
    };
    log: {
        type: "string";
        description: string;
        alias: string;
    };
    to: {
        type: "string";
        description: string;
    };
    from: {
        type: "string";
        description: string;
    };
    format: {
        type: "string";
        description: string;
        default: string;
    };
    verbose: {
        type: "boolean";
        description: string;
        alias: string;
    };
    quiet: {
        type: "boolean";
        description: string;
        alias: string;
    };
    'no-save': {
        type: "boolean";
        description: string;
    };
    index: {
        type: "string";
        description: string;
    };
    input: {
        type: "string";
        description: string;
        alias: string;
    };
    variant: {
        type: "string";
        description: string;
    };
    'activity-key': {
        type: "string";
        description: string;
    };
    'min-trace-count': {
        type: "string";
        description: string;
    };
    'noise-threshold': {
        type: "string";
        description: string;
    };
}>;
//# sourceMappingURL=powl.d.ts.map