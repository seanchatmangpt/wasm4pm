/**
 * Event Log Validators
 *
 * Validation utilities for XES, CSV, and in-memory event logs.
 * Ensures format compliance, schema validity, and data quality.
 */
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
export interface XESSchema {
  version?: string;
  features?: string[];
  extensions?: Array<{
    name: string;
    prefix: string;
    uri: string;
  }>;
  traces?: XESTrace[];
}
export interface XESTrace {
  attributes?: Record<string, unknown>;
  events?: XESEvent[];
}
export interface XESEvent {
  attributes?: Record<string, unknown>;
}
export interface EventLogSchema {
  traces: Array<{
    'concept:name'?: string;
    events: Array<{
      'concept:name': string;
      'time:timestamp'?: string;
      'org:resource'?: string;
      'lifecycle:transition'?: string;
      [key: string]: unknown;
    }>;
  }>;
}
/**
 * Validate XES format compliance.
 */
export declare function validateXES(xesContent: string): ValidationResult;
/**
 * Validate XES file structure.
 */
export declare function validateXESStructure(xes: XESSchema): ValidationResult;
/**
 * Validate CSV format for event logs.
 *
 * Expected CSV format (columns):
 * - case_id (required)
 * - activity (required)
 * - timestamp (recommended, ISO 8601)
 * - resource (optional)
 * - lifecycle:transition (optional)
 */
export declare function validateCSV(
  csvContent: string,
  options?: {
    delimiter?: string;
    hasHeader?: boolean;
  }
): ValidationResult;
/**
 * Validate in-memory event log structure.
 */
export declare function validateEventLog(log: EventLogSchema): ValidationResult;
/**
 * Validate timestamp ordering within traces.
 */
export declare function validateTimestampOrdering(log: EventLogSchema): ValidationResult;
/**
 * Validate trace completeness (no missing events).
 */
export declare function validateTraceCompleteness(
  log: EventLogSchema,
  expectedActivities?: string[]
): ValidationResult;
/**
 * Check for duplicate events in traces.
 */
export declare function validateNoDuplicates(log: EventLogSchema): ValidationResult;
/**
 * Format validation result as human-readable string.
 */
export declare function formatValidationResult(result: ValidationResult): string;
/**
 * Check if validation result is valid (convenience alias).
 */
export declare function isValid(result: ValidationResult): boolean;
//# sourceMappingURL=event-logs.d.ts.map
