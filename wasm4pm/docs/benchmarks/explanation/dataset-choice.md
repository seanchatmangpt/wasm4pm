# Why BPI 2020 Travel Permits?

The dataset behind every benchmark number in pictl, and why it was chosen over alternatives.

---

## The Dataset

**BPI 2020 Travel Permits** is a real-world event log from a Dutch government agency responsible for processing travel expense reimbursement permits. It contains:

| Property             | Value                        |
| -------------------- | ---------------------------- |
| Traces               | 10,500                       |
| Events               | ~141,000                     |
| Activities           | ~35 unique                   |
| Average trace length | ~13 events                   |
| Max trace length     | ~80+ events                  |
| Source               | BPI Challenge 2020           |
| Domain               | Government permit processing |

This is the primary dataset for all pictl benchmarks. Every algorithm timing, every memory measurement, every streaming comparison uses this log as input.

---

## Why Real Data Matters

Synthetic event logs are tempting for benchmarks because they are controllable, scalable, and reproducible. You can generate a log with exactly 10,000 traces, each with exactly 5 events, following a perfectly clean workflow pattern. The problem is that this cleanliness is a lie.

Real event logs exhibit characteristics that synthetic logs typically do not:

### Noise

Real processes have noise. An employee submits a permit, it gets rejected, they resubmit with corrections, it gets approved, payment is issued, then they appeal the amount. The resulting trace is messy: duplicate activities, skipped steps, loops back to earlier stages. Algorithms that assume clean input will produce different results on real data than on synthetic data.

### Variant Distribution

The BPI 2020 log has a long-tail variant distribution: a small number of trace variants account for most of the volume, but there is a long tail of rare variants. This is characteristic of real processes. A few common paths (submit-approve-pay) dominate, but edge cases (appeal-resubmit-reject-escalate) exist and matter for conformance checking.

### Concept Drift

Government processes change over time. Regulations are updated, new approval steps are added, old ones are removed. The BPI 2020 log spans a time period where the process evolved, meaning early traces follow a different pattern than late traces. This is realistic and stresses algorithms differently than a static synthetic log.

### Data Quality Issues

Real logs have missing timestamps, duplicate events, case ID inconsistencies, and activity name variations ("Approve" vs "APPROVED" vs "approve_request"). Our benchmark pipeline normalizes these issues once during loading, but the structural complexity remains in the trace patterns themselves.

---

## BPI Challenge History and Selection Criteria

The BPI (Business Process Intelligence) Challenge has been held annually since 2011. Each year, a real organization contributes an event log for the process mining community to analyze. We evaluated several years before settling on 2020.

### BPI 2012 (Loan Applications)

10,000 traces, ~260K events. This is the most widely benchmarked event log in process mining literature. However, it has become a "toy problem" -- algorithms have been over-optimized for its specific characteristics. We wanted a dataset where no algorithm has an unfair advantage from years of targeted optimization.

### BPI 2017 (Financial Loan Applications)

Large dataset (~1.2M events) with complex lifecycle data. Excellent for scalability testing but too large for quick iterative benchmarks. Running 21 algorithms x 7 runs on BPI 2017 would take minutes per benchmark cycle, slowing development feedback.

### BPI 2018 (Domestic Declarations)

3,700 traces, ~43K events. Smaller than BPI 2020. Good for algorithm correctness testing but does not stress memory or scaling characteristics as effectively.

### BPI 2019 (Travel Permits)

Earlier version of the same domain as BPI 2020. Similar characteristics but smaller scale. BPI 2020 is a strict superset in terms of analytical interest.

### BPI 2020 (Travel Permits) -- Our Choice

10,500 traces, ~141K events. Large enough to produce meaningful timing differences between algorithms (~2.7ms to ~135ms range), small enough for rapid iteration (~3 seconds for a full benchmark cycle). Real government process with genuine complexity. Not over-studied in literature, reducing the risk of overfitting.

---

## Synthetic Data: When It Is Appropriate

We do use synthetic data, but for specific purposes where BPI 2020 is not the right tool.

### Scalability Testing

