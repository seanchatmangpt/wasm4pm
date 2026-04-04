# Understanding wasm4pm: Concepts and Design Reasoning

This document is oriented toward understanding — not toward action. It explains
why the system is built the way it is, what conceptual choices underlie the
implementation, and where the interesting trade-offs lie. Readers who want to
do something specific should look at QUICKSTART.md, TUTORIAL.md, or API.md
instead.

---

## 1. Why WebAssembly for Process Mining

The dominant tool for process mining in Python is pm4py. It is well-maintained,
has a rich academic lineage, and covers the full IEEE XES standard. The question
"why build in Rust and compile to WebAssembly rather than wrap pm4py" therefore
deserves a genuine answer.

Python's performance ceiling matters in process mining because event logs from
production systems are large. A log from a typical ERP process might carry
several million events. The Alpha Miner, Heuristic Miner, and token replay
algorithms all require multiple passes over the log, and their inner loops
involve string comparison, hash lookups, and dynamic allocation. In CPython,
each of those operations carries overhead that compounds: dictionary lookups
dereference multiple pointer layers, strings are immutable heap objects, and
the GIL prevents true parallelism in CPU-bound code. PyPy and Cython can
recover some of this, but they require separate distribution artifacts and do
not work cleanly in all deployment contexts.

Rust eliminates those overheads at the source level. Integer comparisons replace
string comparisons once an activity vocabulary is encoded. Hash maps operate on
fixed-width keys with predictable memory layout. The compiler's ownership model
prevents the accidental copying that often silently doubles memory usage in
Python data processing pipelines. The resulting WASM binary is roughly 2 MB
and executes at near-native speed.

What does this cost? Primarily ecosystem reach. pm4py can read from pandas
DataFrames, integrates with Jupyter notebooks, and is the natural target of
academic papers that include runnable code. The Rust/WASM artifact cannot be
imported into a Python notebook at all. It also cannot leverage SciPy's linear
programming solver, NetworkX's graph algorithms, or any of the other scientific
Python libraries. Everything in this system is reimplemented from first
principles in Rust.

The other significant benefit of WASM is deployment portability. A single
compiled binary runs in Chrome, Firefox, Safari, Edge, and Node.js without
recompilation or platform detection. There is no Python runtime to install,
no virtual environment to maintain, and no native extension to rebuild when the
operating system is upgraded. For teams embedding process mining into a web
product — a monitoring dashboard, a no-code analytics tool, a browser-based
conformance checker — that portability is decisive. For researchers working
primarily in Python notebooks, it is irrelevant.

The trade-off is therefore not absolute. It is contextual: wasm4pm is the right
tool when deployment environment, performance at scale, or browser execution
matters more than ecosystem integration with the Python scientific stack.

---

## 2. The Handle-Based Architecture

When a JavaScript application calls a WASM function, arguments cross what is
called the WASM boundary. The WASM module occupies its own linear memory region
— a flat array of bytes visible to the Rust code but not directly accessible as
JavaScript objects. Moving data across this boundary requires serialization: the
JavaScript runtime and the WASM module must agree on a representation, copy the
bytes, and then each side interprets them independently.

For small values — a number, a short string, a JSON blob with a few fields —
this cost is negligible. For an event log with one hundred thousand events, each
carrying a case identifier, a timestamp, and several attributes, the cost is
substantial. Serializing such a log to a JSON string, passing it into WASM,
parsing it back into Rust data structures, running an algorithm, serializing the
result back to JSON, and parsing that on the JavaScript side would make even a
fast algorithm slow. Worse, it would double peak memory consumption: both sides
hold the data simultaneously during the crossing.

The handle-based architecture avoids this entirely. When a log is loaded — from
XES, from JSON, from OCEL — it is parsed once, stored in Rust heap memory
inside the global `AppState`, and the JavaScript caller receives an opaque
string like `"obj_0"`. That string is the only thing that crosses the boundary.
All subsequent operations — discover a DFG, check conformance, compute variant
entropy — take that handle as input, look up the Rust object directly, operate
on it in place, and return only the result as a compact JSON string. The log
itself never crosses the boundary again.

The `with_object` method in `AppState` captures this pattern precisely: it
borrows a reference to the stored object, executes a closure against it, and
releases the lock. No copy is made. The zero-copy guarantee holds as long as
algorithms operate through that accessor.

The trade-off is that JavaScript has no direct introspection into the objects.
A log stored as `"obj_0"` cannot be inspected with JavaScript object notation.
Its contents are opaque until a query function is called to extract them. This
is unfamiliar to JavaScript developers accustomed to objects being first-class
values, and it requires explicit lifecycle management: handles must be freed with
`delete_object` when no longer needed, otherwise memory accumulates in WASM's
linear address space. The handle system also means that if a JavaScript process
crashes without cleanup, objects persist in WASM memory until the page or
process is reloaded. This is the cost of placing ownership in Rust rather than
in the JavaScript garbage collector.

