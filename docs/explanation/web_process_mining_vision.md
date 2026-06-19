# Client-Side Process Intelligence

## What Wil van der Aalst would build with wasm4pm — a thesis on moving the mining engine to where the data already is

---

## Abstract

Process mining today is a server-side discipline. An organization extracts an
event log, ships it to a vendor cloud, and receives back a dashboard of
discovered models, conformance verdicts, and KPIs. This is the architecture of
Celonis, the market-defining platform where Wil van der Aalst — the founder of
the field — serves as Chief Scientist. It works, and it scales, but it carries
one structural cost that no amount of cloud engineering removes: **the event log
leaves the building.** For healthcare, finance, and government, that single fact
is the dominant reason a process-mining initiative is never approved.

wasm4pm inverts the architecture. The discovery, conformance, and OCEL engine is
compiled to WebAssembly and runs **in the browser tab**. The event data is mined
where it already lives — in the analyst's session, behind the institution's
firewall, inside the page — and the sensitive log never crosses the network. This
document argues that the inversion is not a packaging trick but a faithful
extension of van der Aalst's own research program: object-centric event logs as
the native model, conformance as the arbiter of truth, and provenance as a
first-class obligation rather than a reporting afterthought. It is, in short, the
platform his doctrine implies, built where his doctrine's hardest adoption
barrier disappears.

---

## 1. The server-side premise, and what it costs

Celonis answers one question extremely well: *what is happening in this process?*
It connects to source systems, builds a case-centric event log, discovers a model,
overlays throughput and rework and conformance, and renders the result on tiles a
business analyst can read. The value is real and the field owes its commercial
existence to it.

The premise underneath is that the log is **moved to the engine**. The engine is a
multi-tenant cloud service; the log is extracted, transmitted, and held there for
the duration of the analysis. Every layer of that pipeline is a place where data
governance must say yes: the extraction, the transit, the residency, the vendor's
sub-processors, the retention. For a hospital reasoning over patient pathways, a
bank reasoning over transaction approvals, or an agency reasoning over benefits
adjudication, the answer at one of those layers is routinely *no* — and the
project dies before a model is ever discovered. The blocker is not the
mathematics of process mining. It is the **location** of the computation.

This is the load-bearing observation of the whole thesis: the single most common
reason regulated organizations decline process mining is not cost, not skill, and
not model quality — it is that the event log would have to leave their control.
Solve the location problem and a large class of the field's non-adopters becomes
addressable without changing the mathematics at all.

---

## 2. Move the engine to the data

wasm4pm's core is a Rust process-mining library compiled to WebAssembly. The same
discovery algorithms, the same conformance checkers, the same OCEL handling that
would run on a server run instead inside the browser's WASM sandbox. The
cognition layer already ships a browser target (`crates/wasm4pm-cognition/pkg-web`,
alongside the Node `pkg` and bundler `pkg-bundler` builds), and the breeds
execute client-side from it today.

The consequence is architectural, not cosmetic. When the engine runs in the page:

- The event log is read from a local file, a same-origin API, or an in-browser
  store and is **mined in place**. No bytes of it are POSTed to a mining service.
- The trust boundary collapses to the tab. There is no vendor cloud in the data
  path, so the governance questions of §1 — transit, residency, sub-processors,
  retention — have no surface to attach to. The data's residency is *the
  analyst's machine*, which is already inside the institution's control.
- The deployment is a static asset. A process-mining surface becomes a web
  component that an institution can host on its own infrastructure, audit byte for
  byte, and run air-gapped if it must.

This is the same move van der Aalst's field made once before, in reverse. Mining
moved *off* the operational system and *onto* a dedicated engine so the analysis
would not perturb production. wasm4pm moves the engine back *to* the user's
context — not onto the production system, but onto the user's own device — so the
analysis does not require surrendering the data. The mathematics is untouched; the
locus of computation is the whole point.

---

## 3. OCEL-native, because that is the frontier

Van der Aalst's most consequential recent contribution is the move from
case-centric to **object-centric** process mining. Classical event logs force every
event onto a single case identifier, which distorts any process where an order,
an item, a delivery, and an invoice are distinct objects with interleaved
lifecycles. Object-Centric Event Logs (OCEL, now OCEL 2.0) drop that assumption
and let an event touch many objects of many types — the model that real processes
actually have. This is his current research frontier, not a legacy format.

