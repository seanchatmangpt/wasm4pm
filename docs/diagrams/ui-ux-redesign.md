# UI/UX redesign spec

Canonical UI/UX specification for InterviewAssist, authored directly by the project owner. The specification diagrams remain the target interaction model; source-grounded corrections are fenced explicitly rather than silently rewriting the target.

**Re-verified:** 2026-07-24.

## Source commands executed for the grounded corrections

```text
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/page.tsx ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/cognition-adapter.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/domain/cognition-rules.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/mod.rs ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=crates/wasm4pm-cognition/src/breeds/dendral.rs ref=docs/v26.7.24-planning-diagramming
```

The structural shell (`SessionHeader`, `SessionWorkspace`, `SessionActivityDrawer`, and `CognitionPanel`) is present in `examples/interview-assist/app/page.tsx`. Runtime completion and scenario standing remain tracked separately in [unfinished-work.md](unfinished-work.md).

## 1. Primary interaction model

The normal interface is driven by observed interview events and cognition — not manual state-transition buttons.

```mermaid
flowchart LR
    A["Interview event<br/>transcript, code edit, test result"] --> B["Canonical event admission"]

    B -->|admitted| C["wasm4pm-cognition"]
    B -->|invalid or unauthorized| R["Typed refusal"]

    C --> D["Candidate tracks"]
    D --> E{"Confidence sufficient?"}

    E -->|No| F["Ask one scoped<br/>Eliza-style question"]
    F --> G{"Candidate response"}
    G -->|Yes| H["Confirm track"]
    G -->|No| D
    G -->|Correction| C

    E -->|Yes| H

    H --> I["Project problem context<br/>and authorized assistance"]
    I --> J["Coding workspace"]
    J --> K["Real sandbox execution"]
    K --> L["Tests and diagnostics"]
    L --> M["Evidence admission"]
    M --> N["Next lawful state"]

    R --> O["Explain refusal<br/>and recovery action"]
    O --> B
```

`Advance to PREPARING` and `Add track candidate` are not user actions. They are state-machine and cognition actions, and should not appear in the normal interface.

## 2. Professional desktop layout

A stable three-region workspace with a session timeline beneath it.

```mermaid
flowchart TB
    H["HEADER<br/>InterviewAssist · Practice Mode · Session State · Input Status · Accessibility"]

    subgraph W["MAIN WORKSPACE — responsive 12-column grid"]
        direction LR

        subgraph L["CONTEXT & COGNITION — 3 columns"]
            L1["Observed question"]
            L2["Detected constraints"]
            L3["Candidate tracks"]
            L4["Confirm / Reject / Correct"]
        end

        subgraph C["CODING WORKSPACE — 6 columns"]
            C1["Problem statement"]
            C2["Language and file tabs"]
            C3["Monaco editor"]
            C4["Run · Test · Stop"]
            C5["Console · Diagnostics · Diff"]
        end

        subgraph R["EVIDENCE & ASSISTANCE — 3 columns"]
            R1["Current objective"]
            R2["Visible test results"]
            R3["Authorized guidance"]
            R4["Execution status"]
            R5["Session evidence"]
        end
    end

    T["BOTTOM DRAWER<br/>Transcript · Event timeline · Receipts · Developer diagnostics"]

    H --> W --> T
```

| Region | User-facing purpose |
|---|---|
| Header | Orientation: mode, state, audio/transcript status, accessibility |
| Left | What InterviewAssist thinks is happening |
| Center | Where the candidate solves the problem |
| Right | What happened, what is authorized, and what to do next |
| Bottom drawer | Transcript, event history, receipts, and technical diagnostics |

Raw capability identifiers shown as buttons belong in the developer diagnostics drawer, not the interview workspace.

## 3. Proposed screen structure

```mermaid
flowchart TD
    PAGE["InterviewAssist Session"]

    PAGE --> HEADER["SessionHeader"]
    PAGE --> MAIN["SessionWorkspace"]
    PAGE --> DRAWER["SessionActivityDrawer"]

    HEADER --> MODE["ModeBadge"]
    HEADER --> STATE["SessionState"]
    HEADER --> INPUT["InputStatus"]
    HEADER --> ACCESS["AccessibilityMenu"]

    MAIN --> COG["CognitionPanel"]
    MAIN --> EDITOR["CodingPanel"]
    MAIN --> EVIDENCE["EvidencePanel"]

    COG --> PROMPT["ObservedPrompt"]
    COG --> TRACKS["TrackCandidateList"]
    COG --> CONFIRM["TrackConfirmation"]
    COG --> WHY["WhyThisTrack"]

    EDITOR --> PROBLEM["ProblemHeader"]
    EDITOR --> TABS["WorkspaceTabs"]
    EDITOR --> MONACO["MonacoEditor"]
    EDITOR --> TOOLBAR["ExecutionToolbar"]
    EDITOR --> OUTPUT["OutputTabs"]

    EVIDENCE --> OBJECTIVE["CurrentObjective"]
    EVIDENCE --> TESTS["TestResults"]
    EVIDENCE --> GUIDANCE["AuthorizedGuidance"]
    EVIDENCE --> STATUS["ExecutionStatus"]

    DRAWER --> TRANSCRIPT["Transcript"]
    DRAWER --> EVENTS["EventTimeline"]
    DRAWER --> RECEIPTS["ReceiptInspector"]
    DRAWER --> DEBUG["DeveloperDiagnostics"]
```

## 4. Session state machine

Visible, but not manually operated.

