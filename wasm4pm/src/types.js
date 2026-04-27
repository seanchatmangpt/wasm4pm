/**
 * Branded/opaque handle types for type-safe WASM object references.
 * These types prevent mixing different handle types at compile time.
 */
/**
 * Helper function to cast a plain string to an EventLogHandleId.
 * Use this when receiving raw handle values from WASM.
 */
export function asEventLogHandleId(handle) {
  return handle;
}
export function asOCELHandleId(handle) {
  return handle;
}
export function asDFGHandleId(handle) {
  return handle;
}
export function asPetriNetHandleId(handle) {
  return handle;
}
export function asDeclareHandleId(handle) {
  return handle;
}
export function asTemporalProfileHandleId(handle) {
  return handle;
}
export function asNGramPredictorHandleId(handle) {
  return handle;
}
export function asStreamingDFGHandleId(handle) {
  return handle;
}
export function asStreamingConformanceHandleId(handle) {
  return handle;
}
export function asOCPetriNetHandleId(handle) {
  return handle;
}
export function asFeatureMatrixHandleId(handle) {
  return handle;
}
//# sourceMappingURL=types.js.map
