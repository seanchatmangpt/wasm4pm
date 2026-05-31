/**
 * model-registry.ts
 * TypeScript wrapper for the Process-Model Registry.
 */

import * as wasm from '@wasm4pm/core';
import type { ProcessModelEnvelope } from '@wasm4pm/contracts';
import { KernelError } from './errors.js';

/**
 * Register a process model envelope in the registry.
 * Throws a KernelError if validation or capacity limit fails.
 */
export function registerModel(envelope: ProcessModelEnvelope): { status: string; model_id: string } {
  try {
    const envelopeJson = JSON.stringify(envelope);
    const resultJson = wasm.register_model(envelopeJson);
    return JSON.parse(resultJson);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    let parsed: any;
    try {
      parsed = JSON.parse(rawMsg);
    } catch (_) {
      // Not JSON
    }

    if (parsed && typeof parsed === 'object' && 'code' in parsed && 'message' in parsed) {
      throw new KernelError(parsed.message, parsed.code as any, {
        cause: err instanceof Error ? err : undefined,
      });
    }

    throw new KernelError(rawMsg, 'INVALID_PARAMETER', {
      cause: err instanceof Error ? err : undefined,
    });
  }
}

/**
 * Retrieve a process model envelope from the registry by its ID.
 * Throws a KernelError if the model is not found or has expired.
 */
export function getModel(modelId: string): ProcessModelEnvelope {
  try {
    const resultJson = wasm.get_model(modelId);
    return JSON.parse(resultJson);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    let parsed: any;
    try {
      parsed = JSON.parse(rawMsg);
    } catch (_) {
      // Not JSON
    }

    if (parsed && typeof parsed === 'object' && 'code' in parsed && 'message' in parsed) {
      throw new KernelError(parsed.message, parsed.code as any, {
        cause: err instanceof Error ? err : undefined,
      });
    }

    throw new KernelError(rawMsg, 'INVALID_MODEL_HANDLE', {
      cause: err instanceof Error ? err : undefined,
    });
  }
}
