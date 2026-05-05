import { z } from 'zod';
/**
 * Schema version for config format migration.
 */
export declare const SCHEMA_VERSION = 1;
export { ALGORITHM_IDS } from '@wasm4pm/contracts';
export type { AlgorithmId } from '@wasm4pm/contracts';
export declare const algorithmIdSchema: z.ZodEnum<["process_skeleton", "dfg", "alpha_plus_plus", "heuristic_miner", "inductive_miner", "declare", "hill_climbing", "simulated_annealing", "a_star", "aco", "optimized_dfg", "pso", "genetic_algorithm", "ilp", "transition_system", "log_to_trie", "causal_graph", "performance_spectrum", "batches", "correlation_miner", "generalization", "petri_net_reduction", "etconformance_precision", "alignments", "complexity_metrics", "pnml_import", "bpmn_import", "powl_to_process_tree", "yawl_export", "playout", "monte_carlo_simulation", "ml_classify", "ml_cluster", "ml_forecast", "ml_anomaly", "ml_regress", "ml_pca"]>;
export declare const sourceKindSchema: z.ZodEnum<["file", "stream", "http"]>;
export declare const sinkKindSchema: z.ZodEnum<["stdout", "file", "http"]>;
export declare const executionProfileSchema: z.ZodEnum<["fast", "balanced", "quality", "stream"]>;
export declare const outputFormatSchema: z.ZodEnum<["human", "json"]>;
export declare const logLevelSchema: z.ZodEnum<["debug", "info", "warn", "error"]>;
export declare const otelExporterSchema: z.ZodEnum<["otlp", "console", "none"]>;
export declare const sourceConfigSchema: z.ZodObject<{
    kind: z.ZodEnum<["file", "stream", "http"]>;
    path: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "file" | "stream" | "http";
    path?: string | undefined;
    url?: string | undefined;
}, {
    kind: "file" | "stream" | "http";
    path?: string | undefined;
    url?: string | undefined;
}>;
export declare const sinkConfigSchema: z.ZodObject<{
    kind: z.ZodEnum<["stdout", "file", "http"]>;
    path: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "stdout" | "file" | "http";
    path?: string | undefined;
    url?: string | undefined;
}, {
    kind: "stdout" | "file" | "http";
    path?: string | undefined;
    url?: string | undefined;
}>;
export declare const algorithmConfigSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodEnum<["process_skeleton", "dfg", "alpha_plus_plus", "heuristic_miner", "inductive_miner", "declare", "hill_climbing", "simulated_annealing", "a_star", "aco", "optimized_dfg", "pso", "genetic_algorithm", "ilp", "transition_system", "log_to_trie", "causal_graph", "performance_spectrum", "batches", "correlation_miner", "generalization", "petri_net_reduction", "etconformance_precision", "alignments", "complexity_metrics", "pnml_import", "bpmn_import", "powl_to_process_tree", "yawl_export", "playout", "monte_carlo_simulation", "ml_classify", "ml_cluster", "ml_forecast", "ml_anomaly", "ml_regress", "ml_pca"]>>;
    parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export";
    parameters: Record<string, unknown>;
}, {
    name?: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export" | undefined;
    parameters?: Record<string, unknown> | undefined;
}>;
export declare const otelConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    exporter: z.ZodDefault<z.ZodEnum<["otlp", "console", "none"]>>;
    endpoint: z.ZodOptional<z.ZodString>;
    required: z.ZodDefault<z.ZodBoolean>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    required: boolean;
    exporter: "none" | "console" | "otlp";
    endpoint?: string | undefined;
    headers?: Record<string, string> | undefined;
}, {
    enabled?: boolean | undefined;
    required?: boolean | undefined;
    endpoint?: string | undefined;
    headers?: Record<string, string> | undefined;
    exporter?: "none" | "console" | "otlp" | undefined;
}>;
export declare const observabilityConfigSchema: z.ZodObject<{
    otel: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        exporter: z.ZodDefault<z.ZodEnum<["otlp", "console", "none"]>>;
        endpoint: z.ZodOptional<z.ZodString>;
        required: z.ZodDefault<z.ZodBoolean>;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        required: boolean;
        exporter: "none" | "console" | "otlp";
        endpoint?: string | undefined;
        headers?: Record<string, string> | undefined;
    }, {
        enabled?: boolean | undefined;
        required?: boolean | undefined;
        endpoint?: string | undefined;
        headers?: Record<string, string> | undefined;
        exporter?: "none" | "console" | "otlp" | undefined;
    }>>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
    metricsEnabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    logLevel: "error" | "debug" | "info" | "warn";
    metricsEnabled: boolean;
    otel?: {
        enabled: boolean;
        required: boolean;
        exporter: "none" | "console" | "otlp";
        endpoint?: string | undefined;
        headers?: Record<string, string> | undefined;
    } | undefined;
}, {
    logLevel?: "error" | "debug" | "info" | "warn" | undefined;
    otel?: {
        enabled?: boolean | undefined;
        required?: boolean | undefined;
        endpoint?: string | undefined;
        headers?: Record<string, string> | undefined;
        exporter?: "none" | "console" | "otlp" | undefined;
    } | undefined;
    metricsEnabled?: boolean | undefined;
}>;
export declare const watchConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    poll_interval: z.ZodDefault<z.ZodNumber>;
    checkpoint_dir: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    poll_interval: number;
    checkpoint_dir?: string | undefined;
}, {
    enabled?: boolean | undefined;
    poll_interval?: number | undefined;
    checkpoint_dir?: string | undefined;
}>;
export declare const outputConfigSchema: z.ZodObject<{
    format: z.ZodDefault<z.ZodEnum<["human", "json"]>>;
    destination: z.ZodDefault<z.ZodString>;
    pretty: z.ZodDefault<z.ZodBoolean>;
    colorize: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    format: "json" | "human";
    destination: string;
    pretty: boolean;
    colorize: boolean;
}, {
    format?: "json" | "human" | undefined;
    destination?: string | undefined;
    pretty?: boolean | undefined;
    colorize?: boolean | undefined;
}>;
export declare const executionConfigSchema: z.ZodObject<{
    profile: z.ZodDefault<z.ZodEnum<["fast", "balanced", "quality", "stream"]>>;
    timeout: z.ZodOptional<z.ZodNumber>;
    maxMemory: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    profile: "stream" | "fast" | "balanced" | "quality";
    timeout?: number | undefined;
    maxMemory?: number | undefined;
}, {
    profile?: "stream" | "fast" | "balanced" | "quality" | undefined;
    timeout?: number | undefined;
    maxMemory?: number | undefined;
}>;
export declare const predictionConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    activityKey: z.ZodDefault<z.ZodString>;
    ngramOrder: z.ZodDefault<z.ZodNumber>;
    driftWindowSize: z.ZodDefault<z.ZodNumber>;
    tasks: z.ZodDefault<z.ZodArray<z.ZodEnum<["drift", "features", "next_activity", "outcome", "remaining_time", "resource"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    activityKey: string;
    tasks: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[];
    ngramOrder: number;
    driftWindowSize: number;
}, {
    enabled?: boolean | undefined;
    activityKey?: string | undefined;
    tasks?: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[] | undefined;
    ngramOrder?: number | undefined;
    driftWindowSize?: number | undefined;
}>;
export declare const mlConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    tasks: z.ZodDefault<z.ZodArray<z.ZodEnum<["classify", "cluster", "forecast", "anomaly", "regress", "pca"]>, "many">>;
    method: z.ZodOptional<z.ZodString>;
    k: z.ZodOptional<z.ZodNumber>;
    targetKey: z.ZodDefault<z.ZodString>;
    forecastPeriods: z.ZodDefault<z.ZodNumber>;
    nComponents: z.ZodDefault<z.ZodNumber>;
    eps: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    eps: number;
    forecastPeriods: number;
    nComponents: number;
    targetKey: string;
    tasks: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[];
    k?: number | undefined;
    method?: string | undefined;
}, {
    enabled?: boolean | undefined;
    k?: number | undefined;
    eps?: number | undefined;
    forecastPeriods?: number | undefined;
    nComponents?: number | undefined;
    method?: string | undefined;
    targetKey?: string | undefined;
    tasks?: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[] | undefined;
}>;
/**
 * RL / GPU execution configuration — LinUCB contextual bandit parameters.
 *
 * Van der Aalst prediction perspective: Resource and Intervention.
 * Question: "Which algorithm should handle the next process mining task?"
 *
 * These parameters control the GPU-accelerated LinUCB kernel defined in
 * wasm4pm/src/gpu/linucb_kernel.wgsl and its CPU reference in
 * wasm4pm/src/ml/linucb.rs.
 */
