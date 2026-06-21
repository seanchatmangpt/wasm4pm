# The Honest Function

## Cognition breeds through the TypeScript lens — what you import, and what stands behind it

---

## Abstract

To a TypeScript developer, a cognition breed arrives as something unremarkable: a
typed function you import and call. You pass it facts and rules, you `await` a
result, you read a field. It looks like any other library call. This thesis is
about what that ordinary appearance conceals — that the function you just called
is simultaneously a *published citation*, a *benchmarked operation*, a
*falsifiable claim*, and a *cryptographic receipt*. The same `await` that returns
your answer also returns the evidence that the answer is the one the literature
published, that it was computed and not guessed, that it ran in microseconds, and
that anyone can replay it and get the identical bytes.

The argument proceeds from the surface inward. We start where a TS developer
starts — the import, the types, the call — and then ask, in order, the four
questions any honest engineer asks of a dependency: *How do I know it's right?
How do I know the test isn't lying? How do I know it's fast enough? How do I know
what I ran is what you ran?* Each question is answered not by documentation but by
machinery — paper-grounded tests, falsification, counterfactual teeth, receipted
benchmarks, deterministic hashing, and object-centric conformance — and that
machinery is what turns an ordinary function into an honest one.

---

## 1. The surface: what you actually touch

A TypeScript application never sees Rust. It sees generated, typed surfaces, each
compiled from one ontology and consumed with no per-breed hand-coding.

You install the breed pack and import a total, compile-time-checked roster:

```ts
import { BREED_IDS, type BreedId } from '@wasm4pm/breeds-ts/breed-ids';
import { BREED_CATALOG } from '@wasm4pm/breeds-ts/breed-catalog';
// BREED_CATALOG: { id, label, doc, citation }[] — every breed, with its paper.
```

You import the runtime contract and the typed client:

```ts
import { cognitionRun } from '@wasm4pm/cognition';
import type { BreedInput, ContractResult } from '@wasm4pm/cognition';

const result: ContractResult = await cognitionRun('mycin', {
  intent: 'diagnose bacteremia organism',
  facts: [{ key: 'gram-stain', value: 'gram-positive' }, /* … */],
  rules: [{ id: 'RULE050', premise: ['gram-positive', 'coccus', 'chains'],
            conclusion: 'streptococcus', certainty: 0.7 }],
  // candidates, cases, goals, state …
});
```

`ContractResult` is exactly `{ status: 'ok', breed, run_id, output_hash,
replay_pointer, options_profile, output }` — not `exit_code`, not `decision`, not
a `receipt_chain`. The field contract is enforced by the types because the types
are generated from the same Rust struct that produces them; drift is impossible
by construction.

For the domain types around the breeds — the process-mining structures a real
application validates against — the `wasm4pm-compat-ts` ggen pack renders 49 Zod
schemas (`ConformanceResultSchema`, `ConformanceVerdictSchema`, `BpmnProcessSchema`,
…) from the compat ontology into your monorepo, so your runtime validation and
your static types share a single source of truth. (The pack is consumed via the
monorepo workspace; it is not yet published as a standalone npm package.)

And it runs in the browser. The cognition engine compiles to a `--target web`
WASM module; `initCognitionBrowser({ wasmUrl })` fetches and instantiates it, and
the same `cognitionRun` works client-side. A receipted reasoning call happens in
the page, with no data leaving it.

That is the whole surface. Ergonomically, it is indistinguishable from importing
`lodash`. The rest of this thesis is about why it is not.

---

## 2. "How do I know it's right?" — the test asserts the paper, not the shape

The first thing most libraries get wrong is that their tests check that the code
*ran*, not that it was *correct*. A breed test that asserted
`result.output.breed === 'mycin'` and `explanation.length > 0` would pass forever
while the algorithm returned nonsense.

Every breed is instead pinned to its source paper's *published number*. The MYCIN
breed must derive a certainty factor of **0.7** (Shortliffe & Buchanan 1975,
p. 247). The Bayesian-network breed must derive **P(Burglary | Alarm) =
0.373551228281836** by exact enumeration over Pearl's 1988 alarm network. The test
loads a fixture carrying that published value with its citation, runs the breed,
and asserts the number within tolerance — across all **52 breeds, 52/52 pass**.

