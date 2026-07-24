# Design for Combinatorial Maximalism using all Mermaid

> An Alexander-style pattern language in which every Mermaid diagram family supplies a distinct, composable projection of wasm4pm.

## Standing

- **Mermaid grammar target:** 11.16.0.
- **Coverage:** all 30 top-level Mermaid diagram families. C4 is expanded into Context, Container, Component, Dynamic, and Deployment, producing **34 standalone `.mmd` sources**.
- **Documentation standing:** `ALIVE` as a coherent pattern atlas.
- **Parser/render standing:** `UNKNOWN` until CI parses and renders every source with the repository-pinned Mermaid version.
- **Runtime standing:** mixed. Every pattern declares whether it is current, target, diagnostic, planning, historical, strategic, structural, process, or doctrine. A diagram never proves that its depicted runtime exists.

## The combinatorial-maximalist rule

Design for Combinatorial Maximalism does not maximize decorative diagrams. It maximizes **lawful, reversible combinations of orthogonal views**. Each diagram asks one primary question, uses a controlled wasm4pm vocabulary, declares its forces, and names what would falsify it. The result functions as a Christopher Alexander pattern language: each pattern solves a recurring representational problem and links to patterns that complete it.

## Shared vocabulary

- `O` is observed input. `O*` is bounded, canonical, admitted observation.
- `CONSTRUCT` explores reversible graph-domain candidates.
- `BRCE` is the authority boundary: zero unreceipted actuation.
- A receipt records a bounded decision or effect. Replay independently re-derives or verifies what the receipt claims.
- Standing is typed: `UNKNOWN`, `PARTIAL_ALIVE`, `ALIVE`, `BUILD_BROKEN`, `BLOCKED`, or `UNSUPPORTED`.
- **Current** means source-grounded now. **Target** means an intended morphism or composition root. **Diagnostic** means a hypothesis-generating view, not proof.

## Pattern grammar

Every pattern contains seven fields.

1. **Context** — the recurring situation.
2. **Problem** — what this diagram type exposes better than adjacent types.
3. **Forces** — constraints that must be held together.
4. **Solution** — the reusable drawing rule.
5. **wasm4pm case** — the concrete instantiation.
6. **Falsifier** — evidence that invalidates the diagram.
7. **Combine with** — neighboring patterns that form a stronger language.

## Composition laws

- **One diagram, one primary question.** Supporting facts may appear, but the diagram must not silently change its epistemic purpose.
- **One noun, one bounded meaning.** `Receipt`, `grant`, `event`, `artifact`, and `standing` retain the same semantics across views.
- **No arrow without a morphism.** Every edge is source-grounded, explicitly target-state, or diagnostic. Unmarked speculation is refused.
- **No actuation without BRCE.** Any target view containing an external effect routes through scoped authority and terminates in evidence.
- **Separate semantic replay from cryptographic verification.** Re-folding events through a reducer and verifying a receipt chain are different operations.
- **Separate current and target rails.** The existing TypeScript session rail and Rust `interview::*` rail remain distinct until a composition root proves convergence.
- **Diagram presence is not proof.** Valid Mermaid is an evidence index, not runtime evidence.
- **Prefer several small projections to one omniscient picture.** Power comes from lawful combination, not one overloaded graph.
- **Quarantine experimental grammar.** Beta and experimental families must be parser-tested against the pinned renderer before rendered output receives `ALIVE` standing.

## Atlas index

