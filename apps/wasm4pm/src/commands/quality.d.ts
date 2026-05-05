import type { OutputOptions } from '../output.js';
export interface QualityOptions extends OutputOptions {
    input?: string;
    metrics?: string;
    activityKey?: string;
}
export declare const quality: import("citty").CommandDef<{
    input: {
        type: "positional";
        description: string;
        required: false;
    };
    file: {
        type: "string";
        description: string;
        alias: string;
    };
    metrics: {
        type: "string";
        description: string;
        default: string;
    };
    'activity-key': {
        type: "string";
        description: string;
        default: string;
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
//# sourceMappingURL=quality.d.ts.map