# The Proof-Carrying Substrate

## A transferable pattern for software that ships its own evidence — abstracted from wasm4pm, instantiated again in wasm4games

---

## Abstract

The three preceding theses argued that the wasm4pm cognition breeds are a
*periodic table* of reasoning, that their performance is *governed*, and that
through the TypeScript lens each is an *honest function* — a call that returns its
own proof. This thesis extracts the part that is not about reasoning at all. The
verification spine underneath those breeds is **domain-neutral**: it applies to
any system whose behaviors can be reduced to bounded, deterministic units that can
be checked against an authority. To demonstrate that the abstraction is real and
not a retrofit, we instantiate it a second time in a completely different domain —
**wasm4games**, a branchless `no_std` game-pattern foundry whose units are not
reasoning algorithms but constant-time integer kernels — and show that the *same
seven obligations* produce *the same kind of trust* over CPU-cycle game logic that
they produce over published AI results.

The claim is that "carrying your own proof" is a *transferable software pattern*,
as reusable as MVC or event-sourcing, and that wasm4pm and wasm4games are two
sightings of it. We state the pattern abstractly, map both instantiations onto it
side by side, render the pattern in the wasm4games voice, and end with the recipe
for applying it to a third project.

---

## 1. The pattern, stated abstractly

A system is **proof-carrying** when it satisfies seven obligations. None of them
mention a domain.

1. **Single source of truth → generation.** The units are not hand-authored. They
   are *projected* from one declarative source (an ontology) by a generator, so the
   code, its types, its registry, and its consumer bindings cannot drift from each
   other. You change the unit by changing the source and regenerating, never by
   editing the output.

2. **Authority equivalence.** Every unit reproduces an *external authority* — a
   value the unit did not invent. The authority might be a published number, a
   reference implementation, a specification, or a mathematically determined result.
   Correctness is "agrees with the authority," not "runs without crashing."

3. **Counterfactual falsification.** Every correctness test is *shown to fail* under
   a deliberate corruption — a tampered expected value, a mutated unit — and only
   then trusted when it passes. A test whose red state has never been witnessed is a
   decoration. Confirmation alone is vacuous; the unit must also *reject* a wrong
   answer.

4. **Determinism → receipt.** Identical input yields byte-identical output, so a
   hash over the output is an *agreement protocol*: two parties who ran the same unit
   compute the same hash. The receipt is the proof of "what I ran is what you ran,"
   and a pinned corpus-wide digest turns any unnoticed change into a build failure.

5. **Governed measurement.** Performance is measured *and the measurement is gated
   by correctness*. A fast wrong unit is worse than a slow right one; the benchmark
   suite refuses to vouch for a unit it has not also proven correct.

6. **Lawful process, object-centric evidence.** Each unit emits evidence of *how* it
   ran — an object-centric event log, a span — and the process (not just the answer)
   is checked for conformance against a declared lawful lifecycle. Negative cases are
   refused, not merely positive cases confirmed.

7. **Evidence-based admission → generated consumer surface.** A unit is promoted to
   "trusted" only on *measured evidence*, never by a hand-flipped flag; and it is
   consumed through a *generated, typed boundary* so the consumer inherits all the
   above transitively, at the cost of a field access.

A system that satisfies all seven does not ask to be trusted. It hands you the
materials to verify it.

---

## 2. Two instantiations, one spine

The point of an abstraction is that distant things fall under it. wasm4pm reasons;
wasm4games computes branchless game state. They share nothing at the domain level —
and everything at the pattern level.

| Obligation | wasm4pm (cognition breeds) | wasm4games (branchless kernels) |
|---|---|---|
| **1 · Generation** | ggen: breed ontology (`breeds.ttl`) → registration, ids, packs, tests | ggen: pattern ontology (`patterns.ttl`) → SPARQL → Tera → Rust kernels |
| **2 · Authority** | the source paper's *published value* (MYCIN CF 0.7; Pearl 0.373551…) | a *reference oracle* — the branchful spec the kernel must equal |
| **3 · Falsification** | confirm the value **and** reject a mutated expectation (`every_paper_fixture_is_confirmed_and_falsifiable`) | three counterfactual mutants (`!ref`, `ref+1`, `ref ^ MASK`) that must **not** equal the oracle |
| **4 · Receipt** | BLAKE3 `output_hash`; identical bytes in Node and headless Chromium (`e91b7e60…`) | FNV receipt chain + a pinned `GOLDEN_CORPUS_DIGEST` over the whole pattern corpus |
| **5 · Governed perf** | 19.1 µs median; the attestation gate fails on any *fast-but-wrong* breed | branchless CC=1, data-independent timing; criterion benches per kernel |
| **6 · Conformance** | OCEL model-vs-log at fitness 1.0; impossible (shuffled) traces rejected | each kernel emits an OCEL event + OTEL span; external wasm4pm admits the evidence; negative fixtures refused |
| **7 · Admission & surface** | `PARTIAL_ALIVE` derived from evidence; consumed via `@wasm4pm/*` TS packs | `VERIFIED_UNDER_SCOPE`; consumed via a C-ABI / engine-bridge surface (UE, Unity, Godot, Bevy) |