| # | Mermaid family | Alexander pattern | Primary question | View | Source |
|---:|---|---|---|---|---|
| 01 | Flowchart | **Bounded Transformation** | How does observation become an artifact without an ungoverned step? | current + target | [`01-flowchart.mmd`](01-flowchart.mmd) |
| 02 | Swimlanes | **Handoff Without Authority Leakage** | Who owns each step and where may control cross a boundary? | target | [`02-swimlanes.mmd`](02-swimlanes.mmd) |
| 03 | Sequence | **Message-Causal Truth** | What messages make one lawful execution possible? | target | [`03-sequence.mmd`](03-sequence.mmd) |
| 04 | Class | **Contracts Before Instances** | Which contracts must exist before components can be composed? | target | [`04-class.mmd`](04-class.mmd) |
| 05 | State | **Standing Is a State Machine** | What evidence permits a declared-standing change? | current doctrine | [`05-state.mmd`](05-state.mmd) |
| 06 | Entity Relationship | **Provenance Has Cardinality** | Which durable records exist and how are they linked? | target | [`06-er.mmd`](06-er.mmd) |
| 07 | User Journey | **Human Friction Is Architectural Evidence** | Where does the human experience gain or lose confidence? | diagnostic | [`07-user-journey.mmd`](07-user-journey.mmd) |
| 08 | Gantt | **Evidence-Critical Path** | Which work must complete before actuation or release? | planning | [`08-gantt.mmd`](08-gantt.mmd) |
| 09 | Pie | **Explicit Evidence Budget** | How is confidence allocated across evidence classes? | diagnostic | [`09-pie.mmd`](09-pie.mmd) |
| 10 | Quadrant | **Reversibility–Standing Portfolio** | Which work should be explored, proved, manufactured, or refused? | diagnostic | [`10-quadrant.mmd`](10-quadrant.mmd) |
| 11 | Requirement | **Law as Traceable Obligation** | Which component satisfies each non-negotiable law? | current + target | [`11-requirement.mmd`](11-requirement.mmd) |
| 12 | GitGraph | **Reversible Branch Before Admission** | How do experimental changes become admitted history? | process | [`12-gitgraph.mmd`](12-gitgraph.mmd) |
| 13 | C4 Context | **System Boundary Before Mechanism** | Who interacts with wasm4pm and what remains external? | current + target | [`13-c4-context.mmd`](13-c4-context.mmd) |
| 14 | C4 Container | **Runtime Separation** | Which executable units own each responsibility? | target | [`14-c4-container.mmd`](14-c4-container.mmd) |
| 15 | C4 Component | **Composition Root** | Which internal components jointly enforce the law path? | target | [`15-c4-component.mmd`](15-c4-component.mmd) |
| 16 | C4 Dynamic | **One Authorized Act** | How does one use case traverse the C4 model? | target | [`16-c4-dynamic.mmd`](16-c4-dynamic.mmd) |
| 17 | C4 Deployment | **Evidence Lives Somewhere** | Where do code, processes, and receipts execute or persist? | current + target | [`17-c4-deployment.mmd`](17-c4-deployment.mmd) |
| 18 | Mindmap | **Whole-System Vocabulary** | Which concepts belong to the design language? | doctrine | [`18-mindmap.mmd`](18-mindmap.mmd) |
| 19 | Timeline | **Architecture as Accumulated Decisions** | Which decisions produced the current system and what comes next? | historical + target | [`19-timeline.mmd`](19-timeline.mmd) |
| 20 | ZenUML | **Nested Responsibility** | Which caller owns each nested operation and refusal? | target | [`20-zenuml.mmd`](20-zenuml.mmd) |
| 21 | Sankey | **Attrition Is Information** | Where do observations and candidates leave the manufacturing stream? | diagnostic | [`21-sankey.mmd`](21-sankey.mmd) |
| 22 | XY Chart | **Proof Ladder Trend** | How does evidence change across verification stages? | diagnostic | [`22-xychart.mmd`](22-xychart.mmd) |
| 23 | Block | **Deliberate Spatial Topology** | Which concepts must be perceived as one bounded assembly? | structural | [`23-block.mmd`](23-block.mmd) |
| 24 | Packet | **Canonical Envelope** | What exact fields cross the receipt trust boundary? | target | [`24-packet.mmd`](24-packet.mmd) |
| 25 | Kanban | **Standing-Gated Work** | How does work move only when its evidence permits it? | planning | [`25-kanban.mmd`](25-kanban.mmd) |
| 26 | Architecture | **Service and Resource Boundary** | How are services, resources, and ports arranged? | target | [`26-architecture.mmd`](26-architecture.mmd) |
| 27 | Radar | **Multi-Axis Standing** | Where is the architecture strong, weak, or unbalanced? | diagnostic | [`27-radar.mmd`](27-radar.mmd) |
| 28 | Event Modeling | **Facts Before Views** | Which commands and events define behavior over time? | target | [`28-event-modeling.mmd`](28-event-modeling.mmd) |
| 29 | Treemap | **Hierarchy With Weight** | Where is complexity or effort concentrated? | diagnostic | [`29-treemap.mmd`](29-treemap.mmd) |
| 30 | Venn | **Artifact With Standing** | Which overlap of properties produces an admissible artifact? | doctrine | [`30-venn.mmd`](30-venn.mmd) |
| 31 | Ishikawa | **Failure Has Multiple Bones** | Which interacting causes can produce one observed failure? | diagnostic | [`31-ishikawa.mmd`](31-ishikawa.mmd) |
| 32 | Wardley | **Differentiate Law, Commoditize Execution** | Which capabilities should evolve, be built, bought, or standardized? | strategic | [`32-wardley.mmd`](32-wardley.mmd) |
| 33 | Cynefin | **Match Method to Uncertainty** | Which decision method fits the causal character of the problem? | diagnostic | [`33-cynefin.mmd`](33-cynefin.mmd) |
| 34 | TreeView | **Repository Topology as Architecture** | Where should each concern live in the repository? | current + target | [`34-treeview.mmd`](34-treeview.mmd) |

