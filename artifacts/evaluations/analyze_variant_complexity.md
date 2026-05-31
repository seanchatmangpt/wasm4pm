# Algorithm Evaluation: analyze_variant_complexity

## Metadata
- **Algorithm ID**: `analyze_variant_complexity`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `analyze_variant_complexity.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `analyze_variant_complexity.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `analyze_variant_complexity.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `analyze_variant_complexity.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `d301109ca977ecbd39929632c4a47de6c814e03499fbf4f73d6bc35c1330c74e`
- **Verification State**: `Closed`

## Algorithmic Role
The `analyze_variant_complexity` algorithm is responsible for quantifying the structural complexity of process variants within an event log. It evaluates the diversity of paths and the intricacy of activity sequences to provide metrics that help process analysts understand the degree of standardization or fragmentation in the captured business processes.

## Implementation Validation & Details
The `analyze_variant_complexity` algorithm is implemented in Rust (`wasm4pm/src/final_analytics.rs`). It operates by:
- **Variant Extraction**: Iterating through all traces in the event log and extracting the sequence of activities for each trace based on the specified `activity_key`.
- **Frequency Counting**: Utilizing `itertools::counts()` to compute the absolute frequencies of each unique variant (activity sequence).
- **Entropy Calculation**: Computing the Shannon entropy ($-\sum p \log_2 p$) over the variant probability distribution. The implementation optimizes this calculation using `mul_add` for fused multiply-add (FMA) to minimize rounding errors.
- **Coverage Metrics**: Sorting the variants by descending frequency to determine the coverage of the top 10 most frequent variants, as well as the predominant variant size.
- **Complexity Normalization**: Deriving the `max_entropy` ($\log_2(\text{total\_variants})$) and using it to compute a `normalized_entropy` (entropy / max_entropy), which serves as a standardized measure of variant complexity.