Read the table by column and you see two unrelated products. Read it by row and you
see one pattern enforced twice. That is the whole argument: the spine is the
invariant; the domain is the parameter.

---

## 3. The pattern in the wasm4games voice — "the honest kernel"

To a game engine, a wasm4games pattern arrives as something even more unremarkable
than a TypeScript function: a pure integer kernel,
`pub fn damage_applied(state: u64, input: u64) -> u64`, or, across the engine
boundary, a single opcode in a C-ABI dispatch table. No allocation, no branches, no
floats — it looks like a line of arithmetic. Behind it stand the same questions.

**"How do I know it's right?"** The kernel is lowered onto a verified branchless
primitive (`saturating_sub_i64` for HP, `select_u64` for the crit branch), and a
`proptest` harness asserts, across the input space, that the kernel equals a
separate *reference oracle* written in ordinary branchful Rust. The fast,
constant-time implementation must agree with the obvious, readable one — everywhere.

**"How do I know the test isn't lying?"** Three counterfactual mutants of the oracle
— bitwise-NOT, plus-one, XOR-mask — are generated alongside it, and the suite
requires the kernel to **differ** from all three. A kernel that happens to match its
own corruption is rejected. The test has teeth because its failure is constructed,
not hoped for.

**"How do I know it's bounded?"** The kernel has cyclomatic complexity 1 — one shape,
no data-dependent control flow — so its timing is independent of its input. There are
no secret-dependent branches and no worst-case input. The `#[cfg(feature = "bench")]`
module measures it; the branchless contract guarantees it.

**"How do I know what ran is what you ran?"** The corpus of all 70 kernels is folded
into a single pinned `GOLDEN_CORPUS_DIGEST` (`0x2D26_7F72_6A8B_F791`). Change any
kernel's output by a single bit and the digest changes and the build fails. Combined
with deterministic replay frames and the FNV receipt chain, a game's behavior becomes
*replayable and tamper-evident* at the level of individual ticks.

**"How do I know it composes lawfully?"** Every kernel emits an object-centric event
(`DamageApplied`, linked to its `obj_entity`) and an OTEL span; the external wasm4pm
admission engine consumes that evidence, and deliberately impossible fixtures are
*refused* rather than silently accepted. The game does not merely run — it produces a
lawful, mineable event log of itself.

So the honest kernel is the honest function's twin: an `fn(u64, u64) -> u64` that is
also an oracle-equivalence proof, a falsified counterfactual, a constant-time
guarantee, an entry in a pinned corpus digest, and a receipted OCEL event — and the
engine that calls it inherits all of that for the price of an integer return.

---

## 4. A worked example: why you can trust an anti-cheat pattern

Anti-cheat is the hardest case and therefore the right test of the pattern, because a
damage kernel has an obvious oracle and a cheat detector does not. "Is this player
state legal?" has no published number. So the rigor has to come from somewhere — and
it comes from the same obligations, re-aimed.

Take a pattern like `movement_legality_checked(state, input) -> verdict` (or
`rate_budget_enforced`, `state_transition_admitted`). Its job: given a player's prior
state and a claimed input or new state, decide *admit* or *refuse*.

**The authority is a legality specification, not a value.** The reference oracle is the
readable predicate of what is *possible*: position delta ≤ max-speed × dt, HP ≤ cap,
cooldown ≥ 0, action rate ≤ tick budget, coordinates in-bounds. The branchless kernel
must equal that predicate across the input space — the detector agrees, everywhere,
with the definition of legal.

**Falsification is a two-sided corpus, and it is the heart of the trust.** The breed's
"confirm the value *and* reject a mutant" becomes, for anti-cheat:

- a **cheat corpus** of known-impossible states — teleport beyond max speed, HP above
  cap, negative cooldown, out-of-bounds, action rate above the tick budget, an illegal
  state transition — every one of which the detector **must flag**;
- a **legal corpus** of boundary-legal states — *exactly* at max speed, *exactly* at the
  HP cap, the last legal frame of a dash — none of which it may false-flag.

A detector that passes both is one you have *watched* catch every cheat in the corpus
and *watched* clear every legal edge case. The counterfactual mutants then close the
loop: a deliberately **weakened** detector — threshold loosened, a check removed — is
*required to fail* the cheat corpus. A test that a broken anti-cheat could still pass
proves nothing; here, breaking the detector is constructed, and the suite goes red.

**The detector is tamper-evident.** It is pinned into the `GOLDEN_CORPUS_DIGEST`. You
cannot quietly relax a threshold or comment out a check: any change to the detector's
behavior changes the corpus digest and fails the build. The anti-cheat *itself* is
under anti-cheat.

**A ban is replayable, not asserted.** Because the detector is deterministic, a disputed
verdict is reproducible from a receipt: the player's recorded input, fed to the same
kernel, yields the byte-identical verdict hash. The ban is *provable* — "here is the
input and the detector; recompute the verdict yourself" — rather than "trust the
server." Player and operator compute the same hash; the hash is the adjudication.

