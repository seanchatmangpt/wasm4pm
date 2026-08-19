# wasm4pm LinkedIn RevOps Strategy

## Standing and claim ceiling

`wasm4pm` is the process-execution and evidence layer for the LinkedIn RevOps experiment. Its observed capabilities include process discovery, conformance, XES/object-centric event handling, POWL execution, replay, and receipt manufacture. It is therefore classified **REVOPS ANALYTICS / PARTIAL_ALIVE** for this strategy.

It does not own LinkedIn publication, CRM mutation, lead capture, or sales authority.

## Role in the revenue system

```text
LinkedIn + assessment + CRM observations
  -> canonical event/object export
  -> wasm4pm discovery / conformance
  -> variant + bottleneck analysis
  -> replayable evidence
  -> process improvement candidates
```

The upstream research contract lives in `process-intelligence`; wasm4pm executes against admitted datasets and exact process models.

## Object-centric RevOps model

The execution dataset should preserve relationships among:

```text
Person
Account
Campaign
ContentAsset
Assessment
Problem
Opportunity
POV
Outcome
```

Examples of events include `PublicationObserved`, `LeadCaptured`, `AssessmentCompleted`, `MQLAdmitted`, `SQLAdmitted`, `POVAccepted`, `OutcomeVerified`, and `CustomerWon`.

One Account can participate in multiple content touches, people, assessments, and opportunities; object-centric analysis should preserve those relations rather than forcing a single synthetic case ID.

## August 31 execution profile

For `campaign=10k_august_2026`, wasm4pm should answer:

- Which content assets actually precede assessment completion?
- Which process variants produce SQL and POV progression?
- Where are the longest waiting times and manual handoffs?
- Which prospects loop between stages?
- Which stage promotions violate the reference qualification process?
- What proportion of pipeline and realized revenue can be traced to an exact originating campaign/content object?
- How many manual synchronization events are required per qualified outcome?

## Conformance law

The reference process should treat unjustified promotions as violations, including:

```text
EngagementObserved -> SQLAdmitted
LeadCaptured -> POVAccepted
POVExecuted -> CustomerWon without OutcomeVerified
RevenueAttributed without Campaign/ContentAsset provenance
```

A process variant may be unusual without being invalid. Conformance rules should distinguish lawful alternatives from evidence-breaking transitions.

## Evidence and privacy

Revenue traces may contain PII and commercially sensitive data. Inputs and receipts should minimize person-level fields, use stable opaque identifiers where possible, and avoid embedding credentials, message bodies, or unnecessary personal data in immutable evidence.

Every analytical claim must bind the dataset identity, exact wasm4pm subject, algorithm/profile, process model identity, verifier, and output digest. A result against one snapshot cannot be borrowed by another.

## DfCM improvement loop

Use observed process topology to generate reversible improvement candidates rather than automatically actuating sales workflows:

```text
OBSERVE
-> DISCOVER
-> CONFORMANCE
-> BOTTLENECK / VARIANT FINDING
-> SELECT candidate improvement
-> CONSTRUCT change intent
-> external authority boundary
```

wasm4pm must not turn a bottleneck finding into outbound sales action.

## Next admitted increments

1. Add a canonical LinkedIn RevOps OCEL fixture generated from the process-intelligence contract.
2. Add the admitted reference funnel/POWL model and conformance assertions.
3. Add process metrics for assessment conversion, qualification transitions, POV cycle time, rework loops, and synchronization events.
4. Add attribution lineage from ContentAsset and Campaign through Account/Opportunity/Outcome.
5. Add privacy-minimized receipt profiles for RevOps traces.
6. Add replay tests proving deterministic analytics against a fixed fixture.
7. Add a comparative oracle where useful for process discovery/conformance claims.

## Falsifiers

The LinkedIn RevOps execution claim fails if event/object identities cannot be reconstructed, conformance results depend on hidden manual interpretation, exact dataset identity is missing, or analysis silently equates engagement with qualification/revenue.

Success is a replayable process explanation of why qualified demand advanced, stalled, looped, or was refused.
