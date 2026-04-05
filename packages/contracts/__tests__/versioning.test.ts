/**
 * Versioning tests — all schemas must have schema_version fields
 */
import { describe, it, expect } from 'vitest';
import {
  TYPED_ERROR_JSON_SCHEMA,
  RECEIPT_JSON_SCHEMA,
  PLAN_JSON_SCHEMA,
  STATUS_JSON_SCHEMA,
  EXPLAIN_JSON_SCHEMA,
  ALL_JSON_SCHEMAS,
} from '../src/index';
import { createTypedError } from '../src/errors';
import type { Receipt } from '../src/receipt';
import type { Plan } from '../src/plan';
import type { Status } from '../src/status';
import type { ExplainSnapshot } from '../src/explain';

describe('schema versioning', () => {
  it('all JSON schemas have $id with version', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      expect(schema.$id).toBeDefined();
      expect(schema.$id).toMatch(/\/\d+\.\d+$/); // ends with /x.y version
    }
  });

  it('all JSON schemas have $schema reference', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });

  it('all JSON schemas have title and description', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      expect(typeof schema.title).toBe('string');
      expect(schema.title.length).toBeGreaterThan(0);
      expect(typeof schema.description).toBe('string');
      expect(schema.description.length).toBeGreaterThan(0);
    }
  });

  it('TypedError instance has schema_version 1.0', () => {
    const err = createTypedError('CONFIG_INVALID', 'test');
    expect(err.schema_version).toBe('1.0');
  });

  it('Receipt schema_version is 1.0', () => {
    expect(RECEIPT_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');
  });

  it('Plan schema_version is 1.0', () => {
    expect(PLAN_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');
  });

  it('Status schema_version is 1.0', () => {
    expect(STATUS_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');
  });

  it('ExplainSnapshot schema_version is 1.0', () => {
    expect(EXPLAIN_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');
  });

  it('ALL_JSON_SCHEMAS contains all 5 schemas', () => {
    expect(Object.keys(ALL_JSON_SCHEMAS)).toHaveLength(5);
    expect(ALL_JSON_SCHEMAS.typedError).toBeDefined();
    expect(ALL_JSON_SCHEMAS.receipt).toBeDefined();
    expect(ALL_JSON_SCHEMAS.plan).toBeDefined();
    expect(ALL_JSON_SCHEMAS.status).toBeDefined();
    expect(ALL_JSON_SCHEMAS.explain).toBeDefined();
  });

  it('schema versions are consistent across TS types and JSON schemas', () => {
    // TypedError JSON schema matches the const in the TS interface
    expect(TYPED_ERROR_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');

    // Receipt
    expect(RECEIPT_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');

    // Plan
    expect(PLAN_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');

    // Status
    expect(STATUS_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');

    // Explain
    expect(EXPLAIN_JSON_SCHEMA.properties.schema_version.const).toBe('1.0');
  });
});

describe('JSON schema export format', () => {
  it('schemas are valid JSON-serializable objects', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      const json = JSON.stringify(schema);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(schema);
    }
  });

  it('schemas define type as object', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      expect(schema.type).toBe('object');
    }
  });

  it('schemas define required fields', () => {
    const schemas = [
      TYPED_ERROR_JSON_SCHEMA,
      RECEIPT_JSON_SCHEMA,
      PLAN_JSON_SCHEMA,
      STATUS_JSON_SCHEMA,
      EXPLAIN_JSON_SCHEMA,
    ];

    for (const schema of schemas) {
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.required.length).toBeGreaterThan(0);
    }
  });
});