wasm4pm is **OCEL-native end to end**. It does not bolt object-centricity onto a
case-centric core; the log model, the discovered models (object-centric Petri
nets, `ocel/models/l1/`), and the conformance checking are object-centric from the
ground. Putting that engine in the browser produces something specific: a
**client-side OCEL miner with object-centric Petri-net conformance, delivered as a
web component.** That is van der Aalst's stated frontier — object-centric process
mining — shipped to the one place his platform's architecture cannot currently
reach, the regulated analyst's own tab.

The pairing is not incidental. Object-centric mining is exactly the capability
regulated domains most need (their processes are inherently multi-object —
patient/encounter/order/claim) and exactly the capability they are least able to
adopt under a data-export model (more object types means more sensitive linkage
leaving the building). OCEL-native *and* client-side is the combination that
removes both obstacles at once.

---

## 4. Provable dashboards, not pretty ones

A Celonis KPI is a number on a tile. It is computed correctly by a trusted engine,
but as it sits on the dashboard it carries no portable proof of its own
derivation: you trust the tile because you trust the vendor pipeline that produced
it. Replay, tamper-evidence, and model-vs-log conformance are properties of the
platform, not of the figure.

wasm4pm attaches the proof to the figure. Every operation in the wasm4pm core
emits a **BLAKE3 receipt** binding an `input_hash` to an `output_hash` with a
`run_id` and a `replay_pointer`; the same discipline the cognition layer uses for
its breeds applies to discovery and conformance. A dashboard built on this engine
is therefore not a panel of trusted numbers but a panel of **replayable** ones:

- Every figure is re-derivable from its input hash. A reviewer does not ask "do I
  trust this tile?" — they replay it and check the output hash.
- Every declared model is conformance-checked against the actual log. A KPI that
  presumes a process shape carries a fitness verdict for that shape; a tile cannot
  silently assume a model the log does not support.
- The whole view is tamper-evident. The receipt chain closes or it does not; a
  figure edited after the fact fails replay.

This is van der Aalst's own doctrine — *if the event log cannot prove a lawful
process happened, then it did not* — enforced not in a research validation step but
**at the dashboard layer**, on the figure the executive actually reads. The
constitution stops being a methodology the analyst is asked to follow and becomes
a property the surface mechanically carries. A provable dashboard is one where the
distance between "the tile says so" and "the log proves so" has been driven to
zero, client-side, with no vendor in the trust path.

---

## 5. Cognitive overlays — description becomes reasoning, in-frame

A discovered model and its conformance verdict are **descriptive**: they tell you
what happened and where the actual log deviated from the declared process. The
working analyst's next four questions — *what changed, why, what should I do, and
is the fix safe* — are diagnostic, abductive, prescriptive, and verificational.
Server-side platforms answer them with a human, a meeting, and a follow-up query.

wasm4pm answers them in the same frame, because the cognition layer runs in the
same tab. The 55 measured breeds execute at a **19.1 µs median latency** (see
`docs/explanation/benchmarks_thesis.md`); a 16 ms interactive frame has room for
hundreds of verified reasoning steps. So a bottleneck the conformance overlay
surfaces can be handed, live and client-side, down a pipeline of breeds:

1. **`event_calculus`** — fix what changed: which fluents flipped around the
   deviation, derived from the log's own events.
2. **`abductive_ibe`** — inference to the best explanation: rank the candidate
   causes of the bottleneck by explanatory coverage.
