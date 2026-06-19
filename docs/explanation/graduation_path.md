# The wasm4pm Graduation Path — a Jobs-To-Be-Done ladder

## A thesis on how a TypeScript application grows into wasm4pm — what each rung's job is, what you install, whether you need WASM, and the trigger that pushes you to the next rung

---

## Abstract

wasm4pm is large enough that "how do I start using it" has no single answer — the
right answer depends on the job you are trying to get done. This document frames
the platform as a **five-rung ladder**, where each rung is a self-contained
Job-To-Be-Done: a capability you can adopt on its own, with its own install
footprint, its own dependence (or not) on the WASM core, and a concrete
**trigger** — an observable change in what your application needs — that tells you
when it is time to climb to the next rung.

The ladder is not a marketing funnel. It is a description of how the dependency
graph actually layers: contracts and typed shapes at the bottom, an in-app
reasoning engine above them, the process-mining core above that, an optimization
layer that chooses how to run the core, and a governance layer that pins the whole
thing into a reproducible, provenance-tracked configuration. You climb only when a
real trigger appears. Climbing before the trigger buys complexity you are not yet
using; ignoring the trigger past it means doing by hand what the next rung
automates.

One correction belongs at the top, before the ladder, because it is the single
most common wrong turn.

---

## The compat nuance: you consume its projection, not its crate

`wasm4pm-compat` is **rlib-only Rust**. It carries the typestate `Evidence<>`
system — the compile-time machinery that makes an unproven claim *unrepresentable*
in Rust's type system, so that an evidence object can only be constructed by passing
through the lawful stages that earn it. That is a Rust generics-and-phantom-types
feature, and it **does not cross the WASM boundary**. You never depend on the compat
*Rust crate* from TypeScript, and it is crates.io-only — never add a path dependency
on it from this repo.

But compat is more than that crate. It is the **post-handcoding substrate** — an
ontology from which "type law renders everything": Rust, Zod/TypeScript, WIT, and
docs are all projected from one source of truth. So while you do not consume compat's
*crate*, you do consume its **generated Zod projection** — 49 domain schemas (BPMN,
Petri nets, conformance results and verdicts, diagnostics, …) rendered from compat's
ontology via `ggen/{queries/extract-zod-schemas.rq, templates/zod-schemas.ts.tera,
ggen_zod.toml}`. That projection is typed *and runtime-validatable* TypeScript, and
it sits alongside the breed pack at rung 1 (below).

The practical consequence: **a TypeScript application starts from the generated
projections, not the Rust crates.** It starts from the packages under `packages/`,
the generated breed pack under `packs/wasm4pm-breeds-ts/`, and the generated compat
domain schemas (`@wasm4pm/compat-ts`). Everything below describes that TypeScript
entry, which is where the overwhelming majority of consumers live. The typestate
evidence story is real and valuable, but it is a Rust-internal correctness mechanism
that does not itself appear as a rung — its *shapes*, however, do.

**Forward pointer (in progress).** Today the compat projection you consume from TS
is *static shape* — Zod schemas that validate data, not compat's conformance and law
*logic*. A **WIT → WASM-component** path is in progress: compiling compat through a
WIT interface into a WASM component would make its actual conformance/law logic
callable from TypeScript at runtime, beyond the static Zod shapes — closing the last
gap between "I can validate a compat-shaped value" and "I can run compat's lawful
reasoning over it." That is a fourth projection (Rust, Zod/TS, WIT, docs) from the
one ontology, and it is not yet shipped.

With that out of the way, the ladder.

---

## Rung 1 — Contracts: *describe and validate*

**The job.** You have facts, hashes, or breed references that you want to *name
precisely and verify*, without running any algorithm. You want the typed breed
ids and the breed catalog so your code refers to MYCIN or the Bayesian network by
a compiler-checked identifier rather than a string literal, and you want to
confirm that a receipt you were handed is internally consistent — that its hashes
match its payload and it has not been tampered with.

**What you install.** `@wasm4pm/contracts`, the `wasm4pm-breeds-ts` pack, and
`@wasm4pm/compat-ts`. The contracts package exports the receipt machinery —
`ReceiptBuilder`, the receipt emit/verify functions, `verifyReceipt`,
`verifyReceiptHashes`, `detectTampering` — and the hashing primitives (`hashData`,
`hashJsonString`, `verifyHash`). The breeds pack, generated from the same
`breeds.ttl` ontology that admits the breeds in the Rust core, gives you the
`BreedId` union and a catalog of every breed with its paper citation.

