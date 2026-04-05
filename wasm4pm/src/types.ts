/**
 * Branded/opaque handle types for type-safe WASM object references.
 * These types prevent mixing different handle types at compile time.
 */

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

// Handle IDs for different object types stored in WASM state
export type EventLogHandleId = Brand<string, 'EventLog'>;
export type OCELHandleId = Brand<string, 'OCEL'>;
export type DFGHandleId = Brand<string, 'DFG'>;
export type PetriNetHandleId = Brand<string, 'PetriNet'>;
export type DeclareHandleId = Brand<string, 'Declare'>;
export type TemporalProfileHandleId = Brand<string, 'TemporalProfile'>;
export type NGramPredictorHandleId = Brand<string, 'NGramPredictor'>;
export type StreamingDFGHandleId = Brand<string, 'StreamingDFG'>;
export type StreamingConformanceHandleId = Brand<string, 'StreamingConformance'>;

/**
 * Helper function to cast a plain string to an EventLogHandleId.
 * Use this when receiving raw handle values from WASM.
 */
export function asEventLogHandleId(handle: string): EventLogHandleId {
  return handle as EventLogHandleId;
}

export function asOCELHandleId(handle: string): OCELHandleId {
  return handle as OCELHandleId;
}

export function asDFGHandleId(handle: string): DFGHandleId {
  return handle as DFGHandleId;
}

export function asPetriNetHandleId(handle: string): PetriNetHandleId {
  return handle as PetriNetHandleId;
}

export function asDeclareHandleId(handle: string): DeclareHandleId {
  return handle as DeclareHandleId;
}

export function asTemporalProfileHandleId(handle: string): TemporalProfileHandleId {
  return handle as TemporalProfileHandleId;
}

export function asNGramPredictorHandleId(handle: string): NGramPredictorHandleId {
  return handle as NGramPredictorHandleId;
}

export function asStreamingDFGHandleId(handle: string): StreamingDFGHandleId {
  return handle as StreamingDFGHandleId;
}

export function asStreamingConformanceHandleId(handle: string): StreamingConformanceHandleId {
  return handle as StreamingConformanceHandleId;
}