The loader refuses to lie by omission. A common failure mode is the *silent skip*:
`if (fs.existsSync(fixture))` quietly turns a missing fixture into a green test. The
harness instead `panic!`s on a missing or unparseable fixture — a paper-grounded
test that cannot find its evidence fails loudly rather than passing vacuously.

So the answer to "is it right" is not "the docs say so." It is: *the build will
not go green unless the breed reproduces the value the literature published.* The
TypeScript developer inherits that guarantee transitively — the typed function
they import is one the build has already forced to agree with Pearl, Mycin, and
Mitchell.

---

## 3. "How do I know the test isn't lying?" — counterfactuals and falsification

A passing test proves nothing if it cannot fail. This is the deepest layer, and
the one that separates wishful testing from honest testing.

**Counterfactual teeth.** For every paper-grounded assertion, the discipline is to
*tamper and confirm failure*: temporarily corrupt the computation or the expected
value, watch the test go red, then restore it. When the Bayesian fixture's
expected posterior was changed from `0.373551…` to `0.5`, the test failed with
"must equal Pearl 1988 §4.1 value 0.5; got 0.37355123" — proving the assertion has
teeth. A test whose red state has never been observed is a decoration; a test
whose failure has been *induced and witnessed* is evidence.

**Falsification (Popper).** Confirmation is not enough — an assertion that also
accepts a *wrong* answer is vacuous. So beyond confirming the published value,
every fixture is run through a harness,
`every_paper_fixture_is_confirmed_and_falsifiable`, that requires two things at
once: each published expectation must be *evidenced* in the output, **and** a
deliberately mutated expectation must be *rejected*. A breed whose output cannot
distinguish the right answer from a corrupted one is not admitted.

This extends past the breeds to the process logs they emit. The OCEL conformance
gate injects an *impossible* trace — a shuffled event sequence that violates the
declared lifecycle — and requires the breed to reject it. Van der Aalst's negative
testing, made executable: it is not enough to confirm lawful processes; the system
must refuse unlawful ones.

The honest position is therefore stronger than "our tests pass." It is: *our tests
have been shown to fail when the algorithm is wrong, when the expected value is
wrong, and when the process is impossible — and only then do they pass.*

---

## 4. "How do I know it's fast enough?" — receipted benchmarks and the fast-but-wrong guard

A correct answer that takes a second is useless inside a 16 ms frame. So the breeds
are measured, and the measurement is itself governed.

Across 52 benchmarked breeds the median `run()` completes in **19.1 µs** and the
mean in 45.7 µs; the overwhelming majority finish under 100 µs. Latency is reported normalized to a
fixed *calibration anchor* (~17.8 µs on the reference host), so the numbers are
machine-independent — a budget like "no slower than 15× calibration" holds on any
runner.

The Fortune-grade move is that **speed is gated by correctness**. For a reasoning
engine, a fast wrong answer is worse than a slow right one — yet a latency
benchmark alone would silently bless it. The attestation gate joins the two: it
runs the paper-grounded and falsification suites, joins each breed's correctness
with its latency, and **fails on any breed that is fast but not provably correct**.
Of the benchmarked breeds, **52 are TRUSTED** (correct *and* fast); zero are
fast-but-wrong. The benchmark suite refuses to vouch for code it has not also
proven right.

For the TypeScript developer this is not an external report — it is the model under
their call. `cognitionRun('mycin', …)` returns in microseconds because the breed
behind it is one the attestation gate has certified as trusted, not merely quick.

---

## 5. "How do I know what I ran is what you ran?" — determinism and the receipt

The final question is reproducibility, and here the `ContractResult` stops being a
return value and becomes a proof.