`@wasm4pm/compat-ts` is the **typed and runtime-validatable domain layer**, sitting
alongside the breeds pack — both generated from `wasm4pm-compat`'s ontology as the
single source of truth. It carries the 49 domain **Zod** schemas projected from
compat: `BpmnProcessSchema`, `PetriNet`/`ArcSchema`, `ConformanceResultSchema`,
`ConformanceVerdictSchema`, `CompatDiagnosticSchema`, and the rest. Because they are
Zod, not bare `.d.ts`, they do not merely *type* a value at compile time — they
*validate it at runtime*: a conformance result or a diagnostic crossing your I/O
boundary can be `.parse()`d and rejected if it does not conform. This is the same
projection pattern as the breed pack — generated TypeScript, not a Rust dependency.
All pure TypeScript.

**WASM needed?** No. This rung is shapes, verification, and runtime schema
validation only. Nothing here computes a discovery model or runs an inference; it
describes, checks, and validates. That is exactly why it is the floor — the
lowest-commitment way to make your application *speak wasm4pm's vocabulary*, *trust a
receipt*, and *validate domain payloads* without pulling in a binary.

**Trigger to climb.** You stop wanting to merely *name* a breed and *check* a
receipt, and start wanting to **run** a breed — to get a conclusion out of facts,
not just a typed reference to the breed that would produce one. The moment your
code wants inference rather than shapes, you are at rung 2.

---

## Rung 2 — Reason: *run breeds in-app*

**The job.** You have facts and rules — or a small Bayesian network, or a planning
problem — and you want an *answer*, computed by the canonical algorithm, in your
application, with a receipt proving what was computed. You want to run MYCIN's
certainty-factor propagation, or exact Bayesian enumeration, or a STRIPS plan, and
get back a `BreedOutput` plus a BLAKE3 receipt (`input_hash`, `output_hash`,
`run_id`, `replay_pointer`).

**What you install.** `@wasm4pm/cognition`, and specifically its `/browser` entry
(`@wasm4pm/cognition/browser`) when you are running in a browser context. This is
the package that wraps the cognition WASM and exposes the contract surface:
`cognition_run` takes `{ breed, contract, options? }` and returns a
`ContractResult` (`{ status, breed, run_id, output_hash, replay_pointer,
options_profile, output }`); `cognition_verify` returns findings; `system_build`
returns a Pareto front. The breed ids you reference here are the same ones the
rung-1 pack already taught your code to name.

**WASM needed?** Yes — the **cognition WASM**. This rung is where a binary first
enters. The cognition core is built with `wasm-pack` and loaded through the
package's loader; you `await init()` before the first call, and you must never
mock `init.js` in tests (FM-5). The reasoning is real, deterministic, and
receipted — not a TypeScript re-implementation.

**Trigger to climb.** Your job shifts from *"reason about facts I give it"* to
*"mine a process out of a log I have."* As long as you are feeding the system
structured facts and rules, cognition is the right engine. The moment your input
becomes an **event log** — a sequence of activities with timestamps and case ids —
and your question becomes *"what process produced this?"*, breeds are no longer the
tool. You need discovery, conformance, and OCEL. That is rung 3, and it is **the
graduation** the rest of this ladder is named for.

---

## Rung 3 — Mine: *discover a process from a log*

**The job.** You have an event log and you want the things process mining exists
to give you: a **discovered model** (a Petri net, process tree, DFG, or DECLARE
constraint set), a **conformance** measurement of how well a model fits the log,
**object-centric** (OCEL) handling for logs with multiple interacting object
types, and **drift** detection over time. This is the native wasm4pm domain — the
process-truth engine the cognition layer is itself audited by.

**What you install.** The wasm4pm core, in its web or node form. This is the
compiled Rust/WASM library of discovery and conformance algorithms — the same core
the `wpm` CLI ships on top of. Your input is now a log, not a fact base, and your
output is a process model with measured fitness.

**WASM needed?** Yes — the **core WASM**. This is a different and larger binary
than cognition's; it carries the discovery algorithms (Alpha++, the inductive
miner, heuristic miner, the DFG family, and the search-based miners) and the
conformance machinery.

**Trigger (THE graduation).** This rung *is* the trigger fired from rung 2: the
input type changed from facts to a log, and the question changed from "what
follows from these facts?" to "what process is hidden in this log?" Once you are
here, a new problem appears almost immediately — and it is the trigger to rung 4.
With a real log in hand you discover there is **no single best algorithm**. The
DFG miner is `O(n)` and scales past 100k events but produces a coarse model; the
genetic-algorithm miner reaches higher quality but is exponential and does not
scale; the inductive miner sits in between. The right choice depends on *your*
log's size, noise, and what output type you need. When manually choosing an
algorithm for each log stops scaling, climb to rung 4.

---

## Rung 4 — Optimize: *let the platform choose how to mine*

