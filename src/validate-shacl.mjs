/**
 * SHACL Validation Gatekeeper for pictl
 *
 * Validates all pictl tool outputs against SHACL constraints from pictl-shapes.ttl.
 * Enforces hard violations (errors) and warns on soft violations (warnings).
 *
 * Agency: Agent 3 — SHACL Validation Gatekeeper
 * Mandate: Wire pictl-shapes.ttl constraints into result validation pipeline.
 *
 * Usage:
 *   const validator = await SHACLValidator.create();
 *   const report = await validator.validateResult('discover_dfg', dfgResult);
 *   if (!report.valid) {
 *     throw new Error(`Validation failed: ${report.errors.join(', ')}`);
 *   }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.mjs';

const logger = createLogger('validate-shacl');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Utility function for field name conversion
function camelToSnake(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * Validation Result Structure
 */
export class ValidationResult {
  constructor() {
    this.valid = true;
    this.errors = [];
    this.warnings = [];
    this.violations = [];
  }

  addError(message, context = {}) {
    this.valid = false;
    this.errors.push({ message, context, severity: 'error' });
    logger.error(`Validation Error: ${message}`, context);
  }

  addWarning(message, context = {}) {
    this.warnings.push({ message, context, severity: 'warning' });
    logger.warn(`Validation Warning: ${message}`, context);
  }

  addViolation(field, expected, actual, severity = 'error') {
    const violation = { field, expected, actual, severity };
    this.violations.push(violation);
    if (severity === 'error') {
      this.addError(`${field}: expected ${expected}, got ${actual}`, violation);
    } else {
      this.addWarning(`${field}: expected ${expected}, got ${actual}`, violation);
    }
  }
}

/**
 * SHACL Shape Constraint
 * Maps tool results to shape validation rules
 */
class SHACLShape {
  constructor(name, targetClass, properties = []) {
    this.name = name;
    this.targetClass = targetClass;
    this.properties = properties; // Array of constraints
  }

  /**
   * Check if result matches this shape's target class
   */
  matches(result) {
    // For JSON results, infer type from structure
    if (this.targetClass.includes('DFG')) {
      return result && result.model && (result.nodes || result.edges !== undefined);
    }
    if (this.targetClass.includes('ProcessModel')) {
      return result && (result.percentage !== undefined || result.fitness !== undefined);
    }
    if (this.targetClass.includes('EventLog')) {
      return result && result.eventCount !== undefined;
    }
    if (this.targetClass.includes('Prediction')) {
      return result && result.predictionConfidence !== undefined;
    }
    if (this.targetClass.includes('ObjectCentric')) {
      return result && result.businessObjects !== undefined;
    }
    return false;
  }

  /**
   * Validate result against shape constraints
   */
  validate(result) {
    const violations = [];
    for (const constraint of this.properties) {
      const violation = constraint.validate(result);
      if (violation) violations.push(violation);
    }
    return violations;
  }
}

/**
 * Property Constraint
 * Individual SHACL property constraint
 */
class PropertyConstraint {
  constructor(path, rule = {}) {
    this.path = path; // e.g., 'hasFitness'
    this.datatype = rule.datatype; // e.g., 'double'
    this.minInclusive = rule.minInclusive;
    this.maxInclusive = rule.maxInclusive;
    this.minCount = rule.minCount;
    this.hasValue = rule.hasValue;
    this.severity = rule.severity || 'error'; // 'error' or 'warning'
    this.message = rule.message;
  }

