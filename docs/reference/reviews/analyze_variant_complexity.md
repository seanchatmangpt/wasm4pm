# Algorithm Review: analyze_variant_complexity

## Algorithm ID & Domain
- **Registry ID**: `analyze_variant_complexity`
- **Domain**: Process Analytics / Complexity Measurement

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns JSON containing `total_variants`, `entropy`, `max_entropy`, `normalized_entropy`, `top_10_coverage`, and `predominant_variant_size`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Uses Fused Multiply-Add (`p.log2().mul_add(-p, acc)`) to minimize floating-point rounding errors when calculating Shannon entropy.
  - Guards division-by-zero for entropy normalization: `if max_entropy > 0.0 { entropy / max_entropy } else { 0.0 }`.
  - Safely computes the coverage of the top 10 most frequent variants using `take(10)` and `sum()`.
- **Edge Cases & Errors**:
  - Returns an error if the log is not found or not an EventLog.
  - If there is only 1 variant or no variants, `max_entropy` defaults to `1.0` (or `0.0` depending on empty state checks) to avoid log2(1) division by zero.

## Improvement Areas
- **Performance Optimization**:
  - Builds variant representations by cloning all activity strings for each trace into a `Vec<String>`, which is then hashed. This is slow and memory-intensive. Using the log's columnar format or interning would allow comparing variants as `Vec<u32>` without string allocations.
  - Max entropy calculation: `if variants.len() > 1 { (variants.len() as f64).log2() } else { 1.0 }`. If `variants.len() == 1`, max entropy is mathematically `0.0`, so returning `1.0` is slightly incorrect (though prevents division by zero). A cleaner guard would be to check if `variants.len() <= 1` and set `normalized_entropy` to `0.0` directly.

## Code References
- **Rust Implementation**: `wasm4pm/src/final_analytics.rs` -> `analyze_variant_complexity`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
