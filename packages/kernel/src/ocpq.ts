import * as wasm from '@wasm4pm/core';
import { KernelError } from './errors.js';

export interface OcpqVerdict {
  status: 'Allow' | 'Deny';
  violations: string[];
}

/**
 * Evaluate a Process-Law Query (OCPQ) over an Object-Centric Event Log (OCEL).
 * Throws a KernelError if evaluation or parsing fails.
 */
export function evaluateOcpq(ocelJson: string | object, queryStr: string): OcpqVerdict {
  try {
    const jsonStr = typeof ocelJson === 'string' ? ocelJson : JSON.stringify(ocelJson);
    const resultJson = wasm.evaluate_ocpq(jsonStr, queryStr);
    return JSON.parse(resultJson) as OcpqVerdict;
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    throw new KernelError(rawMsg, 'INVALID_PARAMETER', {
      cause: err instanceof Error ? err : undefined,
    });
  }
}