  /**
   * Validate value against constraint
   */
  validate(result) {
    const fieldName = this.path.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    let value;

    // Try multiple field naming conventions
    if (fieldName in result) {
      value = result[fieldName];
    } else if (this.path in result) {
      value = result[this.path];
    } else if (camelToSnake(this.path) in result) {
      value = result[camelToSnake(this.path)];
    } else {
      // Field not present — only error if required
      if (this.minCount) {
        return {
          field: this.path,
          severity: this.severity,
          message: `Missing required field: ${this.path}`,
          expected: 'present',
          actual: 'missing',
        };
      }
      return null;
    }

    // Skip null/undefined values unless required
    if (value === null || value === undefined) {
      if (this.minCount) {
        return {
          field: this.path,
          severity: this.severity,
          message: `Required field is null: ${this.path}`,
          expected: 'non-null',
          actual: 'null',
        };
      }
      return null;
    }

    // Datatype validation
    if (this.datatype === 'xsd:double' || this.datatype === 'xsd:float') {
      if (typeof value !== 'number') {
        return {
          field: this.path,
          severity: this.severity,
          message: `${this.path}: expected number, got ${typeof value}`,
          expected: 'number',
          actual: typeof value,
        };
      }

      // Range validation
      if (this.minInclusive !== undefined && value < this.minInclusive) {
        return {
          field: this.path,
          severity: this.severity,
          message: `${this.path}: ${value} < ${this.minInclusive} (minimum)`,
          expected: `>= ${this.minInclusive}`,
          actual: value,
        };
      }

      if (this.maxInclusive !== undefined && value > this.maxInclusive) {
        return {
          field: this.path,
          severity: this.severity,
          message: `${this.path}: ${value} > ${this.maxInclusive} (maximum)`,
          expected: `<= ${this.maxInclusive}`,
          actual: value,
        };
      }
    }

    if (this.datatype === 'xsd:integer') {
      if (!Number.isInteger(value)) {
        return {
          field: this.path,
          severity: this.severity,
          message: `${this.path}: expected integer, got ${typeof value}`,
          expected: 'integer',
          actual: typeof value,
        };
      }

      if (this.minInclusive !== undefined && value < this.minInclusive) {
        return {
          field: this.path,
          severity: this.severity,
          message: `${this.path}: ${value} < ${this.minInclusive}`,
          expected: `>= ${this.minInclusive}`,
          actual: value,
        };
      }
    }

    // Value assertion
    if (this.hasValue !== undefined && value !== this.hasValue) {
      return {
        field: this.path,
        severity: this.severity,
        message: `${this.path}: expected ${this.hasValue}, got ${value}`,
        expected: this.hasValue,
        actual: value,
      };
    }

    return null; // Valid
  }

}

/**
 * SHACL Validator
 * Main validation orchestrator
 */
