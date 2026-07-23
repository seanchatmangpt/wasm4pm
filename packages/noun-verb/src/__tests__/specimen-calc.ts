/**
 * Specimen mini-CLI — the TS analog of the crate's calculator example
 * (~/clap-noun-verb/examples/generated-from-turtle/calculator-cli.rs).
 *
 * Exercises the framework end-to-end: noun/verb dispatch, JSON-default
 * output, --human, structured errors, and the experimental banner.
 * Business logic (add/subtract/multiply/divide) is pure and untouched
 * by the framework — verbs are thin wrappers over it, per contract.
 */

import { buildCli, defineNoun, defineVerb, NounVerbError, type ErrorCodeMap } from '../index.js';

// ─── Pure business logic ───────────────────────────────────────────────────

interface CalculationResult {
  operation: string;
  left: number;
  right: number;
  result: number;
}

function addNumbers(left: number, right: number): CalculationResult {
  return { operation: 'addition', left, right, result: left + right };
}

function multiplyNumbers(left: number, right: number): CalculationResult {
  return { operation: 'multiplication', left, right, result: left * right };
}

function divideNumbers(left: number, right: number): CalculationResult {
  if (right === 0) {
    throw NounVerbError.invalidInput('Division by zero is not allowed', { left, right });
  }
  return { operation: 'division', left, right, result: left / right };
}

function parseOperand(raw: string | undefined, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    throw NounVerbError.invalidInput(`Missing required operand '${name}'`);
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw NounVerbError.invalidInput(`'${name}' must be a number, got '${raw}'`);
  }
  return value;
}

// ─── Verb layer (thin) ──────────────────────────────────────────────────────

const operandArgs = {
  left: { type: 'positional', description: 'Left operand' },
  right: { type: 'positional', description: 'Right operand' },
} as const;

const add = defineVerb({
  noun: 'calc',
  verb: 'add',
  summary: 'Add two numbers',
  args: operandArgs,
  handler: (args) => addNumbers(parseOperand(args.left, 'left'), parseOperand(args.right, 'right')),
  human: (result) => `${result.left} + ${result.right} = ${result.result}`,
});

const multiply = defineVerb({
  noun: 'calc',
  verb: 'multiply',
  summary: 'Multiply two numbers',
  args: operandArgs,
  handler: (args) => multiplyNumbers(parseOperand(args.left, 'left'), parseOperand(args.right, 'right')),
});

const divide = defineVerb({
  noun: 'calc',
  verb: 'divide',
  summary: 'Divide two numbers',
  args: operandArgs,
  handler: (args) => divideNumbers(parseOperand(args.left, 'left'), parseOperand(args.right, 'right')),
});

const square = defineVerb({
  noun: 'calc',
  verb: 'square',
  summary: 'Square a number (experimental)',
  stability: 'experimental',
  args: {
    value: { type: 'positional', description: 'Value to square' },
  } as const,
  handler: (args) => {
    const value = parseOperand(args.value, 'value');
    return { operation: 'square', value, result: value * value };
  },
});

// ─── Noun registry ──────────────────────────────────────────────────────────

export const calcNoun = defineNoun({
  name: 'calc',
  description: 'Calculator operations',
  verbs: [add, multiply, divide, square],
});

/** Build the specimen CLI. `errorCodeMap` lets tests exercise host overrides. */
export function buildSpecimenCli(errorCodeMap?: ErrorCodeMap) {
  return buildCli([calcNoun], {
    name: 'calc-cli',
    version: '0.0.0',
    description: 'Specimen calculator CLI for @wasm4pm/noun-verb tests',
    errorCodeMap,
  });
}
