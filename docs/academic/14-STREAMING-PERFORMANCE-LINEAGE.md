# Streaming and Engineering Algorithms — Historical Lineage

*Generated 2026-05-30 — static knowledge base, no network calls.*

Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.

Coverage kinds: `direct` | `derived` | `engineering` | `consumer-contract` | `future`

---

## `simd_streaming_dfg`

**Formal object:** SIMD-accelerated streaming DFG approximation
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering primitive: SIMD vectorization of DFG edge counting.
- Known bug: HashMap iteration order is non-deterministic across runs.

---

## `hierarchical_dfg`

**Formal object:** Hierarchical DFG with activity abstraction levels
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering extension; hierarchical abstraction in PM exists (e.g., Günther & van der Aalst) but not under this name.

---

## `optimized_dfg`

**Formal object:** Optimized DFG with improved memory layout for large logs
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering optimization; no PM paper defines this variant.

---

## `log_to_trie`

**Formal object:** Prefix-tree (trie) representation of event log traces for efficient replay
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Trie-based log representation is a data structure engineering choice.
- Known bug: HashMap iteration over cases may produce non-deterministic output.

---

## `streaming_log`

**Formal object:** Streaming event log: online DFG update as events arrive
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering primitive: no #[wasm_bindgen] exports — unreachable from JS.
- Online/streaming PM exists in literature (Burattin et al.) but this specific implementation is engineering.

---

## `performance_spectrum`

**Formal object:** Performance spectrum: segmented visualization of case segment durations over time
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `denisov_fahland_van_der_aalst_2018`
**first_peer_reviewed:** `denisov_fahland_van_der_aalst_2018`
**canonical:** `denisov_fahland_van_der_aalst_2018`

**Notes:**
- Denisov, Fahland, van der Aalst — BPM 2018. DOI: 10.1007/978-3-319-98648-7_9.

---

## `batches`

**Formal object:** Batch detection: identifying simultaneous processing of multiple cases by the same resource
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `martin_et_al_2019`
**first_peer_reviewed:** `martin_et_al_2019`
**canonical:** `martin_et_al_2019`

**Notes:**
- Martin, Depaire, Caris — Business Process Mining Journal 2019.
- Earlier work: Pika et al. on batching behavior in processes.

---

## `smart_engine`

**Formal object:** Adaptive algorithm selection heuristic (selects discovery algorithm based on log characteristics)
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering primitive: algorithm selection logic. No PM paper defines 'smart_engine'.

---