## The 34 patterns

### 01. Bounded Transformation — Flowchart

- **Context:** A process crosses several semantic boundaries.
- **Problem:** A conventional pipeline can conceal admission, authority, or evidence gaps.
- **Forces:** Preserve reversibility while making refusal and actuation explicit.
- **Solution:** Name every transformation, place admission and authority as gates, and terminate in standing.
- **wasm4pm case:** `O → O* → CONSTRUCT → BRCE → artifact → receipt → standing`.
- **Falsifier:** An edge cannot be mapped to code, policy, or a declared target morphism.
- **Combine with:** Sequence, State, Requirement.

### 02. Handoff Without Authority Leakage — Swimlanes

- **Context:** Multiple roles collaborate on one manufacturing path.
- **Problem:** Ownership changes are mistaken for authorization.
- **Forces:** Separate responsibility, authority, and evidence custody.
- **Solution:** Assign each operation to one lane and require every handoff to carry an admitted object.
- **wasm4pm case:** Observer, admission, construction, broker, execution, and verification remain distinct.
- **Falsifier:** A lane actuates without a broker-issued grant or a handoff has no typed carrier.
- **Combine with:** Sequence, C4 Component, Kanban.

### 03. Message-Causal Truth — Sequence

- **Context:** A runtime claim depends on ordered interactions.
- **Problem:** Static structure does not prove causal order or refusal behavior.
- **Forces:** Show alternatives without losing the exact point of actuation.
- **Solution:** Model one bounded scenario with explicit request, response, `alt`, authority, and receipt messages.
- **wasm4pm case:** A canonical event is admitted, constructed, authorized, executed once, and receipted.
- **Falsifier:** Success occurs without preceding authority or evidence messages.
- **Combine with:** ZenUML, C4 Dynamic, Packet.

### 04. Contracts Before Instances — Class

- **Context:** Implementation is distributed across modules.
- **Problem:** Names alone do not establish interfaces or ownership.
- **Forces:** Expose the minimum lawful contracts and dependency directions.
- **Solution:** Model types, operations, composition, and associations before coding the composition root.
- **wasm4pm case:** `InterviewRuntime` depends on gateway, admission, construction, broker, executor, and ledger contracts.
- **Falsifier:** A runtime invariant has no owning type or is enforced only by convention.
- **Combine with:** C4 Component, Requirement, ER.

### 05. Standing Is a State Machine — State

- **Context:** Artifacts move through evidence states over time.
- **Problem:** Boolean done/not-done status erases failure and recovery modes.
- **Forces:** Make transitions strict without preventing repair.
- **Solution:** Use typed standing with evidence-bearing transitions.
- **wasm4pm case:** A capability advances from `UNKNOWN` toward `ALIVE` only through the proof ladder.
- **Falsifier:** Standing changes without new evidence or a falsifier.
- **Combine with:** Flowchart, Kanban, GitGraph.

### 06. Provenance Has Cardinality — Entity Relationship

- **Context:** Replay and audit require durable facts.
- **Problem:** Loose objects obscure identity, cardinality, and ownership.
- **Forces:** Preserve provenance while keeping storage implementable.
- **Solution:** Model sessions, events, admitted facts, derivations, grants, artifacts, and receipts as related records.
- **wasm4pm case:** Every artifact has an authorizing grant and a receipt in a session chain.
- **Falsifier:** An artifact, grant, or receipt can be orphaned or ambiguously attached.
- **Combine with:** Packet, Event Modeling, Class.

### 07. Human Friction Is Architectural Evidence — User Journey

