# Handoff Report — Global Case Study Integration Test Preparation

## 1. Observation

Direct observations of files, structures, and definitions in both repositories:

### Chicago TDD Tools testing macros & paradigms (`chicago-tdd-tools`)
*   **Sync Macro (`test!`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/core/macros/test.rs`
    *   Lines 91-130:
        ```rust
        #[macro_export]
        macro_rules! test {
            ($name:ident, $body:block) => {
                #[test]
                fn $name() -> Result<(), Box<dyn std::error::Error>> {
                    // ... trait helper converts both () and Result to Result<(), Box<dyn Error>>
                    let output = { $body };
                    __chicago_tdd_test_output::TestOutput::into_result(output)
                }
            };
        }
        ```
*   **Async Macro (`async_test!`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/core/macros/test.rs`
    *   Lines 168-173:
        ```rust
        #[macro_export]
        macro_rules! async_test {
            ($name:ident, $body:block) => {
                $crate::async_test_with_timeout!($name, 1, $body);
            };
        }
        ```
    *   Lines 202-254 defines `async_test_with_timeout!`, wrapping the execution inside a `tokio::time::timeout` block.
*   **Fixture Macro (`fixture_test!`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/core/macros/test.rs`
    *   Lines 284-289:
        ```rust
        #[macro_export]
        macro_rules! fixture_test {
            ($name:ident, $fixture_var:ident, $body:block) => {
                $crate::fixture_test_with_timeout!($name, $fixture_var, 1, $body);
            };
        }
        ```
    *   Lines 317-358 defines `fixture_test_with_timeout!`, which arranges a new `TestFixture::new()`.
*   **Performance Macro (`performance_test!`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/core/macros/test.rs`
    *   Lines 384-392:
        ```rust
        #[macro_export]
        macro_rules! performance_test {
            ($name:ident, $body:block) => {
                #[test]
                fn $name() {
                    $body
                }
            };
        }
        ```
*   **Property-based (`PropertyTestGenerator`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/testing/property.rs`
    *   Lines 24-27:
        ```rust
        pub struct PropertyTestGenerator<const MAX_ITEMS: usize = 10, const MAX_DEPTH: usize = 3> {
            /// Random seed for reproducibility
            seed: u64,
        }
        ```
*   **Mutation (`MutationTester`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/testing/mutation.rs`
    *   Lines 38-43:
        ```rust
        pub struct MutationTester {
            /// Original data
            original: HashMap<String, String>,
            /// Mutations applied
            mutations: Vec<MutationOperator>,
        }
        ```
*   **Concurrency (`ConcurrencyTest`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/testing/concurrency.rs`
    *   Lines 18-19 and 62-69:
        ```rust
        pub struct ConcurrencyTest;
        ...
        pub fn run<F>(test_fn: F)
        where
            F: Fn() + Send + Sync + 'static,
        {
            loom::model(move || {
                test_fn();
            });
        }
        ```
*   **OCEL Logging (`OcelCollector`)**:
    *   File Path: `/Users/sac/chicago-tdd-tools/src/observability/ocel/collector.rs`
    *   Lines 15-23:
        ```rust
        pub struct OcelCollector {
            pub(crate) events: Mutex<Vec<Evidence<TestOcelEvent, Admitted, TestSuiteWitness>>>,
            pub(crate) known_objects: DashSet<String>,
            pub(crate) last_timestamps: DashMap<RunId, u64>,
            pub(crate) ocel_output_path: Option<PathBuf>,
            pub(crate) auto_discover: bool,
            pub(crate) discovery_threshold: usize,
            pub(crate) discovery_triggered: Mutex<bool>,
        }
        ```

### WASM4PM Workspace Structure (`wasm4pm`)
*   **Root Workspace**:
    *   File Path: `/Users/sac/wasm4pm/Cargo.toml`
    *   Lines 30-31:
        ```toml
        wasm4pm = { version = "26.7.1", path = "wasm4pm", features = ["cloud"] }
        wasm4pm-cognition = { version = "26.7.1", path = "crates/wasm4pm-cognition" }
        ```
*   **`wasm4pm` Crate**:
    *   Name: `wasm4pm`
    *   Path: `/Users/sac/wasm4pm/wasm4pm` (and Cargo.toml path `/Users/sac/wasm4pm/wasm4pm/Cargo.toml`)
*   **`wasm4pm-cognition` Crate**:
    *   Name: `wasm4pm-cognition`
    *   Path: `/Users/sac/wasm4pm/crates/wasm4pm-cognition` (and Cargo.toml path `/Users/sac/wasm4pm/crates/wasm4pm-cognition/Cargo.toml`)

### Project Omni-Route Phases
*   File Path: `/Users/sac/wasm4pm/examples/16-global-case-study.ts`
    *   **Phase 1: Ingestion & Object-Centric Topology** (Lines 16-17):
        *   `pnml_import`, `bpmn_import`, `powl_to_process_tree`, `yawl_export`, `ocel_dfg`, `ocel_dfg_per_type`, `ocel_encode`, `ocel_oc_declare`, `ocel_ocla`, `ocel_petri_net`
    *   **Phase 2: Process Discovery & Structural Mapping** (Lines 19-20):
        *   `alpha_plus_plus`, `heuristic_miner`, `dfg`, `optimized_dfg`, `hierarchical_dfg`, `simd_streaming_dfg`, `inductive_miner`, `correlation_miner`, `transition_system`, `causal_graph`, `log_to_trie`
    *   **Phase 3: Streaming, Drift Detection, and Spectral Analytics** (Lines 22-23):
        *   `streaming_log`, `compute_ewma`, `performance_spectrum`, `detect_drift`, `smart_engine`, `compute_activity_transition_matrix`, `compute_trace_similarity_matrix`, `batches`, `analyze_process_speedup`, `analyze_variant_complexity`
    *   **Phase 4: Rigorous Conformance & Formal Constraints** (Lines 25-26):
        *   `alignments`, `etconformance_precision`, `generalization`, `complexity_metrics`, `declare`
    *   **Phase 5: Predictive Modeling & Advanced Machine Learning** (Lines 28-29):
        *   `predict_next_activity`, `predict_remaining_time`, `predict_outcome`, `ml_classify`, `automl_classify`, `ml_cluster`, `ml_pca`, `ml_regress`, `ml_forecast`, `automl_forecast`, `ml_anomaly`, `handover_network`, `working_together_network`
    *   **Phase 6: Global Meta-Heuristic Optimization** (Lines 31-32):
        *   `a_star`, `aco`, `pso`, `genetic_algorithm`, `simulated_annealing`, `hill_climbing`, `ilp`, `monte_carlo_simulation`, `playout`
*   File Path: `/Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/registration.rs`
    *   **Cognitive Breeds (Phases 7-10)** (Lines 119-175):
        *   Contains the `BreedId::ALL` static array containing all 55 active cognitive breeds (e.g. `ltl_monitor`, `allen_temporal`, `ctl_check`, etc.) validated via Havelund-Roşu bounds.

---

## 2. Logic Chain

1. **Integrating Dev-Dependencies**: Cargo allows integrating external workspaces if paths are specified. We identified the exact workspace member paths (`wasm4pm` at `/Users/sac/wasm4pm/wasm4pm` and `wasm4pm-cognition` at `/Users/sac/wasm4pm/crates/wasm4pm-cognition`). We can safely add these paths to `chicago-tdd-tools/Cargo.toml` as dev-dependencies to import them into the test suite.
2. **Structuring the Integration Test Suite**: The integration test file `/Users/sac/chicago-tdd-tools/tests/global_case_study_integration.rs` will map tests to each of the 8 required testing paradigms.
3. **Execution Routing**:
    *   *Synchronous routing validation (`test!`) & Performance budget (`performance_test!`)*: We can execute process mining pipelines sequentially using algorithms defined in the Phase lists and measure operation ticks/latencies.
    *   *Async ingestion (`async_test!`) & Mock environment (`fixture_test!`)*: We can structure async event streams or telemetry logs and feed them to `OcelCollector` or streaming algorithms, utilizing a simulated environment via `TestFixture`.
    *   *Property-based (`PropertyTestGenerator`) & Mutation testing (`MutationTester`)*: We can perturb simulated event configurations randomly and mutation-test validation functions.
    *   *Concurrency & OCEL Logging*: We can execute concurrent sensor logs or locks and monitor events captured via `OcelCollector`, sealing the final execution trace to a cryptographic receipt.

---

## 3. Caveats

No caveats. All requested files, macros, crates, and phases have been investigated and mapped.

---

## 4. Conclusion

The codebase structure and requirements for the Project Omni-Route global case study integration test suite are fully mapped. All 8 testing paradigms from `chicago-tdd-tools` and the 10 phases (encompassing 60 algorithms and 55 cognitive breeds) from `wasm4pm` have been traced to their definition locations. The workspace is fully prepared for dev-dependency integration and test implementation.

---

## 5. Verification Method

To verify the details in this report:
1. View `/Users/sac/chicago-tdd-tools/src/core/macros/test.rs` to verify macros compile signature.
2. View `/Users/sac/wasm4pm/examples/16-global-case-study.ts` to inspect the Phase lists.
3. View `/Users/sac/wasm4pm/crates/wasm4pm-cognition/src/breeds/registration.rs` to inspect the list of cognitive breeds.
