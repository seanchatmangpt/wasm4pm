/**
 * Envelope test helper — assert canonical CommandResult shape.
 *
 * Canonical envelope: { command: string, status: 'ok' | 'error', meta?, payload }
 */

import { expect } from 'vitest';

export interface EnvelopeExpectations {
  command?: string;
  status?: 'ok' | 'error';
}

export function assertEnvelope(value: unknown, expectations: EnvelopeExpectations = {}): void {
  expect(value, 'envelope must be an object').toBeTruthy();
  expect(typeof value, 'envelope must be an object').toBe('object');
  const env = value as { command?: unknown; status?: unknown; payload?: unknown };
  expect(typeof env.command, 'envelope.command must be a string').toBe('string');
  expect(env.status === 'ok' || env.status === 'error', 'envelope.status must be ok|error').toBe(true);
  expect('payload' in env, 'envelope must have a payload field').toBe(true);

  if (expectations.command !== undefined) {
    expect(env.command).toBe(expectations.command);
  }
  if (expectations.status !== undefined) {
    expect(env.status).toBe(expectations.status);
  }
}
