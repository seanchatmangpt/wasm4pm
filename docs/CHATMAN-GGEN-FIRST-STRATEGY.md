# Chatman ggen-First Strategy

**Date:** 2026-07-30
**Status:** Strategy. Nothing here is built yet.
**Audience:** the system owner. Written to be read without knowing Rust or Lean.

---

## 1. The thesis

You cannot read Rust or Lean. Your system is 250,000 lines of Rust.

That means hand-written code is permanently unauditable **by you**. You can't catch a mistake by
reading it. You can't verify a claim about it. You can only trust it.

There is one surface you *can* read: the ontology. TTL, TOML, SPARQL, mathematics, English.

So the ontology has to be the source of truth — not because it's elegant, but because it is the
only place you hold authority over your own system. Everything mechanical gets projected from it.
Only mathematics gets written by hand.

---

## 2. What the audit found

Thirteen repositories were read in one pass. One finding explains most of the others.

**Six or more separate ontologies describe one domain, and none of them talk to each other.**

Each repo declares its own vocabulary and projects code from its own graph. No repo projects from
another repo's graph. The consequence is mechanical: the same facts get written down five times,
and the same machinery gets built four times.

It has already drifted. wasm4pm says there are **60** algorithms. mfact says **65**. The thesis
document says 65 while citing the file that says 60.

Stated compactly: **the ecosystem is maximal inside each repo and minimal between them.** Every
repo squeezes full value out of its own declarations. No repo reuses anyone else's.

---

## 3. The line between "generated" and "written by hand"

You already have the answer, documented in `clap-noun-verb`. It splits a program into three
layers, defined by what each one is *forbidden* to touch:

| Layer | What it does | What it may not touch |
|---|---|---|
| **CLI** | reads arguments, validates, binds | — |
| **Integration** | files, network, external services | — |
| **Domain** | pure logic | no files, no network, no CLI, no dependencies |

The domain layer is the mathematics. It is the part you could describe on paper.

Three separate questions land on exactly the same line:

- **What can be generated?** The CLI and integration layers. They're plumbing.
- **What can be declared as mathematics in the ontology?** The domain layer — it has no I/O to
  describe.
- **What can be proven?** Also the domain layer, for the same reason.

That coincidence is the strategy. Adopt this boundary instead of inventing one.

---

## 4. The honest ceiling: about 5%

`praxis` is the most mature ggen project in the ecosystem — 41 packs, a live receipt chain, years
of use. It generates roughly **1,900 lines out of 37,000**. About 5%. And it never generates
logic — only registries, name lists, and constants.

So "offload as much code writing as possible" has a real ceiling, and your own best example puts
it near 5–10%. This strategy will not promise more.

**That 5% is still the whole win**, because it is precisely where every problem found in this
audit lives:

- **31 separate implementations of 8 metrics.** Twelve different versions of "fitness" alone.
- **The 60-vs-65 disagreement** about how many algorithms exist.
- **11 hand-typed checksums** that pin files in another repo. Two of them broke during this
  session, the moment a file was legitimately regenerated.
- **Five competing code generators**, four of them dead or disconnected.

None of that is a hard problem. All of it is the same easy problem written down many times.
Generating it eliminates the entire category.

---

## 5. What gets projected, what gets declared, what stays by hand

**Tier 1 — projected. You never write these.**
Algorithm registries. Command-line commands and their arguments. Shell completions. TypeScript
contracts. Identifier maps. Observability span names. Feature switches. Reference documentation.
Anti-cheat tests. Correspondence harnesses.

Evidence this works: the browser-facing wrappers in wasm4pm are mechanical — a loader, a result,
a summary, and logging, all of which follow from the algorithm's name. The span names are
literally the algorithm's name with a prefix. `clap-noun-verb` already generates every command
from one template.

**Tier 2 — declared as mathematics, then projected.**
The metrics. This is the tier that matters most for you specifically, because a formula is
something you can read and check:

