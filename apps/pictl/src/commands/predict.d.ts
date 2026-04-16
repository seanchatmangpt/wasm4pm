import type { OutputOptions } from '../output.js';
export interface PredictOptions extends OutputOptions {
    input?: string;
    activityKey?: string;
    prefix?: string;
    topK?: number;
}
export declare const predict: import("citty").CommandDef<{
    task: {
        type: "positional";
        description: string;
        required: true;
    };
    input: {
        type: "string";
        description: string;
        required: true;
        alias: string;
    };
    'activity-key': {
        type: "string";
        description: string;
    };
    prefix: {
        type: "string";
        description: string;
    };
    'top-k': {
        type: "string";
        description: string;
    };
    'ngram-order': {
        type: "string";
        description: string;
    };
    'drift-window': {
        type: "string";
        description: string;
    };
    config: {
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
}>;
//# sourceMappingURL=predict.d.ts.map