- **Context:** Correctness is consumed through a human interface.
- **Problem:** Architecture diagrams hide confusion, delay, and inaccessible controls.
- **Forces:** Preserve rigorous standing while making refusals understandable.
- **Solution:** Score the journey across admission, construction, authority, and verification.
- **wasm4pm case:** The contributor sees why an observation was refused and what standing was reached.
- **Falsifier:** A critical low-scoring step has no linked architecture or backlog response.
- **Combine with:** C4 Context, Timeline, Kanban.

### 08. Evidence-Critical Path — Gantt

- **Context:** Many tasks can proceed concurrently.
- **Problem:** Calendar order can imply false dependency or premature release.
- **Forces:** Preserve parallelism while protecting evidence gates.
- **Solution:** Schedule by evidence dependency rather than feature enthusiasm.
- **wasm4pm case:** Bound `O*`, construct, verify, broker, and replay form the release path.
- **Falsifier:** Release completes before an evidence-producing predecessor.
- **Combine with:** Kanban, GitGraph, Requirement.

### 09. Explicit Evidence Budget — Pie

- **Context:** Teams cite heterogeneous evidence.
- **Problem:** Narrative confidence can dominate executable evidence invisibly.
- **Forces:** Make allocation visible without pretending an illustration is measured data.
- **Solution:** Use a pie only for a declared budget or observed distribution.
- **wasm4pm case:** Confidence is allocated across source binding, tests, proofs, receipts, and replay.
- **Falsifier:** Percentages have no denominator or are presented as measurements without receipts.
- **Combine with:** Radar, XY Chart, Treemap.

### 10. Reversibility–Standing Portfolio — Quadrant

- **Context:** Candidate work differs in reversibility and evidence standing.
- **Problem:** One priority list conflates safe exploration with risky actuation.
- **Forces:** Encourage exploration while refusing low-standing effects.
- **Solution:** Place candidates by reversibility and standing and prescribe a treatment per quadrant.
- **wasm4pm case:** CONSTRUCT is reversible; direct filesystem mutation is low-standing.
- **Falsifier:** Axis values cannot be justified or quadrants prescribe no distinct action.
- **Combine with:** Wardley, Cynefin, Kanban.

### 11. Law as Traceable Obligation — Requirement

- **Context:** Architectural doctrine must become testable obligations.
- **Problem:** Prose invariants drift away from implementation.
- **Forces:** Preserve intent, risk, ownership, and verification method.
- **Solution:** Bind each requirement to a satisfying element and evidence method.
- **wasm4pm case:** `BRCE-001` requires every actuation to be brokered and receipted.
- **Falsifier:** A high-risk requirement lacks a satisfier, verifier, or source reference.
- **Combine with:** Class, Packet, State.

### 12. Reversible Branch Before Admission — GitGraph

- **Context:** Architecture work is exploratory but history is durable.
- **Problem:** Direct mainline commits collapse exploration and admission.
- **Forces:** Preserve experimentation, proof, and auditable merge decisions.
- **Solution:** Branch for construction and proof; merge only after evidence is admitted.
- **wasm4pm case:** Diagram and proof branches converge before the artifact reaches `main`.
- **Falsifier:** A merge occurs without its proof branch or expected head receipt.
- **Combine with:** Gantt, Kanban, State.

### 13. System Boundary Before Mechanism — C4 Context

- **Context:** A system name accumulates too many meanings.
- **Problem:** Internal detail obscures responsibility and trust boundaries.
- **Forces:** Stay simple while retaining every external dependency that carries trust.
- **Solution:** Define people, the system of interest, external systems, and relationships first.
- **wasm4pm case:** Researcher, wasm4pm, ggen, and verifier have explicit roles.
- **Falsifier:** A trust-bearing dependency appears only in a lower-level diagram.
- **Combine with:** C4 Container, User Journey, Wardley.

### 14. Runtime Separation — C4 Container

- **Context:** One product spans UI, Rust/WASM cognition, projection, execution, and evidence.
- **Problem:** Module names hide process and deployment boundaries.
- **Forces:** Separate runtimes, trust, and data custody without fragmenting the system.
- **Solution:** Model interaction surfaces, cognition runtime, projection engine, and ledger as containers.
- **wasm4pm case:** Client components never directly import a server-only executor.
- **Falsifier:** Different trust or deployment semantics are collapsed into one container.
- **Combine with:** C4 Context, C4 Component, Deployment.

### 15. Composition Root — C4 Component