```mermaid
stateDiagram-v2
    [*] --> Created

    Created --> Preparing: first valid interview event
    Created --> Refused: admission denied

    Preparing --> Observing: input source available
    Observing --> Hypothesizing: question evidence detected

    Hypothesizing --> Clarifying: confidence below threshold
    Clarifying --> Hypothesizing: reject or correct
    Clarifying --> Confirmed: candidate confirms

    Hypothesizing --> Confirmed: confidence and policy permit

    Confirmed --> Solving: workspace projected
    Solving --> Executing: run or test
    Executing --> Solving: diagnostics returned
    Executing --> Verifying: candidate requests completion

    Verifying --> Solving: tests fail
    Verifying --> Completed: evidence admitted

    Created --> Refused
    Preparing --> Refused
    Observing --> Refused
    Solving --> Refused

    Completed --> [*]
    Refused --> [*]
```

Compact indicator: `Observing → Hypothesizing → Confirming → Solving → Verifying`. Only the current state and immediately relevant next action should be emphasized.

## 5. Eliza-style cognition panel

Instead of `Add track candidate`, a meaningful cognition surface:

```mermaid
flowchart TD
    Q["Observed question:<br/>Find two values that sum to a target"]

    Q --> C1["Hash-map complement lookup<br/>78%"]
    Q --> C2["Two-pointer search<br/>14%"]
    Q --> C3["Nested scan<br/>8%"]

    C1 --> ASK["Is this a Two Sum-style<br/>array problem?"]

    ASK --> YES["Yes"]
    ASK --> NO["No"]
    ASK --> CORRECT["Correct the interpretation"]

    YES --> ACCEPT["Track confirmed"]
    NO --> REVISE["Remove candidate<br/>and recalculate"]
    CORRECT --> EVIDENCE["Add correction evidence"]

    REVISE --> Q
    EVIDENCE --> Q
```

### Grounded correction and decision

The currently wired Eliza call returns one keyword-matched `selected`/`explanation` pair, not a percentage-ranked candidate list. The 78%/14%/8% values above remain the target UX, not current runtime behavior. The current `CognitionPanel` renders one proposed track with Yes/No/Correct.

[ADR-001](../jira/v26.7.24/DECISIONS.md) resolves the implementation design:

```text
deterministic TypeScript scoring
  → ABI Candidate[]
  → real Dendral elimination and highest-survivor selection
  → real Eliza clarification question
```

TypeScript derives scores from admitted free-text evidence. Dendral supplies real breed provenance for elimination and survivor selection. Eliza supplies the scoped question text. This branch documents the decision but does not implement it.

## 6. Keyboard and screen-reader flow

```mermaid
flowchart LR
    A["Skip to current task"] --> B["Session status"]
    B --> C["Cognition question"]
    C --> D["Track choices"]
    D --> E["Problem statement"]
    E --> F["Editor"]
    F --> G["Run / Test / Stop"]
    G --> H["Execution result"]
    H --> I["Visible tests"]
    I --> J["Authorized guidance"]
    J --> K["Session actions"]
```

Accessibility contract — semantic landmarks:

```text
<header>   session identity and state
<nav>      workspace files and sections
<main>     active interview task
<aside>    cognition and evidence panels
<footer>   session controls
```

Behavioral requirements: visible focus indicator on every interactive control; no state change triggered by focus alone; execution results announced through a polite live region; refusals and fatal execution errors announced as alerts; focus returns to the initiating control after ordinary actions; after a track question appears, focus moves to its heading — not directly to Yes; editor shortcuts do not trap keyboard-only users; motion/density/contrast/captions/audio controls live in one accessible preferences dialog altering the same canonical state projection, not a parallel workflow.

## 7. Control-replacement table

| Current surface | Production replacement |
|---|---|
| `Advance to PREPARING` | Automatic transition after an admitted event |
| `Refuse session` | Session menu → End or refuse session |
| `Trigger admission refusal (demo)` | Developer diagnostics only |
| `No problem data yet` | Empty-state card explaining what input is awaited |
| `Add track candidate` | Automatic cognition output |
| Raw `editor/*` buttons | Editor toolbar, command palette, or diagnostics drawer |
| Plain textarea | Monaco with a plain-text accessibility fallback |
| Separate contradictory exit messages | One authoritative execution-result card |
| Sixteen inline accessibility checkboxes | Accessibility preferences dialog with profiles |
| `Finish session` | Contextual Submit for verification or End practice session |

## 8. Responsive behavior

```mermaid
flowchart TD
    D["Desktop ≥ large viewport"] --> D1["Three-column workspace"]
    T["Tablet / narrow laptop"] --> T1["Cognition drawer + editor + evidence drawer"]
    M["Mobile / high magnification"] --> M1["Single-column task flow"]

    D1 --> S["Persistent editor and evidence"]
    T1 --> S2["One secondary panel visible at a time"]
    M1 --> S3["Cognition → problem → editor → result sequence"]
```

## Immediate UI acceptance test

The redesigned first slice is complete when a user can:

1. Open InterviewAssist in practice mode.
2. Submit or replay an interview utterance.
3. See a track proposed by real `wasm4pm-cognition`.
4. Confirm or reject the track using keyboard only.
5. Receive the projected Python problem.
6. Write and run Python.
7. Read a single coherent execution result.
8. See tests and diagnostics.
9. Complete the session without using any manual phase-transition control.
10. Replay the session and reproduce the same visible state.

The professional interface is built around **cognition → confirmation → coding → evidence**, not around the internal capability inventory.

## See also

- [ADR-001](../jira/v26.7.24/DECISIONS.md)
- [Unfinished work](unfinished-work.md)
- [Cognition sequence](sequence-cognition.md)
- [Priority matrix](../jira/v26.7.24/README.md)
