/**
 * Planner test fixtures — 12 sample configurations covering all execution profiles,
 * source kinds, algorithm types, and edge cases.
 */
export interface TestConfig {
    version: '1.0';
    source: {
        kind: string;
        path?: string;
        format?: string;
        content?: string;
    };
    execution: {
        profile: string;
        timeout?: number;
        maxMemory?: number;
        mode?: string;
        maxEvents?: number;
        parameters?: Record<string, unknown>;
    };
    observability?: {
        otel?: {
            enabled: boolean;
            endpoint?: string;
        };
        logLevel?: string;
        metricsEnabled?: boolean;
    };
    watch?: {
        enabled: boolean;
        interval: number;
        debounce?: number;
    };
    output?: {
        format: string;
        destination: string;
        pretty?: boolean;
        colorize?: boolean;
        generateReports?: boolean;
        includeMetrics?: boolean;
    };
    pipeline?: Array<{
        id: string;
        type: string;
        required?: boolean;
        parameters?: Record<string, unknown>;
        dependsOn?: string[];
        parallelizable?: boolean;
    }>;
    metadata?: {
        name?: string;
        description?: string;
        tags?: string[];
    };
}
/** Minimal valid config — fast DFG discovery */
export declare const MINIMAL_CONFIG: TestConfig;
/** Balanced profile with Alpha++ */
export declare const BALANCED_ALPHA_CONFIG: TestConfig;
/** Quality profile with genetic algorithm */
export declare const QUALITY_GENETIC_CONFIG: TestConfig;
/** Streaming profile with watch mode */
export declare const STREAM_WATCH_CONFIG: TestConfig;
/** HTTP source with OTEL enabled */
export declare const HTTP_OTEL_CONFIG: TestConfig;
/** Pipeline config with multi-step DAG */
export declare const PIPELINE_DAG_CONFIG: TestConfig;
/** ILP optimization config */
export declare const ILP_CONFIG: TestConfig;
/** OCEL (object-centric) config */
export declare const OCEL_CONFIG: TestConfig;
/** Config with inline XES content */
export declare const INLINE_CONTENT_CONFIG: TestConfig;
/** Edge case: all optional fields omitted */
export declare const BARE_MINIMUM_CONFIG: TestConfig;
/** Edge case: maxed-out timeouts and memory */
export declare const MAX_RESOURCES_CONFIG: TestConfig;
/** Invalid configs for negative testing */
export declare const INVALID_CONFIGS: Record<string, unknown>;
/** All valid configs as an array for iteration */
export declare const ALL_VALID_CONFIGS: TestConfig[];
//# sourceMappingURL=configs.d.ts.map