- **Context:** Correct modules may exist without being composed.
- **Problem:** A component inventory can imply an enforced path that does not exist.
- **Forces:** Make the intended law path visible without overstating current runtime.
- **Solution:** Show the component owning orchestration and every invariant-bearing dependency.
- **wasm4pm case:** Target `InterviewRuntime` sits between admitted input and construction, authority, execution, and receipts.
- **Falsifier:** A legal path bypasses the runtime or a relation lacks implementation or a target ticket.
- **Combine with:** Class, Sequence, TreeView.

### 16. One Authorized Act — C4 Dynamic

- **Context:** Static C4 views do not show runtime order.
- **Problem:** Readers infer a happy path that omits authorization or evidence.
- **Forces:** Stay within C4 vocabulary while showing one bounded execution.
- **Solution:** Number the observation, admission, actuation, receipt, and return relations.
- **wasm4pm case:** Standing returns only after the receipt exists.
- **Falsifier:** The numbered path contradicts the sequence diagram or skips a trust boundary.
- **Combine with:** Sequence, C4 Component, Packet.

### 17. Evidence Lives Somewhere — C4 Deployment

- **Context:** Logical architecture must execute on hosts and persist data somewhere.
- **Problem:** Claims such as browser, local, WASM, or filesystem are easy to overstate.
- **Forces:** Name real nodes while distinguishing substitutes and targets.
- **Solution:** Map containers to actual deployment nodes and label substitutions explicitly.
- **wasm4pm case:** InterviewAssist, cognition, executor, and receipt store occupy declared nodes.
- **Falsifier:** A deployed container lacks a real host, artifact, or target marker.
- **Combine with:** C4 Container, Architecture, TreeView.

### 18. Whole-System Vocabulary — Mindmap

- **Context:** A pattern language needs shared terms before detailed views.
- **Problem:** Linear documentation hides conceptual neighborhoods and missing branches.
- **Forces:** Maximize conceptual coverage without implying sequence or authority.
- **Solution:** Organize observation, construction, authority, evidence, and standing around DCM.
- **wasm4pm case:** The mindmap supplies the controlled vocabulary used by every other diagram.
- **Falsifier:** A node lacks a definition elsewhere or hierarchy is mistaken for causality.
- **Combine with:** TreeView, Treemap, C4 Context.

### 19. Architecture as Accumulated Decisions — Timeline

- **Context:** Current structure is path-dependent.
- **Problem:** A snapshot cannot explain why constraints or gaps exist.
- **Forces:** Preserve history while keeping future targets visibly future.
- **Solution:** Record decisive increments and future boundaries without implying completion.
- **wasm4pm case:** Receipt discipline, ggen, Lean, InterviewAssist, and target runtime composition are sequenced.
- **Falsifier:** A future target is presented as a completed past event.
- **Combine with:** GitGraph, Gantt, Wardley.

### 20. Nested Responsibility — ZenUML

- **Context:** Deep call structures are difficult to read as flat messages.
- **Problem:** Sequence diagrams can understate lexical ownership and nested authority.
- **Forces:** Preserve call nesting, alternatives, and refusal ownership.
- **Solution:** Show admission enclosing construction, construction enclosing authorization, and authorization enclosing actuation.
- **wasm4pm case:** Refusals return from the boundary that owns the denied decision.
- **Falsifier:** A nested call escapes its authority scope.
- **Combine with:** Sequence, Class, C4 Dynamic.

### 21. Attrition Is Information — Sankey

- **Context:** Refusal and quarantine are productive outcomes.
- **Problem:** Success-only diagrams hide how much work is filtered and why.
- **Forces:** Conserve flow while naming lawful attrition.
- **Solution:** Track observations through admission, quarantine, authority, receipt, and standing.
- **wasm4pm case:** Refused and denied flows remain visible rather than erased.
- **Falsifier:** Inputs and outputs do not balance or illustrative quantities are presented as measurements.
- **Combine with:** Flowchart, Pie, XY Chart.

### 22. Proof Ladder Trend — XY Chart

- **Context:** A capability is tested at increasingly demanding levels.
- **Problem:** One pass/fail number hides where evidence collapses.
- **Forces:** Compare stages without implying false continuity.
- **Solution:** Plot required and observed evidence for unit, integration, WASM, replay, stress, and proof.
- **wasm4pm case:** Later stages can reduce standing despite early success.
- **Falsifier:** Axes or values lack provenance or ordinal stages are treated as measured time.
- **Combine with:** Radar, Gantt, State.