> fitness = ½ × (1 − missing ÷ consumed) + ½ × (1 − remaining ÷ produced)

You can audit that line. You cannot audit the code that computes it. Declaring the formula once,
in the ontology, and generating the code from it is what collapses twelve implementations into
one.

**Tier 3 — written by hand, owned in exactly one place.**
About 36 genuine algorithms. These stay hand-written. The ontology declares what they are, what
goes in, what comes out, and which paper they come from — but a person writes the body.

**One precondition before Tier 3 can be touched:** the algorithms currently return 24 different
shapes of result, and two of them smuggle values out through side channels. That has to be
normalized to about five clean shapes first, or nothing downstream can be typed.

**Explicitly rejected:** putting algorithm bodies into the ontology as blocks of text. It would
still be Rust you can't read. No gain, real cost.

---

## 6. The unblock

Your generator is dead. It fails immediately and produces nothing.

There is one cause. It tries to load its database queries **from a package**, and loading queries
from a package was never implemented in ggen — deliberately, with no plan to add it.

Two other repos in your ecosystem run the same generator successfully. The only difference: they
load their queries **from files**.

So the fix is one category of change, in one configuration file. **Nothing in ggen needs to
change, and nothing needs to wait for anyone.**

Related: six ready-made templates for exactly this purpose already exist in your repo, complete,
connected to nothing. They generate the algorithm registry, the TypeScript contracts, the
identifier map, the reference documentation, and the anti-cheat tests. They have never been
switched on.

---

## 7. Determinations, one line each

**Build the new work on these:**

- **ggen** — fixed and unmodifiable. It is already self-hosting, and it ships a working example
  built *for* wasm4pm plus five ready packages. Copy that shape.
- **praxis** — the reference layout. Copy its directory structure, its configuration shape, and
  its separation of derived facts from asserted facts.
- **clap-noun-verb** — adopt the package outright for commands. It is published, it works, and
  its whole purpose is generating command-line interfaces from an ontology.

**Take one specific thing from each of these:**

- **bcinr** — the strongest complete example in the ecosystem. Take its two-layer validation
  split, and its habit of generating *tests*, not just code.
- **mfw** — take its receipt discipline: every generated run records which tool version, which
  ontology, and which templates produced it, and a *separate* program re-checks the result.
- **ferroplan** — take its ontology-to-artifact loop and its drift check. Also consider using it
  as your planner rather than writing one.
- **cargo-cicd** — take one idea only: produce evidence locally, let something else judge it.
  Reject the rest; its own gate layer is its least finished part.

**Respect as dependencies, carefully:**

- **wasm4pm-compat** — keep the vocabulary, the law, and the anti-cheat here. Their power comes
  from living in a *different repository*, so weakening a check requires a commit somewhere else.
  Moving them destroys the mechanism. Also: breaking this repo breaks mfw's build.
- **bcinr (as a dependency)** — one version is locked. Upgrading it will not compile. Pin it and
  write down why.
- **mfact / mfw (proofs)** — mfact owns the workflow soundness proofs; mfw owns the top-level
  theorem. Don't cross the line.

**Do not build on these:**

- **process-intelligence** — claims authority over changes to wasm4pm. The claim is not
  enforceable: it is eight weeks stale, it declares **none** of your 60 algorithms as data, and
  its own copy of wasm4pm no longer compiles. Its "alive" test counts documents rather than
  building anything. Take one thing — its working generator configuration — and ignore the
  governance claim.
- **open-ontologies** — not the shared vocabulary its name suggests. It is mostly an unrelated
  church-membership application and a benchmark corpus. Its one alignment file is 64 lines that
  define nothing reusable. Valuable as a warning, covered below.
- **star-toml** — an internal detail of ggen. Respect the rules it enforces; don't adopt it.

---

## 8. Constraints that bind

**ggen does not change.** The query-loading gap is permanent. Design around it.

