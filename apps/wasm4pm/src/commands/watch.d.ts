import type { OutputOptions } from '../output.js';
export interface WatchOptions extends OutputOptions {
    config?: string;
    interval?: number;
    quiet?: boolean;
}
export declare const watch: import("citty").CommandDef<{
    config: {
        type: "string";
        description: string;
    };
    interval: {
        type: "string";
        description: string;
    };
    format: {
        type: "string";
        description: string;
    };
    verbose: {
        type: "boolean";
        description: string;
    };
    quiet: {
        type: "boolean";
        description: string;
    };
}>;
//# sourceMappingURL=watch.d.ts.map