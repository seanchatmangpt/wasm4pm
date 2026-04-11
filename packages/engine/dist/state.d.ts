/**
 * state.ts
 * State definitions and metadata for the engine lifecycle
 * Provides type-safe state introspection and classification
 */
import { EngineState } from '@pictl/contracts';
export type { EngineState };
/**
 * Metadata describing each engine state
 */
export interface StateMetadata {
    name: EngineState;
    description: string;
    operational: boolean;
    terminal: boolean;
    processing: boolean;
}
/**
 * Complete state metadata map
 */
export declare const STATE_METADATA: Record<EngineState, StateMetadata>;
/**
 * All valid engine states
 */
export declare const ALL_STATES: readonly EngineState[];
/**
 * Check if a state is operational (can accept work)
 */
export declare function isOperationalState(state: EngineState): boolean;
/**
 * Check if a state is terminal (cannot recover without re-bootstrap)
 */
export declare function isTerminalState(state: EngineState): boolean;
/**
 * Check if a state indicates active processing
 */
export declare function isProcessingState(state: EngineState): boolean;
//# sourceMappingURL=state.d.ts.map