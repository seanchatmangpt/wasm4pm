import { describe, expect, it } from 'vitest';
import { defineNoun, defineVerb } from '../index.js';
import { MACHINE_PROTOCOL, machineInvocationToArgv } from '../machine.js';

const echo = defineVerb({
  noun: 'agent',
  verb: 'echo',
  summary: 'Echo a value',
  args: {
    value: { type: 'string', required: true },
    persist: { type: 'boolean', default: false },
  } as const,
  machine: {
    authority: 'CONSTRUCT',
    effects: ['STDOUT'],
    idempotency: 'IDEMPOTENT',
    determinism: 'DETERMINISTIC',
    receipts: 'REQUIRED',
  },
  handler: (args) => args,
});

const registry = [defineNoun({ name: 'agent', verbs: [echo] })];

describe('machineInvocationToArgv', () => {
  it('manufactures ordinary argv for the existing noun/verb dispatcher', () => {
    expect(
      machineInvocationToArgv(
        {
          protocol: MACHINE_PROTOCOL,
          noun: 'agent',
          verb: 'echo',
          args: { value: 'hello', persist: true },
        },
        registry
      )
    ).toEqual(['agent', 'echo', '--value', 'hello', '--persist']);
  });

  it('refuses unknown arguments instead of silently dropping them', () => {
    expect(() =>
      machineInvocationToArgv(
        {
          protocol: MACHINE_PROTOCOL,
          noun: 'agent',
          verb: 'echo',
          args: { value: 'hello', imaginary: 'ambient-authority' },
        } as never,
        registry
      )
    ).toThrow(/MACHINE_INVOCATION_REFUSED: unknown argument 'imaginary'/);
  });

  it('refuses missing required arguments before dispatch', () => {
    expect(() =>
      machineInvocationToArgv(
        { protocol: MACHINE_PROTOCOL, noun: 'agent', verb: 'echo', args: {} },
        registry
      )
    ).toThrow(/missing required arguments: value/);
  });

  it('refuses protocol drift fail-closed', () => {
    expect(() =>
      machineInvocationToArgv(
        { protocol: 'future.v99', noun: 'agent', verb: 'echo', args: { value: 'hello' } } as never,
        registry
      )
    ).toThrow(/protocol must equal 'wasm4pm.machine.v1'/);
  });
});

describe('machine authority registration fence', () => {
  it('refuses a DO-capable verb that does not require receipts', () => {
    expect(() =>
      defineVerb({
        noun: 'agent',
        verb: 'unsafe-do',
        summary: 'Invalid unreceipted DO witness',
        machine: {
          authority: 'DO',
          effects: ['FILESYSTEM'],
          idempotency: 'NON_IDEMPOTENT',
          determinism: 'ENVIRONMENT_DEPENDENT',
          receipts: 'OPTIONAL',
        },
        handler: () => ({}),
      })
    ).toThrow(/DO without receipts=REQUIRED/);
  });
});