**It is timing-oblivious and hard to DoS.** Branchless, CC=1, data-independent timing:
no secret-dependent branch whose duration leaks the detection threshold, and no crafted
input that drives the detector into a slow path. Checking a cheat costs what checking a
legal move costs.

**Every verdict is a lawful, mineable event.** Each admit/refuse emits an OCEL event
(`StateAdmitted` / `CheatRefused`) linked to the player object, and the external wasm4pm
admission refuses any detector run whose event log does not conform to the detector's
declared lifecycle — so a detector that emits a verdict out of order, or skips its own
checks, is itself caught by conformance. The anti-cheat produces an audit trail that is
in turn audited.

Put together, "can I trust the anti-cheat?" has a concrete answer that is *not* "yes,
we tested it." It is: **the detector provably equals the legality spec; it has been
witnessed catching every cheat in a corpus and clearing every legal boundary; a
weakened version fails that corpus; it is pinned in a digest so it cannot be silently
changed; every ban replays to an identical hash; and its timing leaks nothing.** That
is the breed standard — published value, falsification, receipt — re-aimed from
"reproduce Pearl's posterior" to "refuse every impossible game state, and prove it."

---

## 5. The transferable recipe — applying it to a third project

The pattern is a checklist. To make any system proof-carrying:

1. **Reduce to bounded, deterministic units.** Find the layer where behavior is a
   pure function of bounded input. For breeds it is `run(input) -> output`; for
   wasm4games it is `kernel(state, input) -> state`. If a behavior cannot be made
   deterministic, isolate the entropy behind a seed.

2. **Name an authority per unit.** Decide what each unit must *agree with* — a paper,
   a reference implementation, a spec, a closed-form result. If there is no authority,
   you have a preference, not a correctness criterion, and the rest does not apply.

3. **Generate, don't author.** Put the units' metadata in one ontology and project the
   code from it. The generator (ggen, here) keeps code, types, registry, and consumer
   bindings in sync by construction.

4. **Write the oracle and its counterfactuals together.** For each unit ship a
   readable reference *and* a few deliberate corruptions, and require the unit to
   match the reference and differ from the corruptions. This is the step most teams
   skip, and it is the one that makes the green bar mean something.

5. **Pin a corpus digest.** Hash the units' canonical behavior into one value and
   commit it. Any unnoticed change to any unit now fails the build.

6. **Gate speed by correctness.** Run the benchmark and the correctness suite together;
   refuse to publish a number for a unit that is not also proven right.

7. **Emit object-centric evidence and admit on it.** Have each unit log how it ran,
   check the process against a lawful lifecycle, refuse the impossible cases, and
   promote a unit to "trusted" only from that measured evidence.

8. **Generate the consumer surface.** Project a typed boundary (TS package, C-ABI,
   WIT component) from the same ontology so consumers inherit the guarantees without
   re-deriving them.

A team that runs this checklist gets, in any domain, what wasm4pm has for reasoning
and wasm4games has for game logic: software whose correctness, performance,
reproducibility, and lawfulness are not claims in a README but artifacts you can
recompute.

---

## 6. Synthesis

The deepest result of the wasm4pm work was never a particular breed or a particular
number. It was the discovery that a verification *spine* — generate from one source,
pin each unit to an authority, falsify the test before trusting it, hash the output
into an agreement, gate speed by correctness, emit lawful evidence, admit on that
evidence, and project a typed surface — is **portable across domains that have
nothing else in common**. A reasoning engine and a branchless game foundry are about
as far apart as two pieces of software get, and the same eight steps make both of
them honest.

That is the thesis: *proof-carrying is a design pattern, not a product feature.* The
substrate does not ask to be trusted. It hands you a hash, an oracle, a falsified
counterfactual, and a lawful event log, and invites you to check. wasm4pm proved it
for cognition; wasm4games proves it again for game behavior; the pattern is waiting
for the next domain that can be reduced to deterministic units measured against an
authority — which is to say, almost any of them.

---

*Grounding note.* The wasm4pm claims in §2–§3 are checkable in this repository:
`ggen/ontology/breeds.ttl`, the `paper_grounded` / `paper_falsification` /
`ocel_conformance` suites, `crates/bench-tools` (and the three prior theses in
`docs/explanation/`), the cognition WASM contract, and the verified Node/browser
hash equality. The **wasm4games** claims (70 branchless kernels across 24 families,
`GOLDEN_CORPUS_DIGEST = 0x2D26_7F72_6A8B_F791`, `VERIFIED_UNDER_SCOPE`, the
oracle/counterfactual battery, the C-ABI portability surface) come from the sibling
**bcinr-workspace** project of the same name and are cited from that work, not
re-executed in this repository — they are presented here as the second instantiation
that demonstrates the pattern's generality, and should be verified in their own repo
under `cargo make ci`. Every claim is checkable against one of those two evidence
bases — as the doctrine requires.
