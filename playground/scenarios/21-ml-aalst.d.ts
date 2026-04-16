/**
 * Scenario 21 (Aalst): ML Correctness via Process Mining Evidence
 *
 * JTBD: "I want to verify the ML algorithms actually produce correct predictions,
 * not just that they exit 0."
 *
 * Doctrine: Machine learning correctness is proven through **conformance evidence**,
 * not assertion values. We validate:
 * 1. Output structure matches declared schema
 * 2. Predictions don't violate domain invariants
 * 3. Determinism is proven by value-level equality (not just length)
 * 4. Domain invariants hold across nested structures
 * 5. No type coercion hides NaN or missing values
 *
 * No mocks — real WASM, real ML algorithms, real event logs.
 * No silent fallbacks (|| 0) that hide failures.
 */
export {};
//# sourceMappingURL=21-ml-aalst.d.ts.map