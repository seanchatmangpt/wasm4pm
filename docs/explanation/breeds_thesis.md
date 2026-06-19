# A Periodic Table of Mechanized Reasoning

## A thesis on the wasm4pm cognition breeds — what they are, what each provides, and what their union makes possible that nothing else does

---

## Abstract

The wasm4pm cognition layer is a library of **56 breeds**, each a faithful,
deterministic, falsifiable re-implementation of a single foundational result in
the history of mechanized reasoning — from Bellman's dynamic programming (1957)
to van der Aalst's object-centric process mining (2019). Individually, a breed
is an *executable citation*: it reproduces the published number from its source
paper and emits a cryptographic receipt proving it did so. Collectively, the
breeds form something no single algorithm, formalism, or large language model
provides: a **finite basis set over the space of human reasoning paradigms**,
where every element is independently verifiable, every run is byte-reproducible,
and every composition is auditable as a lawful object-centric process.

The central claim of this thesis is that the *combination* — not any breed alone
— delivers a capability that is otherwise unobtainable: **auditable,
falsifiable, composable multi-paradigm reasoning**. An LLM can imitate any of
these reasoning styles but guarantee none. A single formalism (logic,
probability, planning) can guarantee its own results but cannot span the others.
The breed library is the only construction that is simultaneously *complete*
across paradigms, *correct* per paradigm against published ground truth,
*accountable* end to end — and *generative*: the whole basis compiles from one
ontology into any consumer's language, so it can be installed and used, not merely
admired.

---

## 1. What a breed is

A breed is the unit of the library. Formally it is a Rust type implementing the
`CognitionBreed` trait, with three obligations:

```
preconditions(&self, input: &BreedInput) -> Result<(), _>   // admissibility
run(&self, input: &BreedInput) -> Result<BreedOutput, _>    // the algorithm
postconditions(&self, input, output) -> Result<(), _>       // lawful output
```

Every breed consumes a **uniform `BreedInput`** — `intent`, `facts`, `rules`,
`cases`, `candidates`, `goals`, `state` — and produces a **uniform
`BreedOutput`** carrying a `selected` conclusion, a natural-language
`explanation`, derived `facts`, and an append-only `inference_trace` of
`TraceStep`s. The uniform boundary is what makes 56 unrelated algorithms
*composable*: the output of one is admissible input to the next.

But a breed is more than a function. Four properties, enforced by the build and
test gates, distinguish a breed from "code that computes something":

1. **It is paper-grounded.** Each breed ships with a fixture
   (`tests/fixtures/papers/<breed>.json`) carrying the canonical worked example
   from its source paper *and the published numeric answer with provenance*. The
   test does not check that the code "runs" — it asserts the paper's number. The
   MYCIN breed must derive a certainty factor of **0.7** (Shortliffe & Buchanan
   1975, p. 247). The Bayesian-network breed must derive
   **P(Burglary | Alarm) = 0.373551228281836** by exact enumeration over Pearl's
   1988 alarm network. A breed that returns a plausible-but-wrong number is a
   defect, not an approximation.

2. **It is falsifiable.** Grounding alone is insufficient — a test that also
   passes on a *mutated* expectation proves nothing (Popper). Every fixture is
   run through a generic harness,
   `every_paper_fixture_is_confirmed_and_falsifiable`, which **confirms** that
   each published leaf is evidenced in the output *and* **falsifies** a
   deliberately corrupted expectation, requiring it to be rejected. A breed whose
   output cannot tell the right answer from a wrong one is not admitted.

3. **It is deterministic and receipt-bearing.** Identical input yields
   byte-identical `BreedOutput` (the only entropy source permitted is a seeded
   RNG; all collections are ordered `BTreeMap`/`BTreeSet`/sorted `Vec`). Each run
   emits a BLAKE3 receipt — `input_hash`, `output_hash`, `run_id`,
   `replay_pointer` — so any claim about what was computed can be re-derived from
   evidence, not trust.

4. **It is admitted on evidence, not assertion.** A breed reaches
   `PARTIAL_ALIVE` status only where an object-centric event log
   (`ocel/reports/<breed>.json`) records a measured conformance fitness of
   `1.0`. There is no hand-flip path; admission is projected from evidence by a
   CONSTRUCT query. The library cannot lie about its own readiness.