3. **`bayesian_network`** — score the ranked hypotheses against priors to a
   calibrated root-cause posterior (the same exact-enumeration breed that
   reproduces Pearl's 0.3736).
4. **`ltl_monitor`** — check that a proposed intervention preserves the process's
   safety properties: does the fix violate a temporal invariant the log must hold?
5. **`htn_planning`** — synthesize the intervention itself as a hierarchical plan
   of operational actions.

Every stage is a falsifiable breed pinned to its source paper, every stage emits
its own receipt, and the whole chain is auditable as a lawful object-centric
process by the very engine that runs it. The dashboard is therefore not only
descriptive (*bottleneck at X*) but diagnostic (*because Y*), predictive (*Y will
recur under Z*), and prescriptive (*do P, and P is provably safe*) — in one frame,
on the analyst's machine, with the data never leaving the tab and every inference
replayable from its input hash.

This is the capability the breeds thesis describes as composable multi-paradigm
reasoning, placed where it does the most good: not in an offline notebook but in
the live analytic surface, turning a description of the past into a receipted
recommendation for the next action.

---

## 6. The synthesis — the Chatman Equation applied to the Celonis problem

Celonis answers *what is happening?* extremely well, in a vendor cloud, over data
that had to be exported to get there. wasm4pm answers a larger question in a
smaller place:

> **What is happening, can I prove it, why is it happening, and what should I do —
> without my data leaving the tab?**

The four clauses are the **Chatman Equation** — receipts (replayable provenance)
plus replay (re-derivation from input hash) plus conformance (model checked against
the actual log) — applied to the problem Celonis defined, and running where the
data already is. *What is happening* is discovery and conformance. *Can I prove
it* is the BLAKE3 receipt chain and the tamper-evident view. *Why* is the abductive
and Bayesian cognitive overlay. *What should I do* is the planning breed, verified
safe by the temporal monitor. *Without my data leaving the tab* is the WASM engine
in the browser — the clause that turns the other four from a methodology into an
adoptable product for the domains that need it most.

The claim is precise and bounded: this does not out-scale Celonis on enterprise
connectors or out-polish it on visual design. It does something Celonis's
architecture structurally cannot — it puts an OCEL-native, conformance-checked,
receipt-bearing, cognitively-augmented mining engine **inside the regulated
analyst's own session**, removing the one barrier that keeps process mining out of
the rooms where the stakes are highest.

---

## 7. What is real today vs. roadmap

Honesty is a load-bearing property of this project, so the boundary between
shipped and intended is drawn plainly.

**Real today.**
- The cognition WASM builds for the browser: `crates/wasm4pm-cognition/pkg-web`
  exists alongside the Node and bundler targets, and the 55 breeds run
  **client-side** from it.
- The breeds are paper-grounded, falsifiable, deterministic, and receipt-bearing,
  with the latency profile cited in §5 (`docs/explanation/benchmarks_thesis.md`).
- The OCEL-native core, object-centric Petri-net models (`ocel/models/l1/`), and
  conformance/fitness reporting (`ocel/reports/`) exist and run in the Rust/WASM
  core.
- The distributable breed surface ships as ggen packs
  (`packs/wasm4pm-breeds-rust/`, `packs/wasm4pm-breeds-ts/`) with runnable
  consumers under `examples/`.

**In progress / roadmap.**
- The **core discovery + OCEL web build** (`pkg-web` for the mining core, not only
  the cognition layer) is being brought up to parity with the Node target.
- A **full client-side dashboard** — discovery, conformance overlay, receipted
  KPIs, and the cognitive pipeline of §5 wired into one interactive surface — is in
  progress. As it lands it will appear under `examples/`, joining the discovery,
  conformance, prediction, and OCEL examples already there
  (`examples/01-discovery`, `examples/02-conformance`,
  `examples/14-ocel-process-mining.ts`).
- The end-to-end *receipted dashboard figure* — every tile carrying a replay
  pointer and a conformance verdict in the browser — is the integration target the
  receipt and conformance machinery already supports but the UI does not yet fully
  surface.

The thesis of this document is the destination. The cognition browser build and
client-side breeds are the part of it that is real now; the mining web core and the
dashboard are the work in front of it.

---

*Grounding note.* The browser cognition build is `crates/wasm4pm-cognition/pkg-web`;
the breed latency and trust figures are from `docs/explanation/benchmarks_thesis.md`
(19.1 µs median, 55 TRUSTED) and the breed admission discipline from
`docs/explanation/breeds_thesis.md`. Object-centric models and conformance
evidence live under `ocel/models/l1/` and `ocel/reports/`. The distributable breed
surface is in `packs/wasm4pm-breeds-rust/` and `packs/wasm4pm-breeds-ts/`, and the
discovery, conformance, prediction, and OCEL examples are under `examples/`. The
claims in this thesis are checkable against that evidence — as the doctrine
requires.
