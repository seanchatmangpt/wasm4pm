import type { OutputOptions } from '../output.js';
export interface DiffOptions extends OutputOptions {
    log1?: string;
    log2?: string;
    activityKey?: string;
}
export declare const diff: import("citty").CommandDef<{
    log1: {
        type: "positional";
        description: string;
        required: true;
    };
    log2: {
        type: "positional";
        description: string;
        required: true;
    };
    'activity-key': {
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
}>;
//# sourceMappingURL=diff.d.ts.map