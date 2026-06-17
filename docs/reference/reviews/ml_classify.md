# Algorithm Review: ml_classify

## Algorithm ID & Domain
- **Registry ID**: `ml_classify`
- **Domain**: Machine Learning (Classification)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns classification metrics (accuracy, macro F1, precision, recall, test samples, class names).
- **Boundary Checks**:
  - Implements a safety threshold `MIN_SAMPLES = 10`. If the event log has fewer than 10 traces, the algorithm returns an error response early, avoiding division-by-zero or indexing failures on small datasets.
  - Implements robust division-by-zero guards in all confusion-matrix metric calculations (e.g. `precision = if tp + fp > 0.0 { tp / (tp + fp) } else { 0.0 }`).
- **Feature Extraction**:
  - Extracts exactly two features per trace: trace length (number of events) and trace vocabulary size (number of unique activities).
  - Assigns target labels deterministically based on length thresholds: `SHORT_THRESHOLD = 10.0` (class 0), `MEDIUM_THRESHOLD = 30.0` (class 1), else class 2.
- **K-NN Sweeper**:
  - Employs a branchless top-k insertion sort to find the nearest neighbors swiftly without CPU branching penalties.

## Improvement Areas
- **Logic Refinement**:
  - The threshold bounds (`SHORT_THRESHOLD=10.0`, `MEDIUM_THRESHOLD=30.0`) are hardcoded constants. They should be parameter inputs (e.g., in a settings JSON) so users can define classes relevant to their processes.
  - The feature set (length and unique count) is simple. Extracting event frequencies or sequence n-grams would increase classifier accuracy for process prediction tasks.

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/classification.rs` -> `discover_ml_classify`, `knn_internal_metrics`, `extract_features`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