The doctrine behind all four is one sentence: *if the code says it worked but
the event log cannot prove a lawful process happened, then it did not work.* A
breed is the smallest object for which that proof can be carried.

---

## 2. What capabilities the breeds provide

The 56 breeds are not an arbitrary collection. Laid out by the kind of inference
they mechanize, they cover — with striking completeness — the paradigms that
the field of artificial intelligence discovered over seven decades. The families
below are the *capabilities*; the cited breeds are the executable instances.

### 2.1 Deductive and non-monotonic logic — *deriving what must follow*
`prolog` (Kowalski 1974), `situation_calculus` (Reiter 1991),
`event_calculus` (Kowalski & Sergot 1986), `description_logic` (Baader 2003),
`tableaux`, `asp` (Gelfond & Lifschitz 1988), `clp` (Jaffar & Lassez 1987),
`default_logic` (Reiter 1980), `circumscription` (McCarthy 1980).

Capability: sound entailment, and — crucially — **defeasible** entailment.
Default logic and circumscription let the system conclude "birds fly" while
retracting it for penguins. This is reasoning that survives incomplete
knowledge, which classical logic cannot.

### 2.2 Reasoning under uncertainty — *deriving what is probable*
`bayesian_network` (Pearl 1988), `markov_logic`, `problog` (De Raedt 2007),
`dempster_shafer` (Shafer 1976), `fuzzy_logic` (Mamdani 1975),
`mycin`/`production_rules` (Shortliffe & Buchanan 1975), `hearsay` (Erman/Roth),
`pomdp`.

Capability: calibrated belief over hypotheses, fusion of conflicting evidence
(Dempster–Shafer), graded truth (fuzzy), and certainty-factor propagation
(MYCIN). Where logic answers *true/false*, this family answers *how much*.

### 2.3 Planning and sequential decision — *deriving what to do*
`strips` (Fikes & Nilsson 1971), `partial_order_plan` (McAllester & Rosenblitt
1991), `htn_planning` (Nau et al. 2003), `gps` (Newell & Simon),
`contingent_plan`, `mdp` (Bellman 1957), `rl_symbolic` (Watkins & Dayan 1992).

Capability: synthesizing action sequences toward goals (classical planning),
under hierarchy (HTN), under uncertainty and reward (MDP), and learned from
experience (Q-learning). This is the bridge from *knowing* to *acting*.

### 2.4 Induction and abduction — *deriving the rule or the cause*
`version_space` (Mitchell 1982), `ilp` (Muggleton/Quinlan 1990),
`ebl` (Mitchell et al. 1986), `abductive_ibe` (Thagard 1989),
`abductive_lp` (Kakas et al. 1992).

Capability: generalizing rules from examples (induction) and inferring the best
explanation for observations (abduction). This is the only family that runs
inference *backwards* — from data to theory — and it is precisely what pure
deduction and probability cannot do.

### 2.5 Constraint solving and search — *deriving what is consistent*
`csp_ac3` (Mackworth 1977), `sat_cdcl` (Marques-Silva & Sakallah 1999), `clp`.

Capability: finding assignments that satisfy hard constraints, with modern
conflict-driven clause learning. The combinatorial substrate beneath planning,
scheduling, and verification.

### 2.6 Analogy and case-based reasoning — *deriving by similarity*
`analogy_sme` (Falkenhainer, Forbus & Gentner 1989), `cbr` (Aamodt & Plaza 1994).

Capability: structure-mapping between domains (the heat–water analogy) and
retrieve-reuse-revise over past cases. Reasoning that transfers knowledge across
contexts rather than deriving it from axioms.

### 2.7 Knowledge representation and memory — *deriving from structure*
`frames_inheritance` (Minsky 1974), `script_sam` (Schank & Abelson 1977),
`episodic_memory` (Tulving 1983), `autoinstinct_semantics` (Schank 1972).

Capability: default inheritance over frames, stereotyped-sequence inference over
scripts (SAM infers that "John ate" though the text never says so), and
episodic recall. This family supplies the *commonsense scaffolding* the others
operate within.

### 2.8 Qualitative and naive physics — *deriving without numbers*
`naive_physics` (Hayes 1979), `qualitative_reason` (de Kleer & Brown 1984).

Capability: envisioning how physical systems behave using sign algebra rather
than differential equations — predicting that a heated gas expands without ever
measuring a temperature.