### 23. Deliberate Spatial Topology — Block

- **Context:** Automatic layout separates concepts that must be read together.
- **Problem:** Topology and visual grouping communicate architectural intent.
- **Forces:** Preserve causal order while bounding the evidence subsystem.
- **Solution:** Use blocks and columns to separate the manufacturing path from the evidence rail.
- **wasm4pm case:** Receipt, replay, and standing close the actuation path as one bounded assembly.
- **Falsifier:** Spatial grouping contradicts ownership or suggests a bypass.
- **Combine with:** Flowchart, Architecture, C4 Component.

### 24. Canonical Envelope — Packet

- **Context:** Receipts and events require unambiguous encoding.
- **Problem:** Object diagrams conceal field widths, versioning, and chain linkage.
- **Forces:** Keep the envelope compact while binding all identity and ancestry fields.
- **Solution:** Specify a versioned field layout.
- **wasm4pm case:** Version, kind, sequence, session, subject, previous receipt, and outcome are explicit.
- **Falsifier:** Two semantic values can serialize to the same bytes.
- **Combine with:** Requirement, ER, Sequence.

### 25. Standing-Gated Work — Kanban

- **Context:** Backlogs mix ideas, code, integration, and verified artifacts.
- **Problem:** Moving a card becomes a social assertion rather than an evidence transition.
- **Forces:** Preserve flow while refusing advancement without receipts.
- **Solution:** Align columns with proof-producing stages and annotate priority.
- **wasm4pm case:** The composition root cannot enter Verified without integration evidence.
- **Falsifier:** A card changes columns without a receipt, test, or review criterion.
- **Combine with:** State, Gantt, GitGraph.

### 26. Service and Resource Boundary — Architecture

- **Context:** Container diagrams do not always expose port direction or resource shape.
- **Problem:** Undirected boxes obscure where effects enter and leave.
- **Forces:** Preserve runtime grouping, port direction, and service/resource distinctions.
- **Solution:** Use architecture groups and directional ports.
- **wasm4pm case:** Gateway, runtime, broker, executor, and ledger form a port-oriented law path.
- **Falsifier:** A service has an undeclared side channel or an arrow conflicts with authority.
- **Combine with:** C4 Container, Block, Deployment.

### 27. Multi-Axis Standing — Radar

- **Context:** Architecture quality is multidimensional.
- **Problem:** One maturity score lets strength hide a critical weakness.
- **Forces:** Compare dimensions without claiming illustrative scores are proof.
- **Solution:** Plot current and target standing across a declared rubric.
- **wasm4pm case:** Reversibility, determinism, authority, proof, replay, and accessibility remain independently visible.
- **Falsifier:** Scores lack a rubric or are used as runtime evidence.
- **Combine with:** XY Chart, Quadrant, Pie.

### 28. Facts Before Views — Event Modeling

- **Context:** Event-driven systems are often documented from screens inward.
- **Problem:** UI-first decomposition hides facts needed for replay and policy.
- **Forces:** Preserve human intent, causal commands, durable facts, and rebuildable views.
- **Solution:** Model commands, events, processors, read models, and interfaces over time.
- **wasm4pm case:** `ObservationCaptured`, `ObservationAdmitted`, `AuthorityGranted`, and `ArtifactReceipted` anchor the timeline.
- **Falsifier:** A displayed state cannot be rebuilt from admitted events.
- **Combine with:** ER, Sequence, State.

### 29. Hierarchy With Weight — Treemap

- **Context:** A hierarchy alone does not reveal relative investment.
- **Problem:** Authority or evidence can be under-resourced because all boxes look equal.
- **Forces:** Preserve hierarchy while exposing weight.
- **Solution:** Attach an explicit measure to sibling concerns.
- **wasm4pm case:** Observation, construction, authority, and evidence receive visible proportions.
- **Falsifier:** Weights lack a declared meaning or siblings are incomparable.
- **Combine with:** Mindmap, Pie, TreeView.

### 30. Artifact With Standing — Venn

- **Context:** Constructed, authorized, and verified are distinct predicates.
- **Problem:** Any one predicate is mistakenly treated as sufficient for release.
- **Forces:** Keep predicates independently testable while requiring their conjunction.
- **Solution:** Represent standing as the intersection of required properties.
- **wasm4pm case:** Only constructed ∩ authorized ∩ verified is an artifact with standing.
- **Falsifier:** A release candidate exists outside the required intersection.
- **Combine with:** Requirement, State, Quadrant.

