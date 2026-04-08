/**
 * Event Log Validators
 *
 * Validation utilities for XES, CSV, and in-memory event logs.
 * Ensures format compliance, schema validity, and data quality.
 */

// ─── Types ────────────────────────────────────────────────────────────────

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
  extensions?: Array<{ name: string; prefix: string; uri: string }>;
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

// ─── XES Validation ───────────────────────────────────────────────────────

/**
 * Validate XES format compliance.
 */
export function validateXES(xesContent: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Parse XML
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xesContent, 'application/xml');

    // Check for parser errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return {
        valid: false,
        errors: [{ path: '/', message: 'Invalid XML: ' + parseError.textContent, severity: 'error' }],
        warnings: [],
      };
    }
  } catch (e) {
    return {
      valid: false,
      errors: [{ path: '/', message: `XML parsing failed: ${e}`, severity: 'error' }],
      warnings: [],
    };
  }

  // Validate root element
  const logElement = doc.documentElement;
  // tagName includes namespace prefix in some browsers
  const localName = logElement.localName || logElement.tagName;
  if (localName !== 'log') {
    errors.push({ path: '/', message: 'Root element must be <log>', severity: 'error' });
  }

  // Check XES version
  const version = logElement.getAttribute('xes.version');
  if (!version) {
    warnings.push({ path: '/log', message: 'Missing xes.version attribute', severity: 'warning' });
  } else if (!/^1\.0/.test(version)) {
    warnings.push({ path: '/log', message: `Unexpected XES version: ${version}`, severity: 'warning' });
  }

  // Validate traces
  const traces = doc.querySelectorAll('trace');
  if (traces.length === 0) {
    errors.push({ path: '/log', message: 'Log must contain at least one trace', severity: 'error' });
  }

  traces.forEach((trace, traceIndex) => {
    const tracePath = `/log/trace[${traceIndex + 1}]`;

    // Check trace name
    const traceName = trace.querySelector('string[key="concept:name"], string[key*="concept:name"]');
    if (!traceName) {
      warnings.push({ path: tracePath, message: 'Trace missing concept:name', severity: 'warning' });
    }

    // Check events
    const events = trace.querySelectorAll('event');
    if (events.length === 0) {
      errors.push({ path: tracePath, message: 'Trace must contain at least one event', severity: 'error' });
    }

    events.forEach((event, eventIndex) => {
      const eventPath = `${tracePath}/event[${eventIndex + 1}]`;

      // Check event name (required)
      const eventName = event.querySelector('string[key="concept:name"], string[key*="concept:name"]');
      if (!eventName) {
        errors.push({ path: eventPath, message: 'Event missing concept:name', severity: 'error' });
      }

      // Check timestamp (recommended)
      const timestamp = event.querySelector('date[key="time:timestamp"], date[key*="time:timestamp"]');
      if (!timestamp) {
        warnings.push({ path: eventPath, message: 'Event missing time:timestamp', severity: 'warning' });
      } else {
        // Validate timestamp format
        const tsValue = timestamp.getAttribute('value');
        if (tsValue && !isValidISO8601(tsValue)) {
          errors.push({ path: eventPath, message: `Invalid timestamp format: ${tsValue}`, severity: 'error' });
        }
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate XES file structure.
 */
export function validateXESStructure(xes: XESSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!xes.traces || xes.traces.length === 0) {
    errors.push({ path: 'traces', message: 'Log must contain at least one trace', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  xes.traces.forEach((trace, traceIndex) => {
    const tracePath = `traces[${traceIndex}]`;

    if (!trace.events || trace.events.length === 0) {
      errors.push({ path: tracePath, message: 'Trace must contain at least one event', severity: 'error' });
      return;
    }

    trace.events.forEach((event, eventIndex) => {
      const eventPath = `${tracePath}.events[${eventIndex}]`;

      if (!event.attributes?.['concept:name']) {
        errors.push({ path: eventPath, message: 'Event missing concept:name', severity: 'error' });
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── CSV Validation ────────────────────────────────────────────────────────

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
export function validateCSV(csvContent: string, options: { delimiter?: string; hasHeader?: boolean } = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const { delimiter = ',', hasHeader = true } = options;

  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) {
    return {
      valid: false,
      errors: [{ path: '/', message: 'CSV file is empty', severity: 'error' }],
      warnings: [],
    };
  }

  // Parse header
  const header = parseCSVLine(lines[0], delimiter);
  const requiredColumns = ['case_id', 'activity'];
  const recommendedColumns = ['timestamp'];

  const headerLine = hasHeader ? 1 : 0;
  const headerPath = hasHeader ? 'header' : `line[1]`;

  // Check required columns
  if (hasHeader) {
    requiredColumns.forEach(col => {
      if (!header.includes(col)) {
        errors.push({ path: headerPath, message: `Missing required column: ${col}`, severity: 'error' });
      }
    });

    // Check recommended columns
    recommendedColumns.forEach(col => {
      if (!header.includes(col)) {
        warnings.push({ path: headerPath, message: `Missing recommended column: ${col}`, severity: 'warning' });
      }
    });
  }

  // Get column indices
  const caseIdIdx = header.indexOf('case_id');
  const activityIdx = header.indexOf('activity');
  const timestampIdx = header.indexOf('timestamp');

  // Validate data rows
  for (let i = headerLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line, delimiter);
    const rowPath = `row[${i + 1}]`;

    // Check row length
    if (values.length !== header.length) {
      warnings.push({ path: rowPath, message: `Row has ${values.length} columns, expected ${header.length}`, severity: 'warning' });
    }

    // Check required fields
    if (caseIdIdx >= 0 && !values[caseIdIdx]) {
      errors.push({ path: rowPath, message: 'Missing case_id value', severity: 'error' });
    }

    if (activityIdx >= 0 && !values[activityIdx]) {
      errors.push({ path: rowPath, message: 'Missing activity value', severity: 'error' });
    }

    // Validate timestamp if present
    if (timestampIdx >= 0 && values[timestampIdx]) {
      if (!isValidISO8601(values[timestampIdx])) {
        errors.push({ path: rowPath, message: `Invalid timestamp format: ${values[timestampIdx]}`, severity: 'error' });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse a CSV line handling quoted values.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// ─── Event Log Schema Validation ───────────────────────────────────────────

/**
 * Validate in-memory event log structure.
 */
export function validateEventLog(log: EventLogSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!log.traces || log.traces.length === 0) {
    errors.push({ path: 'traces', message: 'Event log must contain at least one trace', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  log.traces.forEach((trace, traceIndex) => {
    const tracePath = `traces[${traceIndex}]`;

    // Check trace name
    if (!trace['concept:name']) {
      warnings.push({ path: tracePath, message: 'Trace missing concept:name', severity: 'warning' });
    }

    // Check events
    if (!trace.events || trace.events.length === 0) {
      errors.push({ path: tracePath, message: 'Trace must contain at least one event', severity: 'error' });
      return;
    }

    trace.events.forEach((event, eventIndex) => {
      const eventPath = `${tracePath}.events[${eventIndex}]`;

      // Check required fields
      if (!event['concept:name']) {
        errors.push({ path: eventPath, message: 'Event missing concept:name', severity: 'error' });
      }

      // Check timestamp format
      if (event['time:timestamp'] && !isValidISO8601(event['time:timestamp'])) {
        errors.push({ path: eventPath, message: `Invalid timestamp: ${event['time:timestamp']}`, severity: 'error' });
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Data Quality Validators ───────────────────────────────────────────────

/**
 * Validate timestamp ordering within traces.
 */
export function validateTimestampOrdering(log: EventLogSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  log.traces?.forEach((trace, traceIndex) => {
    const tracePath = `traces[${traceIndex}]`;

    if (!trace.events || trace.events.length < 2) {
      return; // Skip single-event traces
    }

    for (let i = 1; i < trace.events.length; i++) {
      const prevEvent = trace.events[i - 1];
      const currEvent = trace.events[i];

      const prevTs = prevEvent['time:timestamp'];
      const currTs = currEvent['time:timestamp'];

      if (prevTs && currTs) {
        const prevDate = new Date(prevTs);
        const currDate = new Date(currTs);

        if (currDate < prevDate) {
          errors.push({
            path: `${tracePath}.events[${i}]`,
            message: `Timestamp out of order: ${currTs} < ${prevTs}`,
            severity: 'error',
          });
        } else if (currDate.getTime() === prevDate.getTime()) {
          warnings.push({
            path: `${tracePath}.events[${i}]`,
            message: `Duplicate timestamp: ${currTs}`,
            severity: 'warning',
          });
        }
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate trace completeness (no missing events).
 */
export function validateTraceCompleteness(log: EventLogSchema, expectedActivities?: string[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!expectedActivities || expectedActivities.length === 0) {
    // Just check that all traces have at least one event
    log.traces?.forEach((trace, traceIndex) => {
      if (!trace.events || trace.events.length === 0) {
        errors.push({
          path: `traces[${traceIndex}]`,
          message: 'Trace has no events',
          severity: 'error',
        });
      }
    });
  } else {
    // Check that all expected activities appear in each trace
    const expectedSet = new Set(expectedActivities);

    log.traces?.forEach((trace, traceIndex) => {
      const tracePath = `traces[${traceIndex}]`;
      const foundActivities = new Set(trace.events?.map(e => e['concept:name']) || []);

      expectedActivities.forEach(activity => {
        if (!foundActivities.has(activity)) {
          warnings.push({
            path: tracePath,
            message: `Missing expected activity: ${activity}`,
            severity: 'warning',
          });
        }
      });
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check for duplicate events in traces.
 */
export function validateNoDuplicates(log: EventLogSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  log.traces?.forEach((trace, traceIndex) => {
    const tracePath = `traces[${traceIndex}]`;

    if (!trace.events || trace.events.length < 2) {
      return;
    }

    for (let i = 0; i < trace.events.length; i++) {
      for (let j = i + 1; j < trace.events.length; j++) {
        const event1 = trace.events[i];
        const event2 = trace.events[j];

        // Check if events are identical (all attributes match)
        if (eventsAreEqual(event1, event2)) {
          warnings.push({
            path: `${tracePath}.events[${i},${j}]`,
            message: `Duplicate events detected at positions ${i} and ${j}`,
            severity: 'warning',
          });
        }
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Check if a string is a valid ISO 8601 timestamp.
 */
function isValidISO8601(str: string): boolean {
  if (!str) return false;

  // Try parsing as date
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    return false;
  }

  // Check if string matches ISO 8601 pattern
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
  return iso8601Pattern.test(str);
}

/**
 * Compare two events for equality (all attributes).
 */
function eventsAreEqual(event1: Record<string, unknown>, event2: Record<string, unknown>): boolean {
  const keys1 = Object.keys(event1).sort();
  const keys2 = Object.keys(event2).sort();

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let i = 0; i < keys1.length; i++) {
    if (keys1[i] !== keys2[i]) {
      return false;
    }

    const key = keys1[i];
    if (event1[key] !== event2[key]) {
      return false;
    }
  }

  return true;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format validation result as human-readable string.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push(`Validation ${result.valid ? 'PASSED' : 'FAILED'}`);
  lines.push(`Errors: ${result.errors.length}`);
  lines.push(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    result.errors.forEach(e => {
      lines.push(`  [${e.severity.toUpperCase()}] ${e.path}: ${e.message}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    result.warnings.forEach(w => {
      lines.push(`  [${w.severity.toUpperCase()}] ${w.path}: ${w.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Check if validation result is valid (convenience alias).
 */
export function isValid(result: ValidationResult): boolean {
  return result.valid;
}