### 2.9 Temporal logic and verification — *deriving over time*
`allen_temporal` (Allen 1983), `ltl_monitor` (Havelund & Roşu 2001),
`ctl_check` (Emerson & Clarke / 1986).

Capability: interval relations between events, runtime monitoring of linear-time
properties, and branching-time model checking. The machinery for reasoning about
*processes* — which connects the library back to its home domain.

### 2.10 Belief dynamics and meta-reasoning — *deriving about reasoning*
`belief_merging` (Konieczny & Pino Pérez 2002), `meta_reasoning`.

Capability: reconciling multiple knowledge sources into a coherent whole, and
reasoning about which reasoning strategy to apply. The reflective layer.

### 2.11 Cognitive architectures and historic systems — *integrated minds*
`soar` (Newell 1987), `act_r` (Anderson & Lebiere 1998), `dendral` (Buchanan
1971), `eliza` (Weizenbaum 1966), plus the `autoinstinct_*` lineage
(Sussman 1973; Colby 1971; Winograd 1972).

Capability: whole-architecture cognition — production-rule problem spaces
(Soar), activation-based memory retrieval (ACT-R), and the founding expert and
conversational systems. These are breeds that were themselves *integrations* of
several capabilities above.

### 2.12 Process mining and invention — *the bridge and the frontier*
`ocpm_route_discoverer` (van der Aalst 2019), `triz` (Altshuller 1984),
`morphological` (Zwicky), `construction_grammar`.

Capability: discovering object-centric process models from logs (the native
wasm4pm domain), inventive-principle search (TRIZ), and linguistic structure.
The point where the cognition library meets the process-truth engine that
audits it.

---

## 3. What the combination provides that is otherwise impossible

A reader could acquire any one of these capabilities elsewhere: a Prolog
interpreter, a Bayesian library, a SAT solver, a planner. The thesis is not
about the parts. It is about three properties that emerge **only** from holding
all 56 together under the same four-fold discipline of Section 1.

### 3.1 Completeness: a basis over reasoning, not a pile of tools

The history of AI is, in large part, the discovery that **no single formalism
spans cognition**. Deduction cannot induce a rule from examples. Probability
cannot synthesize a plan. Analogy is not entailment. Qualitative physics throws
away the numbers that Bayesian inference depends on. Each paradigm in Section 2
exists because the others provably cannot do its job.

Assembling all of them as interoperable operators yields, for the first time, a
**spanning set**: any reasoning task can be decomposed into a pipeline of breeds
whose paradigms cover its parts. This is why the title calls it a *periodic
table*. The elements are not interchangeable; they are *complementary*, and the
value is in having the whole table rather than a drawer of one element. A system
that can deduce *and* induce *and* abduce *and* plan *and* score probability
*and* map analogies — each by the canonical algorithm — can address problems
that no mono-paradigm system can even represent.

### 3.2 Correctness you can falsify: an oracle, not an imitation

This is the property that separates the library most sharply from a large
language model. An LLM can produce a Prolog-style derivation, a Bayesian-looking
posterior, a STRIPS-looking plan. It does so by *imitation*, and it offers **no
anchor to ground truth** — the posterior may be off by 0.3 and the text will
look identical. The model is fluent, not faithful.

Every breed inverts this. It is pinned to a *published number* and required to
be *falsifiable*: it must reproduce Pearl's exact posterior (0.373551… for the
alarm network's `P(Burglary | Alarm)`), Mamdani's defuzzified centroid,
Mitchell's version-space boundaries — and it must *fail* when the expectation is
corrupted. The universal anti-cheat gate goes further, forbidding the published
value from appearing as a literal anywhere in the breed's source: the answer
must be **derived by the algorithm**, never looked up. A breed is therefore an
*oracle* in the precise sense — a component you can trust to be right because its
correctness is continuously, adversarially re-proven against the literature.

Holding 56 such oracles together means the spanning set of Section 3.1 is not
just *complete* but *trustworthy element by element*. You get coverage without
sacrificing correctness — a combination that neither the LLM (correctness
without proof) nor the single formalism (proof without coverage) achieves.

### 3.3 Accountability: a lawful, auditable process, not a black box

The third property is the one wasm4pm uniquely contributes. Because every breed
is **deterministic**, emits a **BLAKE3 receipt**, and records its reasoning as an
**object-centric event log (OCEL)**, an entire multi-breed pipeline is itself a
*process* that can be mined and verified by the same machinery wasm4pm applies to
any business process. Under the van der Aalst constitution, one can ask of a
reasoning run: did the declared sequence of cognitive steps actually occur? Were
any skipped, repeated, or run out of lawful order? Does the receipt chain close?
Is the conformance fitness 1.0?

