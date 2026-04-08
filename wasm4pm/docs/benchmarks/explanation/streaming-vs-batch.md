# Streaming vs Batch Tradeoffs

Why streaming process discovery is slower than batch, when the overhead is acceptable, and how to choose between the two approaches.

---

## The Fundamental Tradeoff

Batch processing and streaming processing are two fundamentally different computational models. The tradeoff is not about speed -- it is about **memory vs latency vs accuracy**.

**Batch processing** loads the entire event log into memory, processes all events at once, and produces a complete result. This is the fastest approach because the algorithm has full visibility into the data and can make optimal decisions.

**Streaming processing** receives events one at a time (or in small batches) and maintains a running summary. The algorithm never sees the full log at once. It must update its internal state incrementally with each new event and be ready to produce a result at any point.

This difference has profound implications for performance, memory usage, and result quality.

---

## Memory Model Comparison

### Batch: O(E + T x L) Memory

A batch algorithm typically stores:

- **E edges**: The direct-follows graph with frequency counts. For BPI 2020, this is roughly 1,225 possible edges (35 activities squared).
- **T traces x L average length**: The full trace sequences, needed for algorithms that recurse into trace structure (Inductive Miner) or compute per-trace statistics (conformance checking).
- **Algorithm-specific state**: Dependency matrices, process tree nodes, Petri net places, ILP variables, etc.

Total memory for batch on BPI 2020: roughly proportional to 141K events plus algorithm overhead. This fits comfortably in 36GB of unified memory, but would be a concern on memory-constrained devices.

### Streaming: O(E) Memory (Edge-Only)

A streaming algorithm typically stores:

- **E edges**: The running direct-follows graph, updated incrementally as events arrive.
- **Open traces**: Only traces that have started but not yet completed. For BPI 2020, this is a small fraction of the total 10,500 traces at any given timestamp.

Total memory for streaming on BPI 2020: proportional to the number of unique edges, not the total event count. This is dramatically less memory than batch, especially for long-running processes where traces accumulate over time.

### The Memory Advantage in Practice

For BPI 2020, the memory difference is modest because the log is small (141K events). But consider a real-world scenario: a process mining system monitoring a high-volume online transaction process with millions of events per day.

- **Batch**: Must hold all events in memory simultaneously. After 30 days, this could be tens of millions of events.
- **Streaming**: Holds only the current edge counts and open traces. Memory usage stays constant regardless of how many events have been processed.

This is why streaming exists: it makes process mining possible on infinite streams where batch processing is physically impossible.

---

## Why Streaming Is Slower

If streaming uses less memory, why is it slower? The answer lies in the incremental computation model.

### Repeated Snapshot Computation

Batch algorithms compute their result once, with full data. Streaming algorithms must update their result with every new event. Each update involves:

1. **Lookup**: Find the relevant edge in the DFG and increment its count.
2. **Trace management**: Add the event to the current open trace, or close the trace if it is the last event.
3. **Snapshot computation**: If the algorithm maintains a more complex structure (e.g., noise-filtered DFG), recompute the filtered graph after each update.

Step 3 is the expensive part. A batch algorithm computes the noise-filtered DFG once, over the complete edge set. A streaming algorithm recomputes it after every event, because each event might change which edges are above the noise threshold.

### Trace Storage Overhead

Streaming algorithms must maintain partial traces for events that have started but not yet completed. This requires a dictionary mapping trace IDs to their current event sequence. Each new event requires a dictionary lookup and potentially a dictionary insert.

Batch algorithms receive the complete trace data and can iterate over it without per-event dictionary overhead.

### The Overhead Range Explained

Our benchmarks show a 1.4x to 23x overhead for streaming vs batch. This wide range reflects how much incremental work each algorithm requires:

| Algorithm          | Batch  | Streaming | Overhead | Why                                                                                              |
| ------------------ | ------ | --------- | -------- | ------------------------------------------------------------------------------------------------ |
| DFG                | ~3.0ms | ~69ms     | 23x      | Every event requires edge lookup + count update + trace management                               |
| Hill Climbing      | ~135ms | ~187ms    | 1.4x     | Greedy pruning is inherently incremental; each event adds at most one edge to evaluate           |
| Noise-Filtered DFG | ~135ms | ~135ms    | ~1x      | Noise filtering cost dominates; incremental updates are cheap relative to the filter computation |

---

## When Streaming Wins

### Infinite Streams

The canonical use case for streaming: you have an event stream that never ends. Think of a live monitoring system watching a production process in real time. Events arrive continuously, and you need to maintain an up-to-date process model at all times.

Batch processing is impossible here because you cannot load an infinite stream into memory. Streaming is the only option.

### Memory-Constrained Devices

IoT devices, edge gateways, and embedded systems may have only megabytes of RAM. BPI 2020's 141K events require roughly 10-50MB of memory depending on the algorithm. An IoT device with 256MB of RAM cannot afford to hold the full log.

