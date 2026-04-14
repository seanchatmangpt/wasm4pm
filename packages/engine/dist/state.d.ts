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
//# sourceMappingURL=state.d.ts.map