export declare const rlConfigSchema: z.ZodObject<{
    /** Enable GPU dispatch via the LinUCB WGSL kernel (requires gpu feature). */
    gpu_enabled: z.ZodDefault<z.ZodBoolean>;
    /**
     * LinUCB regularization coefficient λ.
     * A is initialised to λI; larger values produce more conservative exploration.
     * Default: 1.0
     */
    linucb_lambda: z.ZodDefault<z.ZodNumber>;
    /**
     * UCB exploration bonus α.
     * Q̂_a(x) = w_a·x + b_a + α√(x^T A^{-1} x).
     * Default: √2 ≈ 1.4142 (standard LinUCB recommendation from Li et al. 2010).
     */
    ucb1_exploration: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    gpu_enabled: boolean;
    linucb_lambda: number;
    ucb1_exploration: number;
}, {
    gpu_enabled?: boolean | undefined;
    linucb_lambda?: number | undefined;
    ucb1_exploration?: number | undefined;
}>;
export declare const configSchema: z.ZodObject<{
    schemaVersion: z.ZodDefault<z.ZodNumber>;
    version: z.ZodString;
    source: z.ZodObject<{
        kind: z.ZodEnum<["file", "stream", "http"]>;
        path: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "file" | "stream" | "http";
        path?: string | undefined;
        url?: string | undefined;
    }, {
        kind: "file" | "stream" | "http";
        path?: string | undefined;
        url?: string | undefined;
    }>;
    sink: z.ZodDefault<z.ZodObject<{
        kind: z.ZodEnum<["stdout", "file", "http"]>;
        path: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "stdout" | "file" | "http";
        path?: string | undefined;
        url?: string | undefined;
    }, {
        kind: "stdout" | "file" | "http";
        path?: string | undefined;
        url?: string | undefined;
    }>>;
    algorithm: z.ZodDefault<z.ZodObject<{
        name: z.ZodDefault<z.ZodEnum<["process_skeleton", "dfg", "alpha_plus_plus", "heuristic_miner", "inductive_miner", "declare", "hill_climbing", "simulated_annealing", "a_star", "aco", "optimized_dfg", "pso", "genetic_algorithm", "ilp", "transition_system", "log_to_trie", "causal_graph", "performance_spectrum", "batches", "correlation_miner", "generalization", "petri_net_reduction", "etconformance_precision", "alignments", "complexity_metrics", "pnml_import", "bpmn_import", "powl_to_process_tree", "yawl_export", "playout", "monte_carlo_simulation", "ml_classify", "ml_cluster", "ml_forecast", "ml_anomaly", "ml_regress", "ml_pca"]>>;
        parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        name: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export";
        parameters: Record<string, unknown>;
    }, {
        name?: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export" | undefined;
        parameters?: Record<string, unknown> | undefined;
    }>>;
    execution: z.ZodDefault<z.ZodObject<{
        profile: z.ZodDefault<z.ZodEnum<["fast", "balanced", "quality", "stream"]>>;
        timeout: z.ZodOptional<z.ZodNumber>;
        maxMemory: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        profile: "stream" | "fast" | "balanced" | "quality";
        timeout?: number | undefined;
        maxMemory?: number | undefined;
    }, {
        profile?: "stream" | "fast" | "balanced" | "quality" | undefined;
        timeout?: number | undefined;
        maxMemory?: number | undefined;
    }>>;
    observability: z.ZodDefault<z.ZodObject<{
        otel: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            exporter: z.ZodDefault<z.ZodEnum<["otlp", "console", "none"]>>;
            endpoint: z.ZodOptional<z.ZodString>;
            required: z.ZodDefault<z.ZodBoolean>;
            headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            required: boolean;
            exporter: "none" | "console" | "otlp";
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
        }, {
            enabled?: boolean | undefined;
            required?: boolean | undefined;
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
            exporter?: "none" | "console" | "otlp" | undefined;
        }>>;
        logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
        metricsEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        logLevel: "error" | "debug" | "info" | "warn";
        metricsEnabled: boolean;
        otel?: {
            enabled: boolean;
            required: boolean;
            exporter: "none" | "console" | "otlp";
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
        } | undefined;
    }, {
        logLevel?: "error" | "debug" | "info" | "warn" | undefined;
        otel?: {
            enabled?: boolean | undefined;
            required?: boolean | undefined;
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
            exporter?: "none" | "console" | "otlp" | undefined;
        } | undefined;
        metricsEnabled?: boolean | undefined;
    }>>;
    watch: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        poll_interval: z.ZodDefault<z.ZodNumber>;
        checkpoint_dir: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        poll_interval: number;
        checkpoint_dir?: string | undefined;
    }, {
        enabled?: boolean | undefined;
        poll_interval?: number | undefined;
        checkpoint_dir?: string | undefined;
    }>>;
    output: z.ZodDefault<z.ZodObject<{
        format: z.ZodDefault<z.ZodEnum<["human", "json"]>>;
        destination: z.ZodDefault<z.ZodString>;
        pretty: z.ZodDefault<z.ZodBoolean>;
        colorize: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        format: "json" | "human";
        destination: string;
        pretty: boolean;
        colorize: boolean;
    }, {
        format?: "json" | "human" | undefined;
        destination?: string | undefined;
        pretty?: boolean | undefined;
        colorize?: boolean | undefined;
    }>>;
    prediction: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        activityKey: z.ZodDefault<z.ZodString>;
        ngramOrder: z.ZodDefault<z.ZodNumber>;
        driftWindowSize: z.ZodDefault<z.ZodNumber>;
        tasks: z.ZodDefault<z.ZodArray<z.ZodEnum<["drift", "features", "next_activity", "outcome", "remaining_time", "resource"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        activityKey: string;
        tasks: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[];
        ngramOrder: number;
        driftWindowSize: number;
    }, {
        enabled?: boolean | undefined;
        activityKey?: string | undefined;
        tasks?: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[] | undefined;
        ngramOrder?: number | undefined;
        driftWindowSize?: number | undefined;
    }>>;
    ml: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        tasks: z.ZodDefault<z.ZodArray<z.ZodEnum<["classify", "cluster", "forecast", "anomaly", "regress", "pca"]>, "many">>;
        method: z.ZodOptional<z.ZodString>;
        k: z.ZodOptional<z.ZodNumber>;
        targetKey: z.ZodDefault<z.ZodString>;
        forecastPeriods: z.ZodDefault<z.ZodNumber>;
        nComponents: z.ZodDefault<z.ZodNumber>;
        eps: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        eps: number;
        forecastPeriods: number;
        nComponents: number;
        targetKey: string;
        tasks: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[];
        k?: number | undefined;
        method?: string | undefined;
    }, {
        enabled?: boolean | undefined;
        k?: number | undefined;
        eps?: number | undefined;
        forecastPeriods?: number | undefined;
        nComponents?: number | undefined;
        method?: string | undefined;
        targetKey?: string | undefined;
        tasks?: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[] | undefined;
    }>>;
    rl: z.ZodOptional<z.ZodObject<{
        /** Enable GPU dispatch via the LinUCB WGSL kernel (requires gpu feature). */
        gpu_enabled: z.ZodDefault<z.ZodBoolean>;
        /**
         * LinUCB regularization coefficient λ.
         * A is initialised to λI; larger values produce more conservative exploration.
         * Default: 1.0
         */
        linucb_lambda: z.ZodDefault<z.ZodNumber>;
        /**
         * UCB exploration bonus α.
         * Q̂_a(x) = w_a·x + b_a + α√(x^T A^{-1} x).
         * Default: √2 ≈ 1.4142 (standard LinUCB recommendation from Li et al. 2010).
         */
        ucb1_exploration: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        gpu_enabled: boolean;
        linucb_lambda: number;
        ucb1_exploration: number;
    }, {
        gpu_enabled?: boolean | undefined;
        linucb_lambda?: number | undefined;
        ucb1_exploration?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    output: {
        format: "json" | "human";
        destination: string;
        pretty: boolean;
        colorize: boolean;
    };
    algorithm: {
        name: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export";
        parameters: Record<string, unknown>;
    };
    observability: {
        logLevel: "error" | "debug" | "info" | "warn";
        metricsEnabled: boolean;
        otel?: {
            enabled: boolean;
            required: boolean;
            exporter: "none" | "console" | "otlp";
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
        } | undefined;
    };
    source: {
        kind: "file" | "stream" | "http";
        path?: string | undefined;
        url?: string | undefined;
    };
    execution: {
        profile: "stream" | "fast" | "balanced" | "quality";
        timeout?: number | undefined;
        maxMemory?: number | undefined;
    };
    schemaVersion: number;
    sink: {
        kind: "stdout" | "file" | "http";
        path?: string | undefined;
        url?: string | undefined;
    };
    watch?: {
        enabled: boolean;
        poll_interval: number;
        checkpoint_dir?: string | undefined;
    } | undefined;
    prediction?: {
        enabled: boolean;
        activityKey: string;
        tasks: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[];
        ngramOrder: number;
        driftWindowSize: number;
    } | undefined;
    ml?: {
        enabled: boolean;
        eps: number;
        forecastPeriods: number;
        nComponents: number;
        targetKey: string;
        tasks: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[];
        k?: number | undefined;
        method?: string | undefined;
    } | undefined;
    rl?: {
        gpu_enabled: boolean;
        linucb_lambda: number;
        ucb1_exploration: number;
    } | undefined;
}, {
    version: string;
    source: {
        kind: "file" | "stream" | "http";
        path?: string | undefined;
        url?: string | undefined;
    };
    output?: {
        format?: "json" | "human" | undefined;
        destination?: string | undefined;
        pretty?: boolean | undefined;
        colorize?: boolean | undefined;
    } | undefined;
    watch?: {
        enabled?: boolean | undefined;
        poll_interval?: number | undefined;
        checkpoint_dir?: string | undefined;
    } | undefined;
    algorithm?: {
        name?: "dfg" | "heuristic_miner" | "ilp" | "pso" | "declare" | "aco" | "powl_to_process_tree" | "monte_carlo_simulation" | "playout" | "generalization" | "inductive_miner" | "alpha_plus_plus" | "hill_climbing" | "simulated_annealing" | "a_star" | "genetic_algorithm" | "ml_classify" | "ml_cluster" | "ml_forecast" | "ml_anomaly" | "ml_regress" | "ml_pca" | "process_skeleton" | "optimized_dfg" | "transition_system" | "log_to_trie" | "causal_graph" | "performance_spectrum" | "batches" | "correlation_miner" | "petri_net_reduction" | "etconformance_precision" | "alignments" | "complexity_metrics" | "pnml_import" | "bpmn_import" | "yawl_export" | undefined;
        parameters?: Record<string, unknown> | undefined;
    } | undefined;
    prediction?: {
        enabled?: boolean | undefined;
        activityKey?: string | undefined;
        tasks?: ("features" | "outcome" | "remaining_time" | "drift" | "resource" | "next_activity")[] | undefined;
        ngramOrder?: number | undefined;
        driftWindowSize?: number | undefined;
    } | undefined;
    ml?: {
        enabled?: boolean | undefined;
        k?: number | undefined;
        eps?: number | undefined;
        forecastPeriods?: number | undefined;
        nComponents?: number | undefined;
        method?: string | undefined;
        targetKey?: string | undefined;
        tasks?: ("classify" | "cluster" | "forecast" | "anomaly" | "regress" | "pca")[] | undefined;
    } | undefined;
    observability?: {
        logLevel?: "error" | "debug" | "info" | "warn" | undefined;
        otel?: {
            enabled?: boolean | undefined;
            required?: boolean | undefined;
            endpoint?: string | undefined;
            headers?: Record<string, string> | undefined;
            exporter?: "none" | "console" | "otlp" | undefined;
        } | undefined;
        metricsEnabled?: boolean | undefined;
    } | undefined;
    execution?: {
        profile?: "stream" | "fast" | "balanced" | "quality" | undefined;
        timeout?: number | undefined;
        maxMemory?: number | undefined;
    } | undefined;
    schemaVersion?: number | undefined;
    sink?: {
        kind: "stdout" | "file" | "http";
        path?: string | undefined;
        url?: string | undefined;
    } | undefined;
    rl?: {
        gpu_enabled?: boolean | undefined;
        linucb_lambda?: number | undefined;
        ucb1_exploration?: number | undefined;
    } | undefined;
}>;
/**
 * Validate a config object against the full schema. Returns the validated config
 * with defaults applied, or throws a descriptive error.
 */
export declare function validate(config: unknown): z.infer<typeof configSchema>;
/**
 * Validate a partial config (useful for individual layers before merging).
 */
export declare function validatePartial(config: unknown): Partial<z.infer<typeof configSchema>>;
/**
 * Export the Zod schema as a JSON Schema object.
 */
export declare function toJsonSchema(): Record<string, unknown>;
//# sourceMappingURL=schema.d.ts.map