---

## 3. Columnar Event Log Representation

The canonical event log structure — `EventLog` containing `Vec<Trace>`, each
trace containing `Vec<Event>`, each event containing a `HashMap<String,
AttributeValue>` — is the natural representation for parsing and for
attribute-level access. It mirrors how logs are physically organized in the XES
format. It is not, however, a good representation for the inner loop of
frequency counting.

Consider what DFG construction requires: for every pair of consecutive events
within each trace, increment a counter for the edge `(activity_a, activity_b)`.
With string-keyed events, each iteration must extract the activity name from a
`HashMap`, which involves hashing a string (proportional to string length),
following an indirect pointer, and then hashing the pair of strings to look up
the edge counter in another map. Two heap allocations are needed to construct
the key. A typical event log with 20 unique activities and 5,000 events will
execute this inner loop 4,980 times. Each iteration performs work proportional
to activity name length and hash map load.

The `ColumnarLog` representation eliminates that per-iteration cost. In a single
preprocessing pass, every unique activity string is assigned a `u32` integer
identifier and placed in a vocabulary vector. All trace events are then encoded
as a flat array of `u32` values, with a separate offsets array marking where
each trace begins. The total memory for the encoded events is 4 bytes per event
rather than the 80+ bytes a heap-allocated `(String, String)` pair consumes.

The inner DFG loop now reads sequential 4-byte integers from a flat array —
the most cache-friendly access pattern available. Modern CPUs prefetch sequential
memory accesses automatically. A cache line holds sixteen `u32` values; a string
comparison would have caused a pointer chase off the cache line on every
iteration. The edge counter map uses `(u32, u32)` keys — 8 bytes — rather than
`(String, String)` keys. The hash of a fixed-width integer pair completes in
roughly one CPU instruction; the hash of a string pair is proportional to string
length.

When does this matter? The benefit scales with log size relative to vocabulary
size. A log with 100,000 events and 20 activities gains enormously from columnar
encoding because the savings are multiplied across every event. A log with 50
events and 45 unique activities (nearly every event is distinct) gains less,
because the vocabulary is nearly as large as the log itself and the O(n) scan
time is already trivial. Real-world production process logs overwhelmingly fall
into the first category: large logs, bounded activity vocabularies.

---

## 4. Why Process Mining Algorithms Have Different Trade-offs

A discovered process model is assessed along three axes that are in fundamental
tension with one another: fitness, precision, and simplicity.

Fitness measures how well the model reproduces the behavior in the log. A model
with perfect fitness can replay every trace without introducing deviations. The
extreme case is a model that simply lists every observed trace as an allowed
sequence — it fits perfectly. That same model has terrible precision: it allows
only exactly what was observed and cannot generalize to unseen but plausible
behavior. It is also complex in direct proportion to the number of distinct
traces.

Precision moves in the opposite direction. A model with perfect precision
generates only behavior that appears in the log. But to achieve this, models
must become more restrictive, which tends to reject traces that are valid
process behavior but were not observed in the available sample. Heavily pruned
models can have high precision and poor fitness simultaneously.

Simplicity represents a third constraint: models should be understandable by a
human analyst. A Petri net with forty places and sixty transitions may be
technically correct but practically useless for process improvement work. The
Alpha Miner family and the Inductive Miner both prioritize producing structured,
readable models at the cost of some fitness on noisy logs.

Each optimization approach makes a different commitment within this space.

Heuristic Miner uses dependency measures — statistical ratios of how often A
precedes B relative to B precedes A — to filter out noise before building a
model. It tolerates imperfection in the log and trades some precision for
robustness. It is not globally optimal but is computationally fast and produces
interpretable results.

ILP-based discovery formulates the problem as an integer linear program: find
the smallest set of Petri net places and arcs such that all log traces are
replayable. It optimizes a formal objective function and can achieve guaranteed
optimality within its formulation. The price is computational cost — ILP solvers
are exponential in the worst case — and sensitivity to the quality of the
log-derived constraints passed into the solver.

Genetic algorithms and swarm methods (PSO, ACO) take a different approach
entirely. Rather than optimize a single objective, they maintain a population of
candidate models and evolve them through selection and recombination. They can
explore the fitness-precision-simplicity space rather than being trapped at a
local optimum. They are best suited when the process is complex and no single
greedy or analytic approach finds a satisfying model. The cost is the largest
computational budget of any algorithm family in this system.