### 31. Failure Has Multiple Bones — Ishikawa

- **Context:** Systemic failures rarely have one cause.
- **Problem:** Linear bug lists encourage local patches while boundary defects remain.
- **Forces:** Preserve competing hypotheses across architectural domains.
- **Solution:** Organize causes by observation, admission, construction, authority, evidence, and integration.
- **wasm4pm case:** Unreceipted actuation can arise from several independent boundary failures.
- **Falsifier:** A root-cause claim lacks evidence or a major domain is excluded without reason.
- **Combine with:** Cynefin, Flowchart, Requirement.

### 32. Differentiate Law, Commoditize Execution — Wardley

- **Context:** Not every component deserves bespoke invention.
- **Problem:** Teams differentiate commodity execution while underinvesting in lawful composition.
- **Forces:** Balance user visibility, maturity, dependency, and strategic differentiation.
- **Solution:** Map user need and evolutionary maturity.
- **wasm4pm case:** Differentiate `InterviewRuntime` and receipt law; reuse Rust, WASM, and local compute.
- **Falsifier:** A strategic choice has no user anchor or maturity evidence.
- **Combine with:** Timeline, Quadrant, Architecture.

### 33. Match Method to Uncertainty — Cynefin

- **Context:** Engineering work ranges from obvious to genuinely novel.
- **Problem:** One planning method creates false certainty or needless experimentation.
- **Forces:** Match method to causal stability and allow domains to change with evidence.
- **Solution:** Classify work as clear, complicated, complex, chaotic, or confused and define transitions.
- **wasm4pm case:** Deterministic tests are clear; integration is complicated; ontology composition is complex; broker bypass is chaotic.
- **Falsifier:** The chosen method contradicts the task's evidence and causal stability.
- **Combine with:** Ishikawa, Quadrant, Kanban.

### 34. Repository Topology as Architecture — TreeView

- **Context:** Logical architecture must be discoverable in source layout.
- **Problem:** A diagram can name components with no coherent repository home.
- **Forces:** Preserve current paths while visibly marking proposed paths.
- **Solution:** Map the pattern language to concrete directories and target files.
- **wasm4pm case:** The tree locates cognition, interview modules, app layers, diagrams, and target `runtime.rs`.
- **Falsifier:** A component cannot be located or a target path is presented as existing.
- **Combine with:** C4 Component, Mindmap, Deployment.

## Combinatorial sequences

These are useful combinations of questions, not mandatory workflows.

- **Understand the whole:** Mindmap → C4 Context → C4 Container → C4 Component.
- **Manufacture one lawful act:** Flowchart → Sequence or ZenUML → State → Requirement → Packet.
- **Prove and quantify:** ER → Event Modeling → Sankey → XY Chart → Radar.
- **Govern delivery:** Swimlanes → Kanban → Gantt → GitGraph.
- **Diagnose uncertainty:** Ishikawa → Cynefin → Quadrant → Wardley.
- **Locate the architecture:** TreeView → Architecture → C4 Deployment.
- **Audit human standing:** User Journey → Timeline → Venn → State.

## Atlas acceptance test

Before rendered diagrams receive `ALIVE` standing, CI should:

1. Pin Mermaid 11.16.0 or an explicitly approved successor.
2. Parse every `docs/diagrams/combinatorial-maximalism/*.mmd` source.
3. Render every source to SVG and fail on parser or renderer error.
4. Snapshot stable families and separately report beta or experimental families.
5. Check every source link in this summary.
6. Require target-state diagrams to retain visible target or standing declarations.
7. Reject generated SVGs as proof of depicted runtime behavior. Runtime evidence remains tests, proofs, receipts, and replay.

## Do not infer

- `runtime.rs` in a target diagram does not prove that the composition root exists.
- A diagram that parses does not prove its nodes and edges are source-grounded.
- A component inventory does not prove end-to-end composition.
- A replay diagram does not prove cryptographic receipt-chain verification.
- GitHub may use a Mermaid version different from the atlas target.
- Quantitative diagrams contain illustrative values unless linked to measured data and receipts.

## Source layout

The `.mmd` files are standalone so they can be parsed, rendered, embedded, diffed, or transformed independently. This `SUMMARY.md` supplies the shared laws that make their combination coherent.