No LLM can answer those questions about its own inference; there is no event log
of attention. A hand-written reasoning system can answer them only if someone
instrumented it. The breed library answers them **by construction**, for every
breed and every composition, because accountability is one of the four
admission obligations rather than an afterthought.

### 3.4 The emergent capability

Put the three together. Composability gives **pipelines** — abduction proposes
hypotheses, a Bayesian network scores them, a planner acts on the most probable,
a temporal monitor verifies the execution, and induction generalizes the outcome
for next time. Completeness guarantees such a pipeline can be *built* for an
arbitrary task. Correctness guarantees each stage is *right* against the
literature. Accountability guarantees the whole chain is *auditable* — every
step receipted, every transition conformant, every conclusion replayable from
its `input_hash`.

That total capability — **assemble any reasoning process from a complete basis of
falsifiable cognitive primitives, and prove afterward exactly which lawful
reasoning occurred** — is what the union of the breeds provides and what nothing
else does. A monolithic model gives fluency without proof. A single solver gives
proof without breadth. Only the periodic table gives breadth, proof, and an audit
trail at once.

### 3.5 Generativity: a basis you can install, not just admire

A periodic table is worth little if it lives in one laboratory. The fourth
property is that the breed basis is **distributable** — not as a binary blob, but
as a *generated surface compiled from the same ontology that admits the breeds*.

The breeds are not, at root, hand-written code. They are RDF instances in an
ontology (`breeds.ttl`); the build doctrine is "the ontology is the specification,
ggen is the compiler, the generated code is first-class source." That doctrine now
extends past this repository: two distributable **ggen packs** — one Rust, one
TypeScript — carry the breed ontology and compile it, in a consumer's own project,
into the full typed surface: the `BreedId` enum/union, a catalog of every breed
with its paper citation, the exact WASM contract types, and a typed client. A
consumer adds the pack to their `ggen.toml`, runs `ggen sync`, and the periodic
table materializes in their language — **with no per-breed hand-coding, and no
dependency on this repository.** Two runnable examples (one per language) prove
the path end to end.

This makes "executable citation" literal at the *consumption* layer too. The same
ontology that earns a breed its admission also generates its bindings, and those
bindings are provably derived rather than transcribed — faithfully enough that
carrying a paper's citation through the pipeline exposed and forced the fix of a
real escaped-quote bug in the code generator itself. The basis set is therefore
not a library you depend on but a *substrate you manufacture*: portable,
regenerable from a single source of truth, and identical in every consumer because
it is compiled, not copied.

Completeness, correctness, and accountability make the periodic table *true*.
Generativity makes it *usable* — anywhere, by anyone, without re-deriving a line.

---

## 4. Why this matters now

The dominant mode of machine reasoning in this decade is the large language
model: broad, fluent, and fundamentally unaccountable. The breeds are the
complementary construction — the part the LLM cannot supply. They do not compete
on fluency; they compete on **faithfulness and auditability**, and they win
there by design. A future system that pairs an LLM's open-ended interface with a
breed library's verifiable, receipted execution gets the best of both: natural
problem statement, and a reasoning core whose every step can be checked against
the literature and replayed from evidence.

The library is, in the end, an argument made in code: that the accumulated
reasoning methods of the field need not be folklore approximated by a model, but
can be preserved as **executable, falsifiable, receipt-bearing citations** — a
periodic table of cognition that a machine can compose, that a human can audit one
lawful step at a time, and that any application can install and generate into its
own language from a single ontology.

---

*Grounding note.* Every breed named above ships a paper fixture asserting its
source's published result and is exercised by both a paper-grounded test and the
`every_paper_fixture_is_confirmed_and_falsifiable` falsification harness. Breed
status, conformance fitness, and receipts are recorded under `ocel/reports/` and
`.wasm4pm/receipts/`. The distributable surface of §3.5 lives in
`packs/wasm4pm-breeds-rust/` and `packs/wasm4pm-breeds-ts/`, with runnable
consumers under `examples/breeds-rust-consumer/` and `examples/breeds-ts-consumer/`.
The claims in this thesis are checkable against that evidence — as the doctrine
requires.