**The job.** You no longer want to pick an algorithm and its parameters by hand for
every log. You want the platform to answer *"which algorithm, which configuration,
which pipeline is best for MY log?"* — first as a **recommendation**, then as an
automated **search** over the option space, grounded in measured fitness and cost
on your actual data rather than folklore.

**What you install.** `@wasm4pm/planner`, `@wasm4pm/ml`, and `@wasm4pm/autopm`.

The planner is the search space made explicit. `ALGORITHM_PROFILES` (in the
planner's `explain.ts`) is the catalog of discovery algorithms, each annotated
with a `speedTier` (1–80, lower is faster), a `qualityTier` (0–100, higher is
better), a complexity class, and the booleans `scalesWell` (handles 100k+ events)
and `robustToNoise`, plus the `outputType` it produces. So the DFG miner is
`{ speedTier: 5, qualityTier: 30, scalesWell: true, ... }` and the
genetic-algorithm miner is `{ speedTier: 75, qualityTier: 80, scalesWell: false,
... }` — the trade-offs you discovered by hand at rung 3, now machine-readable.
`planMultiAlgorithm` produces a `MultiAlgorithmPlan` of ranked candidates, and the
package's `benchmark-costs` module turns a log profile into grounded fitness and
cost estimates. `explainStructured` and `checkCostModelDrift` round out the
"explain why this recommendation" surface.

`@wasm4pm/ml` supplies the learned models behind recommendation, and
`@wasm4pm/autopm` supplies the search itself — a deterministic evolutionary engine
(NSGA-II over pipeline genomes) that turns "recommend one algorithm" into "search
the space of pipelines for the Pareto-optimal ones on this log."

**WASM needed?** The planner's reasoning about the search space is pure TypeScript
— it reasons over `ALGORITHM_PROFILES` and log profiles. But any *measured* fitness
or cost that grounds the recommendation comes from actually running the core WASM
of rung 3. In practice rung 4 sits on top of rung 3: it decides *how* to invoke the
core.

**Trigger to climb.** Optimization gives you a *good run* — but a good run you
discovered ad hoc is not yet a *governed* run. The moment you need the **same proven
pipeline reproduced across environments** — your laptop, CI, a teammate's machine,
production — with provenance you can point to, manual optimization-per-environment
stops being acceptable. You need the winning configuration pinned, validated, and
replayable. That is rung 5.

---

## Rung 5 — Govern: *pin a reproducible, provenance-tracked run*

**The job.** You want one canonical description of *how a run is performed* — its
source, algorithm, parameters, sinks, observability, prediction settings — that is
reproducible, validated against a schema, resolvable from layered overrides, and
presettable so the same proven pipeline runs identically everywhere.

**What you install.** `wasm4pm.toml` as the artifact, `@wasm4pm/config` as the
machinery, and the receipt ledger as the evidence trail. The config package parses
the TOML (via the `toml` npm library) and validates it against the Zod
`configSchema` — the root schema composing `sourceConfigSchema`,
`algorithmConfigSchema` (whose `algorithm.name` must be one of the registered
`ALGORITHM_IDS`), the execution, observability, sink, output, and prediction
sub-schemas. Resolution is layered with a fixed precedence — **cli > toml > env >
default** — so a run can be pinned in the file, overridden per-environment by an
`WASM4PM_*` env var, and overridden again per-invocation on the command line,
always deterministically. Every run emits a receipt into the ledger, so the
configuration that produced a result is recoverable from evidence, not memory.

**WASM needed?** No, for the config layer itself — it parses, validates, and
resolves. The pipeline it governs runs the core (rung 3) and possibly cognition
(rung 2), so those binaries are present transitively, but governance is pure
TypeScript config law.

**Trigger to climb.** There is no rung 6. Rung 5 is where the ladder terminates:
once your pipeline is a validated, layered, receipted, reproducible artifact, you
have what process mining in production actually requires. Further work is breadth
(more logs, more environments, more domains), not a new rung.

---

## Where AutoPM fits

The seam between rung 4 and rung 5 is the most interesting part of the ladder, and
it is where the platform is actively moving.

**Today**, you hand-write `wasm4pm.toml`. You run the planner, read its
recommendation, exercise the core on your log, look at the fitness and cost, decide
on an algorithm and parameters, and *transcribe that decision* into the TOML by
hand. The config is an input you author. Governance (rung 5) then makes that
hand-authored config reproducible — but it cannot make it *optimal*, because a
human chose it.

**AutoPM closes that loop.** It is rung 4's search engine
(`@wasm4pm/autopm`, the deterministic NSGA-II over pipeline genomes) made to emit
its winner *as the configuration itself*. Instead of a human reading a
recommendation and typing a TOML file, the evolutionary search runs over the option
space on your actual log, and the Pareto-optimal pipeline it finds **is** the
`wasm4pm.toml` — receipted, so the search that produced it is replayable, and
schema-valid, so rung 5 governs it the moment it lands. This is the inversion the
ladder is converging on: **config as the result of optimization, not its input.**
The hand-written file is a way station; the destination is a config that is the
audited artifact of a search. When this lands, it lives under `packages/autopm`.

---

## What's real today vs. in progress

Honest accounting matters more here than anywhere, because the ladder describes a
platform that is partly shipped and partly converging.

**Real today.**
- Rung 1 is fully real for contracts: `@wasm4pm/contracts` exports `ReceiptBuilder`,
  the receipt emit/verify functions, `verifyReceipt`, `verifyReceiptHashes`,
  `detectTampering`, and the hash primitives; the `wasm4pm-breeds-ts` pack carries
  the generated `BreedId` surface and breed catalog. The compat Zod projection is
  **generated but not yet packaged**: the 49 schemas exist at
  `wasm4pm-compat/wasm4pm-compat-ts/bindings/zod_schemas.ts`, but that directory has
  no `package.json` — it is an orphan today, exactly as the breed bindings were
  before they were packaged as `packs/wasm4pm-breeds-ts`. Packaging it as
  `@wasm4pm/compat-ts` (mirroring that pattern) is the work that makes this part of
  rung 1 consumable.
- Rung 2 is real: `@wasm4pm/cognition` (and `/browser`) runs breeds against the
  cognition WASM and returns `ContractResult` with receipts; the field contract is
  pinned in `.claude/rules/cognition-contracts.md`.
- Rung 3 is real: the wasm4pm core performs discovery, conformance, OCEL handling,
  and drift; it is what `wpm` is built on.
- Rung 4 is **partly real**: `@wasm4pm/planner` is real and exports
  `ALGORITHM_PROFILES`, `planMultiAlgorithm`, `explainStructured`, the
  benchmark-cost grounding, and `checkCostModelDrift`. `@wasm4pm/ml` and
  `@wasm4pm/autopm` exist as packages.
- Rung 5 is real for config law: `@wasm4pm/config` parses and validates
  `wasm4pm.toml` against `configSchema`, enforces `ALGORITHM_IDS`, and resolves the
  `cli > toml > env > default` precedence; the receipt ledger records runs.

**In progress.**
- Packaging the compat Zod projection as `@wasm4pm/compat-ts` so rung 1's domain
  layer is installable, not an orphan file (see above).
- The compat WIT → WASM-component path that would make compat's conformance/law
  *logic* callable from TS at runtime, beyond the static Zod shapes.
- AutoPM's config-as-artifact inversion (the rung-4→5 loop described above) is the
  active frontier. The engine exists; the path that makes its evolutionary winner
  *emit a governed `wasm4pm.toml`* is being implemented under `packages/autopm`.
  Until it lands, the rung-4-to-rung-5 transition is a human transcription step,
  not an automated one.

---

*Grounding note.* The package boundaries described here are checkable against the
repository. Rung 1: `packages/contracts/src/`, `packs/wasm4pm-breeds-ts/`, and the
compat Zod projection at `wasm4pm-compat/wasm4pm-compat-ts/bindings/zod_schemas.ts`
(891 lines, 49 schemas), rendered from compat's ontology via
`wasm4pm-compat/ggen/{queries/extract-zod-schemas.rq, templates/zod-schemas.ts.tera,
ggen_zod.toml}` — generated today, awaiting a `package.json` to become
`@wasm4pm/compat-ts`. Rung
2: `packages/cognition/` (the `./browser` export is declared in its
`package.json`); the field contract is `.claude/rules/cognition-contracts.md`. Rung
3: the wasm4pm WASM core under `wasm4pm/` and the `wpm` CLI at `apps/wasm4pm/`. Rung
4: `packages/planner/src/explain.ts` (`ALGORITHM_PROFILES`),
`packages/planner/src/multi-algorithm.ts` (`planMultiAlgorithm`),
`packages/planner/src/benchmark-costs.ts`, `packages/ml/`, and `packages/autopm/`.
Rung 5: `packages/config/src/schema.ts` (`configSchema`, `sourceConfigSchema`,
`ALGORITHM_IDS`), `packages/config/src/resolver.ts` for precedence, and the
`wasm4pm.toml` it validates. The compat nuance is checkable too: the
`wasm4pm-compat` *crate* is rlib-only with no path dependency permitted from this
repo, while its *generated Zod projection* exists at the path above — you consume the
projection, never the crate. As elsewhere in wasm4pm, the claims in this
document are meant to be verified against that evidence, not taken on trust.
