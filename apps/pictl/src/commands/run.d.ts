import type { OutputOptions } from '../output.js';
export interface RunOptions extends OutputOptions {
    config?: string;
    algorithm?: string;
    input?: string;
    output?: string;
    timeout?: number;
}
export declare const run: import("citty").CommandDef<{
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
    config: {
        type: "string";
        description: string;
    };
    algorithm: {
        type: "string";
        description: string;
        alias: string;
    };
    output: {
        type: "string";
        description: string;
        alias: string;
    };
    format: {
        type: "string";
        description: string;
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
    timeout: {
        type: "string";
        description: string;
    };
    'activity-key': {
        type: "string";
        description: string;
    };
    'no-save': {
        type: "boolean";
        description: string;
    };
    simd: {
        type: "boolean";
        description: string;
    };
    hierarchical: {
        type: "boolean";
        description: string;
    };
    'smart-engine': {
        type: "boolean";
        description: string;
    };
    'no-cache': {
        type: "boolean";
        description: string;
    };
    'cache-stats': {
        type: "boolean";
        description: string;
    };
    'with-quality': {
        type: "boolean";
        description: string;
    };
}>;
//# sourceMappingURL=run.d.ts.map