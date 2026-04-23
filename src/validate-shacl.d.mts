/**
 * Validation Result Structure
 */
export class ValidationResult {
    valid: boolean;
    errors: any[];
    warnings: any[];
    violations: any[];
    addError(message: any, context?: {}): void;
    addWarning(message: any, context?: {}): void;
    addViolation(field: any, expected: any, actual: any, severity?: string): void;
}
/**
 * SHACL Validator
 * Main validation orchestrator
 */
export class SHACLValidator {
    /**
     * Initialize validator from pictl-shapes.ttl
     */
    static create(shapesPath?: null): Promise<SHACLValidator>;
    constructor(shapes?: any[]);
    shapes: any[];
    toolValidators: {
        discover_dfg: (result: any) => ValidationResult;
        discover_alpha_plus_plus: (result: any) => ValidationResult;
        discover_ilp_optimization: (result: any) => ValidationResult;
        discover_genetic_algorithm: (result: any) => ValidationResult;
        discover_heuristic_miner: (result: any) => ValidationResult;
        discover_variants: (result: any) => ValidationResult;
        check_conformance: (result: any) => ValidationResult;
        analyze_statistics: (result: any) => ValidationResult;
        detect_bottlenecks: (result: any) => ValidationResult;
        detect_concept_drift: (result: any) => ValidationResult;
        detect_anomalies: (result: any) => ValidationResult;
        load_ocel: (result: any) => ValidationResult;
        analyze_object_centric: (result: any) => ValidationResult;
    };
    statsCollector: {
        totalValidations: number;
        passedValidations: number;
        failedValidations: number;
        commonViolations: {};
    };
    /**
     * Load shapes from Turtle file
     * Parses SHACL constraints and converts to PropertyConstraint objects
     */
    loadShapes(filePath: any): Promise<void>;
    /**
     * Parse SHACL shapes from Turtle content
     */
    parseShapesTTL(content: any): void;
    /**
     * Extract property constraint block from Turtle
     */
    extractPropertyBlock(content: any, startIndex: any): string;
    /**
     * Parse individual property constraint
     */
    parsePropertyConstraint(block: any): PropertyConstraint | null;
    /**
     * Initialize built-in SHACL shapes (fallback)
     */
    initializeBuiltInShapes(): void;
    /**
     * Build per-tool validators
     */
    buildToolValidators(): {
        discover_dfg: (result: any) => ValidationResult;
        discover_alpha_plus_plus: (result: any) => ValidationResult;
        discover_ilp_optimization: (result: any) => ValidationResult;
        discover_genetic_algorithm: (result: any) => ValidationResult;
        discover_heuristic_miner: (result: any) => ValidationResult;
        discover_variants: (result: any) => ValidationResult;
        check_conformance: (result: any) => ValidationResult;
        analyze_statistics: (result: any) => ValidationResult;
        detect_bottlenecks: (result: any) => ValidationResult;
        detect_concept_drift: (result: any) => ValidationResult;
        detect_anomalies: (result: any) => ValidationResult;
        load_ocel: (result: any) => ValidationResult;
        analyze_object_centric: (result: any) => ValidationResult;
    };
    /**
     * Validate discovery result
     */
    validateDiscoveryResult(result: any, modelType: any): ValidationResult;
    /**
     * Validate variant discovery result
     */
    validateVariantResult(result: any): ValidationResult;
    /**
     * Validate conformance checking result
     */
    validateConformanceResult(result: any): ValidationResult;
    /**
     * Validate statistics result
     */
    validateStatisticsResult(result: any): ValidationResult;
    /**
     * Validate bottleneck detection result
     */
    validateBottleneckResult(result: any): ValidationResult;
    /**
     * Validate concept drift result
     */
    validateDriftResult(result: any): ValidationResult;
    /**
     * Validate anomaly detection result
     */
    validateAnomalyResult(result: any): ValidationResult;
    /**
     * Validate OCEL result
     */
    validateOCELResult(result: any): ValidationResult;
    /**
     * Validate object-centric analysis result
     */
    validateObjectCentricResult(result: any): ValidationResult;
    /**
     * Validate tool result
     * Main entry point for validation
     */
    validateResult(toolName: any, result: any): Promise<ValidationResult>;
    /**
     * Record violation statistics
     */
    recordViolation(field: any, toolName: any): void;
    /**
     * Get validation statistics
     */
    getStats(): {
        totalValidations: number;
        passedValidations: number;
        failedValidations: number;
        passRate: string;
        commonViolations: {};
    };
    /**
     * Export validation metrics
     */
    exportMetrics(): {
        timestamp: string;
        validationMetrics: {
            totalChecked: number;
            passRate: string;
            failureRate: string;
        };
        topViolations: {};
        summary: string;
    };
}
/**
 * Property Constraint
 * Individual SHACL property constraint
 */
declare class PropertyConstraint {
    constructor(path: any, rule?: {});
    path: any;
    datatype: any;
    minInclusive: any;
    maxInclusive: any;
    minCount: any;
    hasValue: any;
    severity: any;
    message: any;
    /**
     * Validate value against constraint
     */
    validate(result: any): {
        field: any;
        severity: any;
        message: string;
        expected: any;
        actual: any;
    } | null;
}
export {};
//# sourceMappingURL=validate-shacl.d.mts.map