Streaming algorithms that maintain only edge counts can operate in under 1MB of memory, making process mining feasible on devices where batch processing is physically impossible.

### Real-Time Monitoring

If you need to detect process changes as they happen (concept drift, new activity introduced, bottleneck appearing), you need streaming. Batch processing can only tell you what happened after the fact. Streaming can alert you in near-real-time when the process model changes.

### Checkpointing and Recovery

Streaming algorithms can checkpoint their state (the current edge counts) at any point. If the system crashes, it can resume from the last checkpoint without reprocessing the entire log. Batch algorithms must restart from scratch.

---

## When Batch Wins

### One-Time Analysis

If you are analyzing a historical event log (e.g., an audit of last year's procurement process), batch processing is faster and simpler. You load the log once, run the algorithm, and get the result. No incremental state management, no trace tracking, no snapshot recomputation.

### Small Logs

For logs with fewer than 10K events, the memory advantage of streaming is irrelevant -- both approaches fit easily in memory. And batch is always faster for the same algorithm. Use batch unless you specifically need streaming semantics.

### Maximum Speed Required

If you are building a benchmark suite, a competitive analysis tool, or any application where speed is the primary concern, batch is the right choice. The fastest possible result comes from processing all data at once with full visibility.

### Complex Algorithms

Some algorithms (ILP, Genetic Algorithm, A\*) are inherently batch. They require global optimization over the complete edge set. Adapting them to streaming would require approximation or heuristic shortcuts that compromise result quality. For these algorithms, batch is not just faster -- it is the only correct approach.

---

## The 80/20 Rule: Streaming Noise-Filtered DFG as the Production Choice

The Streaming Noise-Filtered DFG is a remarkable result in our benchmarks: it runs at approximately the same speed as batch (~135ms) while providing streaming semantics (constant memory, incremental updates, checkpointing).

How is this possible? The noise filtering step (removing edges below a frequency threshold) is computationally expensive. In batch mode, this cost is paid once at the end. In streaming mode, this cost is amortized across events. The incremental edge updates are cheap compared to the noise filtering computation, so the per-event overhead is negligible relative to the dominant cost.

This makes Streaming Noise-Filtered DFG an excellent production choice:

- **Constant memory**: Only edge counts stored, regardless of event volume
- **Near-batch speed**: ~135ms, same as batch noise-filtered DFG
- **Incremental results**: Can produce a process model at any point during processing
- **Noise robust**: Filters out infrequent edges, producing cleaner models
- **Checkpointable**: State can be saved and resumed

For most real-world use cases, Streaming Noise-Filtered DFG provides the best balance of speed, memory efficiency, and result quality.

---

## Hill Climbing: The Anomaly Explained

Hill Climbing shows only 1.4x streaming overhead (~135ms batch vs ~187ms streaming), making it the most streaming-efficient of our metaheuristic algorithms.

This is not an accident. Hill Climbing is a greedy local search algorithm. At each step, it evaluates neighboring solutions and moves to the best one. This is inherently incremental -- the algorithm is already designed to make small, local updates.

When adapted for streaming, Hill Climbing's greedy nature maps naturally to the incremental model. Each new event adds at most one edge to the DFG. The algorithm evaluates whether this edge should be included in the Petri net (it either improves or does not improve the fitness function) and makes a local decision. No global recomputation is needed.

Contrast this with A* search, which explores a global search space and maintains a priority queue of candidate solutions. Adapting A* to streaming would require re-running the search after each new event, which is why A\* is not available in our streaming suite.

---

## The Real-World Analogy

Think of it this way:

**Batch processing** is like reading an entire book and then writing a summary. You have full context, you can refer back to any chapter, and you can revise your summary as you write it. The summary is high quality because you had complete information.

**Streaming processing** is like summarizing a book page by page as you read it. You maintain a running summary that you update with each page. Your running summary is always available, but it may not be as good as the batch summary because you cannot revise earlier parts without re-reading.

The streaming summary is available immediately and uses minimal memory (just the summary itself, not the entire book). The batch summary is better but requires reading the whole book first.

For a 300-page novel, batch is clearly better. For a live news feed that never stops, streaming is the only option. For a 10,500-trace event log like BPI 2020, the choice depends on whether you need the result now (streaming) or can wait for the complete analysis (batch).

---

## Decision Framework

Use this flowchart to choose between batch and streaming:

```
Is the event log finite and fully available?
  Yes → Can it fit in memory?
    Yes → Use batch (faster, simpler)
    No  → Use streaming (constant memory)
  No → Must use streaming (infinite stream)

Do you need real-time results during processing?
  Yes → Use streaming (incremental updates)
  No  → Use batch (faster final result)

Do you need checkpointing and recovery?
  Yes → Use streaming (state can be saved)
  No  → Use batch (simpler)

Do you need maximum result quality?
  Yes → Use batch (full visibility)
  No  → Streaming Noise-Filtered DFG is a good compromise
```
