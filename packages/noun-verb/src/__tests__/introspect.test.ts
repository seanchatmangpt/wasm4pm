import { describe, expect, it } from 'vitest';
import { defineNoun, defineVerb } from '../index.js';
import { buildRegistrySchema, buildToolSchema } from '../introspect.js';

const add = defineVerb({
  noun: 'calc',
  verb: 'add',
  summary: 'Add two numbers',
  args: {
    left: { type: 'positional', description: 'Left operand' },
    right: { type: 'positional', description: 'Right operand' },
  } as const,
  machine: {
    authority: 'OBSERVE',
    effects: ['STDOUT'],
    idempotency: 'IDEMPOTENT',
    determinism: 'DETERMINISTIC',
    receipts: 'REQUIRED',
  },
  handler: () => ({}),
});

const square = defineVerb({
  noun: 'calc',
  verb: 'square',
  summary: 'Square a number (experimental)',
  stability: 'experimental',
  args: {
    value: { type: 'positional', description: 'Value to square' },
    verbose: { type: 'boolean', description: 'Verbose output', default: false },
  } as const,
  handler: () => ({}),
});

const calcNoun = defineNoun({ name: 'calc', verbs: [add, square] });

describe('buildToolSchema', () => {
  it('has the Anthropic/OpenAI tool-schema shape plus a machine execution extension', () => {
    const schema = buildToolSchema('calc', add);
    expect(schema).toHaveProperty('name');
    expect(schema).toHaveProperty('description');
    expect(schema).toHaveProperty('input_schema');
    expect(schema.input_schema).toHaveProperty('type', 'object');
    expect(schema.input_schema).toHaveProperty('properties');
    expect(schema.input_schema).toHaveProperty('required');
    expect(schema.x_wasm4pm).toMatchObject({
      protocol: 'wasm4pm.machine.v1',
      noun: 'calc',
      verb: 'add',
      stability: 'stable',
      machine_contract: { authority: 'OBSERVE', receipts: 'REQUIRED' },
    });
  });

  it('names the tool `<noun>_<verb>`', () => {
    expect(buildToolSchema('calc', add).name).toBe('calc_add');
  });

  it('maps positional args without defaults to required string properties', () => {
    const schema = buildToolSchema('calc', add);
    expect(schema.input_schema.properties.left).toEqual({ type: 'string', description: 'Left operand' });
    expect(schema.input_schema.properties.right).toEqual({ type: 'string', description: 'Right operand' });
    expect(schema.input_schema.required).toEqual(['left', 'right']);
  });

  it('maps boolean args to boolean properties and honors defaults as non-required', () => {
    const schema = buildToolSchema('calc', square);
    expect(schema.input_schema.properties.verbose).toEqual({
      type: 'boolean',
      description: 'Verbose output',
      default: false,
    });
    expect(schema.input_schema.required).not.toContain('verbose');
  });

  it('prefixes the description with [experimental] for non-stable verbs', () => {
    const schema = buildToolSchema('calc', square);
    expect(schema.description).toBe('[experimental] Square a number (experimental)');
  });

  it('marks undeclared machine contracts as unknown rather than inventing authority', () => {
    expect(buildToolSchema('calc', square).x_wasm4pm.machine_contract).toBeNull();
  });

  it('never leaks the framework-injected --human/--introspect flags into the schema', () => {
    const schema = buildToolSchema('calc', add);
    expect(schema.input_schema.properties).not.toHaveProperty('human');
    expect(schema.input_schema.properties).not.toHaveProperty('introspect');
  });
});

describe('buildRegistrySchema', () => {
  it('emits one tool schema per verb across the whole registry', () => {
    const registry = buildRegistrySchema([calcNoun]);
    expect(registry.tools).toHaveLength(2);
    expect(registry.tools.map((tool) => tool.name).sort()).toEqual(['calc_add', 'calc_square']);
  });

  it('advertises the canonical machine transport without help-text parsing', () => {
    const registry = buildRegistrySchema([calcNoun]);
    expect(registry.protocol).toBe('wasm4pm.machine.v1');
    expect(registry.transport).toEqual({
      invocation: "printf '%s' '<json>' | wpm --machine",
      stdout: 'single-json-value',
      stderr: 'diagnostic-only',
    });
  });
});