export class SHACLValidator {
  constructor(shapes = []) {
    this.shapes = shapes;
    this.toolValidators = this.buildToolValidators();
    this.statsCollector = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      commonViolations: {},
    };
  }

  /**
   * Initialize validator from pictl-shapes.ttl
   */
  static async create(shapesPath = null) {
    // Default path relative to this file
    if (!shapesPath) {
      shapesPath = path.join(__dirname, '..', 'semconv', 'pictl-shapes.ttl');
    }

    const validator = new SHACLValidator();
    try {
      await validator.loadShapes(shapesPath);
      logger.info(`Loaded SHACL shapes from ${shapesPath}`);
    } catch (error) {
      logger.warn(`Could not load shapes file (${shapesPath}): ${error.message}`);
      // Initialize with built-in shapes
      validator.initializeBuiltInShapes();
    }
    return validator;
  }

  /**
   * Load shapes from Turtle file
   * Parses SHACL constraints and converts to PropertyConstraint objects
   */
  async loadShapes(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    this.parseShapesTTL(content);
  }

  /**
   * Parse SHACL shapes from Turtle content
   */
  parseShapesTTL(content) {
    // Simple Turtle parser for SHACL shapes
    // Extracts shape definitions with constraints
    const lines = content.split('\n');
    let currentShape = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Detect shape definition: pm:XxxShape a sh:NodeShape
      const shapeMatch = trimmed.match(
        /^pm:(\w+Shape)\s+a\s+sh:NodeShape\s*;?$/
      );
      if (shapeMatch) {
        if (currentShape) this.shapes.push(currentShape);
        currentShape = new SHACLShape(shapeMatch[1], shapeMatch[1]);
        continue;
      }

      // Detect property constraint
      if (currentShape && trimmed.startsWith('sh:property')) {
        // Extract property details from multi-line block
        const propBlock = this.extractPropertyBlock(content, content.indexOf(trimmed));
        const constraint = this.parsePropertyConstraint(propBlock);
        if (constraint) {
          currentShape.properties.push(constraint);
        }
      }
    }

    if (currentShape) this.shapes.push(currentShape);
  }

  /**
   * Extract property constraint block from Turtle
   */
  extractPropertyBlock(content, startIndex) {
    // Find matching [ ... ]
    let bracket = 0;
    let block = '';
    let inProperty = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (char === '[' && !inProperty) {
        inProperty = true;
        bracket = 1;
        continue;
      }

      if (inProperty) {
        block += char;
        if (char === '[') bracket++;
        if (char === ']') bracket--;
        if (bracket === 0) break;
      }
    }

    return block;
  }

  /**
   * Parse individual property constraint
   */
  parsePropertyConstraint(block) {
    const constraint = {};

    // Extract path
    const pathMatch = block.match(/sh:path\s+pm:(\w+)/);
    if (!pathMatch) return null;
    constraint.path = pathMatch[1];

    // Extract datatype
    const dtMatch = block.match(/sh:datatype\s+xsd:(\w+)/);
    if (dtMatch) constraint.datatype = `xsd:${dtMatch[1]}`;

    // Extract min/max inclusive
    const minMatch = block.match(/sh:minInclusive\s+([\d.]+)/);
    if (minMatch) constraint.minInclusive = parseFloat(minMatch[1]);

    const maxMatch = block.match(/sh:maxInclusive\s+([\d.]+)/);
    if (maxMatch) constraint.maxInclusive = parseFloat(maxMatch[1]);

    // Extract minCount
    const minCountMatch = block.match(/sh:minCount\s+(\d+)/);
    if (minCountMatch) constraint.minCount = parseInt(minCountMatch[1], 10);

    // Extract severity
    constraint.severity = block.includes('sh:severity sh:Warning') ? 'warning' : 'error';

    // Extract message
    const msgMatch = block.match(/sh:message\s+"([^"]+)"/);
    if (msgMatch) constraint.message = msgMatch[1];

    return new PropertyConstraint(constraint.path, constraint);
  }

  /**
   * Initialize built-in SHACL shapes (fallback)
   */
  initializeBuiltInShapes() {
    // DFG Discovery Shape
    const dfgShape = new SHACLShape('DFGDiscoveryShape', 'DirectlyFollowsGraph', [
      new PropertyConstraint('hasFitness', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'error',
      }),
      new PropertyConstraint('executionTime', {
        datatype: 'xsd:duration',
        severity: 'warning',
      }),
    ]);

    // Conformance Shape
    const conformanceShape = new SHACLShape('ConformanceShape', 'ProcessModel', [
      new PropertyConstraint('hasFitness', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
      new PropertyConstraint('hasPrecision', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
      new PropertyConstraint('hasGeneralization', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
      new PropertyConstraint('hasSimplicity', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
    ]);

    // Quality Metrics Shape
    const qualityShape = new SHACLShape('QualityMetricsShape', 'ProcessModel', [
      new PropertyConstraint('hasFitness', {
        minInclusive: 0.7,
        severity: 'warning',
        message: 'Fitness below 0.7 may indicate quality issues',
      }),
      new PropertyConstraint('hasPrecision', {
        minInclusive: 0.7,
        severity: 'warning',
        message: 'Precision below 0.7 may indicate overgeneralization',
      }),
    ]);

    // Prediction Shape
    const predictionShape = new SHACLShape('PredictionShape', 'PredictiveModel', [
      new PropertyConstraint('predictionConfidence', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
      new PropertyConstraint('anomalyScore', {
        datatype: 'xsd:double',
        minInclusive: 0,
        maxInclusive: 1,
        severity: 'warning',
      }),
    ]);

    this.shapes.push(dfgShape, conformanceShape, qualityShape, predictionShape);
  }

  /**
   * Build per-tool validators
   */
  buildToolValidators() {
    return {
      discover_dfg: (result) => this.validateDiscoveryResult(result, 'DFG'),
      discover_alpha_plus_plus: (result) => this.validateDiscoveryResult(result, 'PetriNet'),
      discover_ilp_optimization: (result) => this.validateDiscoveryResult(result, 'PetriNet'),
      discover_genetic_algorithm: (result) => this.validateDiscoveryResult(result, 'PetriNet'),
      discover_heuristic_miner: (result) => this.validateDiscoveryResult(result, 'PetriNet'),
      discover_variants: (result) => this.validateVariantResult(result),
      check_conformance: (result) => this.validateConformanceResult(result),
      analyze_statistics: (result) => this.validateStatisticsResult(result),
      detect_bottlenecks: (result) => this.validateBottleneckResult(result),
      detect_concept_drift: (result) => this.validateDriftResult(result),
      detect_anomalies: (result) => this.validateAnomalyResult(result),
      load_ocel: (result) => this.validateOCELResult(result),
      analyze_object_centric: (result) => this.validateObjectCentricResult(result),
    };
  }

  /**
   * Validate discovery result
   */
  validateDiscoveryResult(result, modelType) {
    const report = new ValidationResult();

    // Check basic structure
    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    // Validate status
    if (result.status !== 'success') {
      if (result.status === 'error') {
        report.addError(`Algorithm failed: ${result.message || 'Unknown error'}`);
      } else {
        report.addWarning(`Algorithm status: ${result.status}`);
      }
    }

    // Validate model structure
    if (!result.model) {
      report.addError('Missing model in result');
      return report;
    }

    // Check model fields
    if (!Array.isArray(result.model.nodes) && result.model.nodes !== undefined) {
      report.addError('model.nodes must be an array', { actual: typeof result.model.nodes });
    }

    if (!Array.isArray(result.model.edges) && result.model.edges !== undefined) {
      report.addError('model.edges must be an array', { actual: typeof result.model.edges });
    }

    // Validate metrics if present
    if (result.fitness !== undefined) {
      if (typeof result.fitness !== 'number') {
        report.addError('fitness must be a number', { actual: typeof result.fitness });
      } else if (result.fitness < 0 || result.fitness > 1) {
        report.addError('fitness out of range [0, 1]', { actual: result.fitness });
      }
    }

    // Execution time validation
    if (result.elapsedMs !== undefined) {
      if (typeof result.elapsedMs !== 'number') {
        report.addError('elapsedMs must be a number', { actual: typeof result.elapsedMs });
      } else if (result.elapsedMs < 0) {
        report.addWarning('elapsedMs is negative', { actual: result.elapsedMs });
      }
    }

    return report;
  }

  /**
   * Validate variant discovery result
   */
  validateVariantResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!Array.isArray(result.variants)) {
      report.addError('variants must be an array');
      return report;
    }

    // Validate each variant
    for (const variant of result.variants) {
      if (!variant.trace || !Array.isArray(variant.trace)) {
        report.addError('Each variant must have a trace array');
      }
      if (typeof variant.frequency !== 'number' || variant.frequency < 0) {
        report.addError(`Invalid frequency in variant: ${variant.frequency}`);
      }
    }

    return report;
  }

  /**
   * Validate conformance checking result
   */
  validateConformanceResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    // Validate main metrics
    if (result.percentage !== undefined) {
      if (typeof result.percentage !== 'number') {
        report.addError('percentage must be a number', { actual: typeof result.percentage });
      } else if (result.percentage < 0 || result.percentage > 1) {
        report.addViolation('percentage', '[0, 1]', result.percentage, 'error');
      }
    }

    if (result.avg_trace_fitness !== undefined) {
      if (typeof result.avg_trace_fitness !== 'number') {
        report.addError('avg_trace_fitness must be a number');
      } else if (result.avg_trace_fitness < 0 || result.avg_trace_fitness > 1) {
        report.addViolation('avg_trace_fitness', '[0, 1]', result.avg_trace_fitness, 'error');
      }
    }

    // Validate trace results
    if (Array.isArray(result.trace_results)) {
      for (const trace of result.trace_results) {
        if (trace.fitness !== undefined && (trace.fitness < 0 || trace.fitness > 1)) {
          report.addWarning(`Trace ${trace.case_id}: fitness out of range`, {
            fitness: trace.fitness,
          });
        }
      }
    }

    return report;
  }

  /**
   * Validate statistics result
   */
  validateStatisticsResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    // Check required fields
    if (typeof result.traceCount !== 'number' || result.traceCount < 1) {
      report.addError('traceCount must be >= 1', { actual: result.traceCount });
    }

    if (typeof result.eventCount !== 'number' || result.eventCount < 1) {
      report.addError('eventCount must be >= 1', { actual: result.eventCount });
    }

    // Activities validation
    if (Array.isArray(result.activities)) {
      if (result.activities.length === 0) {
        report.addWarning('No activities found in log');
      }
    }

    return report;
  }

  /**
   * Validate bottleneck detection result
   */
  validateBottleneckResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!Array.isArray(result.bottlenecks)) {
      report.addError('bottlenecks must be an array');
      return report;
    }

    for (const bottleneck of result.bottlenecks) {
      if (typeof bottleneck.avgWaitTime !== 'number' || bottleneck.avgWaitTime < 0) {
        report.addWarning('Invalid avgWaitTime in bottleneck', {
          value: bottleneck.avgWaitTime,
        });
      }
    }

    return report;
  }

  /**
   * Validate concept drift result
   */
  validateDriftResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!Array.isArray(result.drift_points)) {
      report.addError('drift_points must be an array');
      return report;
    }

    return report;
  }

  /**
   * Validate anomaly detection result
   */
  validateAnomalyResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!Array.isArray(result.anomalies)) {
      report.addError('anomalies must be an array');
      return report;
    }

    for (const anomaly of result.anomalies) {
      if (typeof anomaly.score !== 'number') {
        report.addError('Anomaly score must be a number', { actual: typeof anomaly.score });
      } else if (anomaly.score < 0 || anomaly.score > 1) {
        report.addWarning('Anomaly score out of normalized range [0, 1]', {
          score: anomaly.score,
        });
      }
    }

    return report;
  }

  /**
   * Validate OCEL result
   */
  validateOCELResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!result.ocel_handle) {
      report.addWarning('OCEL handle not present in result');
    }

    return report;
  }

  /**
   * Validate object-centric analysis result
   */
  validateObjectCentricResult(result) {
    const report = new ValidationResult();

    if (!result) {
      report.addError('Result is null or undefined');
      return report;
    }

    if (!Array.isArray(result.businessObjects)) {
      report.addError('businessObjects must be an array');
      return report;
    }

    if (result.businessObjects.length === 0) {
      report.addError('OCEL must contain at least one business object');
    }

    return report;
  }

  /**
   * Validate tool result
   * Main entry point for validation
   */
  async validateResult(toolName, result) {
    this.statsCollector.totalValidations++;

    const report = new ValidationResult();

    // Check for null/undefined result
    if (result === null || result === undefined) {
      report.addError(`Tool '${toolName}' returned null/undefined result`);
      this.statsCollector.failedValidations++;
      this.recordViolation('null_result', toolName);
      return report;
    }

    // Call tool-specific validator if available
    const validator = this.toolValidators[toolName];
    if (validator) {
      const toolReport = validator(result);
      report.errors.push(...toolReport.errors);
      report.warnings.push(...toolReport.warnings);
      report.violations.push(...toolReport.violations);
      report.valid = toolReport.valid && report.valid;
    }

    // Apply generic SHACL shapes
    for (const shape of this.shapes) {
      if (shape.matches(result)) {
        const violations = shape.validate(result);
        for (const violation of violations) {
          if (violation.severity === 'error') {
            report.addError(violation.message || violation.field, violation);
          } else {
            report.addWarning(violation.message || violation.field, violation);
          }
          this.recordViolation(violation.field, toolName);
        }
      }
    }

    // Update statistics
    if (report.valid) {
      this.statsCollector.passedValidations++;
    } else {
      this.statsCollector.failedValidations++;
    }

    // Log summary
    if (!report.valid) {
      logger.info(`[${toolName}] Validation FAILED: ${report.errors.length} errors, ${report.warnings.length} warnings`);
    } else {
      logger.info(`[${toolName}] Validation PASSED`);
    }

    return report;
  }

  /**
   * Record violation statistics
   */
  recordViolation(field, toolName) {
    const key = `${toolName}:${field}`;
    this.statsCollector.commonViolations[key] =
      (this.statsCollector.commonViolations[key] || 0) + 1;
  }

  /**
   * Get validation statistics
   */
  getStats() {
    const total = this.statsCollector.totalValidations;
    const passed = this.statsCollector.passedValidations;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;

    return {
      totalValidations: total,
      passedValidations: passed,
      failedValidations: this.statsCollector.failedValidations,
      passRate: `${passRate}%`,
      commonViolations: Object.entries(this.statsCollector.commonViolations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .reduce((acc, [key, count]) => {
          acc[key] = count;
          return acc;
        }, {}),
    };
  }

  /**
   * Export validation metrics
   */
  exportMetrics() {
    const stats = this.getStats();
    return {
      timestamp: new Date().toISOString(),
      validationMetrics: {
        totalChecked: stats.totalValidations,
        passRate: stats.passRate,
        failureRate: `${(100 - parseFloat(stats.passRate)).toFixed(2)}%`,
      },
      topViolations: stats.commonViolations,
      summary: `${stats.passedValidations}/${stats.totalValidations} results passed SHACL validation`,
    };
  }
}

