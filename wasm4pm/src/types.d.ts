/**
 * Branded/opaque handle types for type-safe WASM object references.
 * These types prevent mixing different handle types at compile time.
 */
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & {
  readonly [__brand]: B;
};
export type EventLogHandleId = Brand<string, 'EventLog'>;
export type OCELHandleId = Brand<string, 'OCEL'>;
export type DFGHandleId = Brand<string, 'DFG'>;
export type PetriNetHandleId = Brand<string, 'PetriNet'>;
export type DeclareHandleId = Brand<string, 'Declare'>;
export type TemporalProfileHandleId = Brand<string, 'TemporalProfile'>;
export type NGramPredictorHandleId = Brand<string, 'NGramPredictor'>;
export type StreamingDFGHandleId = Brand<string, 'StreamingDFG'>;
export type StreamingConformanceHandleId = Brand<string, 'StreamingConformance'>;
export type OCPetriNetHandleId = Brand<string, 'OCPetriNet'>;
export type FeatureMatrixHandleId = Brand<string, 'FeatureMatrix'>;
/**
 * Helper function to cast a plain string to an EventLogHandleId.
 * Use this when receiving raw handle values from WASM.
 */
export declare function asEventLogHandleId(handle: string): EventLogHandleId;
export declare function asOCELHandleId(handle: string): OCELHandleId;
export declare function asDFGHandleId(handle: string): DFGHandleId;
export declare function asPetriNetHandleId(handle: string): PetriNetHandleId;
export declare function asDeclareHandleId(handle: string): DeclareHandleId;
export declare function asTemporalProfileHandleId(handle: string): TemporalProfileHandleId;
export declare function asNGramPredictorHandleId(handle: string): NGramPredictorHandleId;
export declare function asStreamingDFGHandleId(handle: string): StreamingDFGHandleId;
export declare function asStreamingConformanceHandleId(
  handle: string
): StreamingConformanceHandleId;
export declare function asOCPetriNetHandleId(handle: string): OCPetriNetHandleId;
export declare function asFeatureMatrixHandleId(handle: string): FeatureMatrixHandleId;
export {};
//# sourceMappingURL=types.d.ts.map