To measure how algorithms scale with data size, we generate synthetic logs at 1K, 10K, 100K, and 1M traces. BPI 2020 gives us one data point; synthetic data lets us plot the full scaling curve. The synthetic generator produces logs with configurable trace length distributions, variant counts, and noise levels.

### Edge Case Testing

Synthetic logs let us test edge cases that may not exist in BPI 2020:

- Single-activity logs (every trace has exactly one event)
- Maximal-variant logs (every trace is unique)
- High-noise logs (50%+ of events are noise)
- Deeply nested loops (traces with 100+ repetitions of the same activity)

### Deterministic Regression Testing

Synthetic logs are deterministic: the same seed produces the same log. This makes them ideal for regression tests where we need bit-exact reproducibility. BPI 2020 is a fixed dataset, but we cannot easily create "BPI 2020 but 2x larger" with the same statistical properties.

---

## How Dataset Characteristics Affect Algorithm Performance

The BPI 2020 log's specific characteristics interact with algorithm internals in ways that affect measured performance:

### Trace Length Variance

The average trace length is ~13 events, but the maximum is 80+. This variance matters for algorithms that maintain per-trace state (Inductive Miner's recursion tree, Heuristic Miner's dependency matrix construction). Algorithms with O(T \* L) complexity where T is trace count and L is average trace length will be affected differently by long-tail distributions than algorithms with O(E) complexity where E is total event count.

### Variant Explosion

BPI 2020 has hundreds of unique trace variants. Algorithms that build process trees by splitting on activity sets (Inductive Miner) perform more recursive splits when variants are diverse. Algorithms that aggregate statistics (DFG, Heuristic Miner) are less affected because they accumulate counts regardless of variant diversity.

### Activity Count

~35 unique activities means the DFG has up to 35^2 = 1,225 possible edges. In practice, many edges are zero-frequency, but the matrix size is determined by the activity count, not the actual edge count. This affects memory usage for matrix-based algorithms.

### Sequential Dependencies

The travel permit process has strong sequential dependencies: you cannot pay before approval, you cannot approve before submission. This means the DFG is sparse and the process model has clear structure. Algorithms that exploit this sparsity (ILP with constraint reduction) will perform differently on logs with dense, cross-connected DFGs.

---

## Connection to Streaming Benchmarks

BPI 2020 serves as the **ground truth** for streaming benchmarks. We replay the event log event-by-event (ordered by timestamp) through our streaming algorithms and compare the final result against the batch result on the full log.

This comparison is only meaningful if the dataset has realistic temporal ordering and genuine process structure. A synthetic log with random event ordering would produce meaningless streaming results because the streaming algorithm would never see coherent traces.

BPI 2020's real timestamps ensure that events within a trace arrive in causal order (submission before approval before payment). This lets us measure streaming accuracy: how closely does the streaming result match the batch result after processing all events?

---

## Dataset Lifecycle

Our benchmark dataset is pinned to a specific version and stored in the repository:

```
wasm4pm/fixtures/bpi2020/
  events.csv          # Normalized event log (trace_id, activity, timestamp)
  metadata.json       # Dataset statistics (trace count, event count, activity set)
  checksum.sha256     # Integrity verification
```

When the BPI Challenge releases updated or corrected versions of datasets, we evaluate whether the changes affect benchmark validity. If the changes are minor (corrected timestamps, added metadata), we may update. If the changes alter the trace structure (removed events, changed case IDs), we treat it as a new dataset and re-baseline all algorithms.

---

## Accessing the Dataset

The BPI 2020 dataset is publicly available from the BPI Challenge website. Our normalized version is included in the pictl repository for reproducible benchmarks. If you want to benchmark on your own data:

```bash
# Benchmark on BPI 2020 (included)
pictl run fixtures/bpi2020/events.csv --algorithm dfg --format json

# Benchmark on your own log
pictl run my-process.xes --algorithm dfg --format json

# Compare performance across datasets
pictl compare dfg heuristic_miner --format json > comparison.json
```

Any XES or CSV event log with the standard columns (case:concept:name, concept:name, time:timestamp) will work with pictl's benchmarking infrastructure.