Every breed is deterministic: identical input yields byte-identical output. The
only entropy source permitted is a seeded RNG; every collection is an ordered
`BTreeMap`/`BTreeSet`. On that foundation the run emits a **BLAKE3 receipt** —
`output_hash` over the canonical output, `run_id` binding breed and output,
`replay_pointer` as the first 16 hex of the hash. Two parties who run the same
breed on the same input compute the same `output_hash`. The hash *is* the
agreement.

This was demonstrated, not asserted: the browser dashboard runs MYCIN client-side
in headless Chromium and produces `output_hash = e91b7e60…`, **byte-for-byte
identical to the Node execution of the same breed**. The same deterministic WASM,
in two runtimes, agreed on the hash. A reasoning result you can replay from its
`input_hash` and compare by `output_hash` is the difference between "the function
told me" and "I can prove what the function did."

So the `await` returns more than an answer. It returns a `run_id` you can cite, an
`output_hash` anyone can recompute, and a `replay_pointer` into a receipt ledger.
The result is self-authenticating.

---

## 6. Lawfulness at the boundary, and reasoning that searches itself

Two further layers complete the picture, both visible from TypeScript.

**Conformance.** Each breed declares an object-centric lifecycle (an OCPN model);
each execution emits an OCEL event log; the two are checked for conformance at
fitness 1.0, and an admission gate refuses to mark a breed live on anything less.
The `wasm4pm-compat-ts`-rendered `ConformanceResultSchema` and `ConformanceVerdictSchema`
are exactly the TypeScript shapes of that verdict — the lawfulness check is a
first-class value your application can read, not a hidden internal.

**Self-optimizing pipelines.** Because every run is correctness-attested,
benchmarked, and receipted, an evolutionary search can compose *pipelines* of
breeds and discovery algorithms, score each candidate on a quality-versus-cost
Pareto front, receipt every candidate so the search itself is auditable, and emit
the winner as a `wasm4pm.toml`. Configuration becomes the *proven artifact of
optimization* rather than a hand-tuned guess — and the search is honest because
each point on its frontier carries a receipt.

---

## 7. Synthesis: the honest function

Return to the opening call:

```ts
const result = await cognitionRun('mycin', input);
```

By the time this resolves, the following are all true, and all checkable:

- `result.breed` names an algorithm that **reproduces its source paper's published
  value** — or the build that shipped it would have failed (§2).
- That correctness claim is **falsifiable**: it has been shown to fail under a
  tampered computation, a tampered expectation, and an impossible process — and only
  then to pass (§3).
- The call returned in **microseconds**, from a breed the attestation gate
  certified as *trusted, not merely fast* (§4).
- `result.output_hash` is a **BLAKE3 receipt** anyone can recompute; the same input
  yields the same bytes in Node and in a browser (§5).
- The breed's execution **conformed to its declared lawful lifecycle** at fitness
  1.0, and that verdict is a typed value you can read (§6).

This is the thesis in one sentence: *through the TypeScript lens, a cognition breed
is an ordinary-looking function that is also a citation, a falsifiable claim, a
receipted benchmark, and a lawful process — and the same `await` that returns the
answer returns the proof.*

A large language model can produce a plausible MYCIN-like certainty factor in
microseconds and be silently, confidently wrong. The breed cannot: it must derive
the published number, survive its own falsification, beat its budget, and hand you
a hash. The TypeScript developer does not have to trust the library. They can
verify it — and the cost of verification is a field access on a value they already
have.

---

*Grounding note.* The surfaces in §1 are `packs/wasm4pm-breeds-ts`,
`packs/wasm4pm-compat-ts` (ggen pack, workspace-only), `@wasm4pm/cognition` (with `/browser`), and the runnable
`examples/` (`breeds-ts-consumer`, `web-dashboard`). The correctness claims (§2–§3)
are the `paper_grounded` and `paper_falsification` suites and the `ocel_conformance`
gate. The benchmark and attestation claims (§4) are `crates/bench-tools` and
`docs/explanation/benchmarks_thesis.md`. The receipt and determinism claims (§5)
are the cognition WASM contract and the verified browser/Node hash equality. The
pipeline search (§6) is `@wasm4pm/autopm`. Every claim in this thesis is checkable
against that evidence — as the doctrine requires.