The reason no single algorithm dominates is that "best model" has no
context-independent meaning. A compliance analyst who needs to demonstrate that
a process follows a regulatory procedure wants maximum fitness — every observed
trace must be explainable. A process designer who wants to simplify a messy
workflow wants simplicity — the model should expose structural inefficiencies
without drowning in rare exceptions. These goals require different algorithms.

---

## 5. The Streaming Memory Model

Batch process mining — load the entire log, run an algorithm — is the natural
starting point, but it breaks down in two scenarios: logs that are too large to
fit in memory, and systems where events arrive continuously from live processes.

The `StreamingDfgBuilder` is designed for the second scenario, though it handles
both. Its fundamental insight is that DFG construction is a counting problem,
and counting problems do not require storing every individual observation. Once
a trace is complete, only two things need to be preserved: the fact that it
contributed to start and end activity counts, and the sequence of consecutive
pairs it contributed to the edge count table. The actual event sequence can be
discarded.

The streaming model exploits this. While a trace is open — meaning its case has
produced some events but has not yet signaled completion — the system holds a
buffer of integer-encoded activity IDs for that case. When the trace is closed,
the buffer is scanned once with a sliding window of size two: each consecutive
pair increments the edge counter, the first event increments the start-activity
counter, and the last event increments the end-activity counter. The buffer is
then freed. The trace's contribution is now fully captured in the compact count
tables.

"Folding into count tables" is the term for this transition. Before folding,
the data is in an unprocessed form that could support arbitrary analysis.
After folding, it exists only as aggregated counts — it cannot be un-folded.
The system trades analytical flexibility for memory efficiency. A DFG can be
reconstructed from the count tables at any moment as a live snapshot, but
individual trace sequences cannot be recovered after their buffers are freed.

The memory footprint is therefore determined by two terms: the count tables,
which grow as O(A²) where A is the number of unique activities and are bounded
once the vocabulary stabilizes; and the open trace buffers, which are
proportional to the number of concurrently active cases multiplied by their
average event count. In a system where cases are short-lived — a transaction
processing log where cases complete in seconds — the open trace footprint is
tiny. In a system where cases can span months (long-running ERP processes), open
trace buffers grow proportionally, and the memory advantage over batch processing
narrows.

Batch processing is still preferable when the full log is already available and
fits in memory, because it preserves all events for richer analysis. Streaming
is the right choice when memory is the binding constraint or when events arrive
from a live system and results must be queryable before the full log is complete.

---

## 6. The Directly-Follows Graph as a Foundation

Almost every process discovery algorithm in this system either produces a DFG
as its primary output or uses a DFG as an intermediate representation during
construction of a more structured model. This is not an accident of
implementation but a reflection of what the DFG is: the minimal lossless
summary of sequential ordering information that can be computed from an event
log in a single linear scan.

A Directly-Follows Graph contains one node per unique activity and one directed
edge from A to B for every occurrence in the log where event B immediately
follows event A within the same case. Edge weights record how frequently each
transition was observed. Start and end activities record which activities began
and ended cases.

The DFG captures everything that can be determined about process flow purely
from adjacency in traces. This is considerable: it reveals the most common
paths, the bottlenecks, the rare transitions, the typical starting and ending
points. For many operational purposes — a dashboard showing process flow
frequency, a first investigation into where time is spent — the DFG is the
appropriate level of abstraction. It is fast to compute, easy to visualize, and
directly interpretable.

What the DFG does not capture is equally important to understand. It has no
semantics for concurrency. If activities A and B can execute in any order as
parallel branches, the DFG records both A→B and B→A transitions and cannot
distinguish this from a situation where either sequence is valid but they are
alternatives, not parallel. It also has no native representation for loops: a
loop in the DFG looks identical to a repeated sequential pattern. The DFG
cannot distinguish between "A always precedes B" as a mandatory ordering and
"A sometimes precedes B" as a frequent but optional path.

These limitations motivate the more expressive algorithms. The Inductive Miner
addresses concurrency by recursively partitioning the event log into sublogs and
identifying whether activities are sequential, concurrent, or in a loop. Alpha++
uses additional causality conditions beyond raw following frequency to infer
parallel execution. ILP-based discovery explicitly models Petri net semantics,
which have a formal theory of concurrency through token flow. Each of these
algorithms takes the DFG's raw frequency information — or the underlying event
log that produced it — and interprets it through a richer structural lens.

The DFG's role as a foundation is therefore not that it is correct, but that it
is complete in the information-theoretic sense for the data it summarizes and
computationally the cheapest structure to produce. More expressive models
require either additional assumptions about the process, additional computation,
or both. The DFG is the point at which neither additional assumption nor
additional computation has yet been applied.