**Keep the shared vocabulary small and copied in locally.** This is the lesson from
`open-ontologies`: a shared vocabulary layer was already attempted once in this ecosystem and
failed structurally. It tried to fetch from a public service that does not exist, and ggen's
startup degrades past roughly 36 ontology imports — beyond ten minutes. A hub that imports
everything would exceed that immediately. Target a few hundred lines, in one namespace you own,
with local copies of the public standards.

**Safety checks must go in gate files.** There is a configuration section that looks like it
declares validation rules. It is read and then silently thrown away. The reference example
contains a carefully written safety check, marked as a hard error, that has never once run. Put
checks where they actually execute, and prove each one by making it refuse something on purpose.

**Make hand-edits refuse, not vanish.** During this session, running the generator silently
deleted 146 lines of finished, machine-verified mathematics — because someone had written it
directly into a generated file instead of into the ontology. It was recoverable. The setting that
prevents this exists and must be switched on from day one.

**Two gates are currently red, and the strategy records that honestly.** The generator fails
immediately. The test suite has two failures, both caused by hand-typed checksums going stale
when a file was regenerated correctly. Tier 1 removes that entire failure mode.

---

## 9. How this gets built: smallest working thing first

Your own program is named for Gall's Law:

> A complex system that works is invariably found to have evolved from a simple system that
> worked. A complex system designed from scratch never works.

**So: no big-bang rewrite.** One algorithm, all the way through, with the checks actually
passing. Then grow.

**First target: the directly-follows graph.** It is chosen because everything needed already
exists — a finished machine-checked proof, a true/decoy citation pair for the anti-cheat, a clean
input shape, a single clean output type, and it is the foundation several other algorithms build
on.

Take that one algorithm and project everything: its registry entry, its command, its contract,
its documentation, its observability, its anti-cheat test, its correspondence check. **Nothing
counts until the generator runs clean, every check passes, and the generated code builds and
works.**

Then, in order: extend the vocabulary so it can describe parameters and inputs properly (the
current description is actively wrong for about 15 algorithms, and lossy for 25 more); normalize
the result shapes; then move algorithm by algorithm.

---

## 10. How success is checked

- **Record the starting state first**, including the parts that are broken. Nothing later is
  provable without it.
- **Compare generated output against what it replaces, byte for byte.** If it differs, that is
  either a bug or an improvement — and it must be named either way.
- **Every check must be shown refusing something**, on purpose, before it counts. A check that
  has never failed is untested.
- **Run the generator twice.** The second run must change nothing.
- **Verify receipts with a different program** than the one that wrote them.

---

## 11. What this strategy does not claim

**Declaring the code and the mathematics in one place does not prove they agree.** It gives you
four real things — nothing can be missing, everything is traceable to a citation, drift is
detected, and nothing changes silently. It does not, by itself, prove the code computes what the
formula says. Separate generated tests supply that evidence.

**Generating logic is unproven.** Nobody in this ecosystem does it, including the most mature
example. This strategy does not attempt it.

**The proofs remain real work.** Each algorithm's proof is mathematics. That cost does not go
away, and no amount of generation reduces it. What generation removes is everything *around* the
mathematics — which, measured across this audit, was about 90% of the effort and none of the
substance.

---

## Appendix: where the numbers came from

Every figure in this document was observed during the audit of 2026-07-30, not estimated:

| Claim | Source |
|---|---|
| 250,000 lines of Rust | counted across the core crate and all sub-crates |
| 0.18% currently generated | 439 generated lines against 250,400 total |
| praxis generates ~5% | 1,907 generated against ~36,900 hand-written |
| 31 implementations of 8 metrics | enumerated by name and location |
| 12 `fitness` implementations | enumerated by name and location |
| 24 distinct result shapes | enumerated across all algorithm cores |
| 60 vs 65 algorithms | two ontology files, counted |
| 11 hand-typed checksums, 2 broken | test run during this session |
| ~36 ontology import ceiling | documented in `open-ontologies`' own configuration |
| 146 lines deleted by the generator | observed live, then recovered |
| Validation rules silently discarded | traced through ggen's source |
