/**
 * state.ts
 * State definitions and metadata for the engine lifecycle
 * Provides type-safe state introspection and classification
 */

import { z } from 'zod';
import { EngineState } from '@wasm4pm/contracts';

// Re-export for convenience
export type { EngineState };

/**
 * Zod schema for StateMetadata
 */
export const StateMetadataSchema = z.object({
  name: z.string() as z.ZodType<EngineState>,
  description: z.string(),
  operational: z.boolean(),
  terminal: z.boolean(),
  processing: z.boolean(),
});

/**
 * Metadata describing each engine state
 */
export type StateMetadata = z.infer<typeof StateMetadataSchema>;

/**
 * Complete state metadata map
 */
export const STATE_METADATA: Record<EngineState, StateMetadata> = {
  uninitialized: {
    name: 'uninitialized',
    description: 'Engine created but not yet bootstrapped',
    operational: false,
    terminal: false,
    processing: false,
  },
  bootstrapping: {
    name: 'bootstrapping',
    description: 'Loading WASM module and initializing kernel',
    operational: false,
    terminal: false,
    processing: true,
  },
  ready: {
    name: 'ready',
    description: 'Engine initialized and ready to accept work',
    operational: true,
    terminal: false,
    processing: false,
  },
  planning: {
    name: 'planning',
    description: 'Generating execution plan from configuration',
    operational: true,
    terminal: false,
    processing: true,
  },
  running: {
    name: 'running',
    description: 'Executing a plan to completion',
    operational: true,
    terminal: false,
    processing: true,
  },
  watching: {
    name: 'watching',
    description: 'Streaming execution with checkpointing and heartbeat',
    operational: true,
    terminal: false,
    processing: true,
  },
  degraded: {
    name: 'degraded',
    description: 'Operating with reduced capability due to recoverable errors',
    operational: false,
    terminal: false,
    processing: false,
  },
  failed: {
    name: 'failed',
    description: 'Terminal failure state, requires re-bootstrap',
    operational: false,
    terminal: true,
    processing: false,
  },
};

/**
 * All valid engine states
 * @internal
 */
export const ALL_STATES: readonly EngineState[] = Object.keys(STATE_METADATA) as EngineState[];

/**
 * Check if a state is operational (can accept work)
 * @internal
 */
export function isOperationalState(state: EngineState): boolean {
  return STATE_METADATA[state].operational;
}

/**
 * Check if a state is terminal (cannot recover without re-bootstrap)
 * @internal
 */
export function isTerminalState(state: EngineState): boolean {
  return STATE_METADATA[state].terminal;
}

/**
 * Check if a state indicates active processing
 * @internal
 */
export function isProcessingState(state: EngineState): boolean {
  return STATE_METADATA[state].processing;
}
