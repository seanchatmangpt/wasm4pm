<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/how-to/concept_drift.md; source-sha256: 33bb382cbf8fa2cb8296197426a6de64944af6441e3c1e2fcb42abc1ac93bcb7; reason: tooling or agent control surface -->

# How-To: Detect Concept Drift

## Goal
Identify moments in time where the underlying business process behavior fundamentally changed (Concept Drift).

## Steps

### 1. Set the Window Size
Drift detection compares a "reference" window of events against a "sliding" window. Determine an appropriate window size based on your event volume.

### 2. Run the Drift Detector
Execute the Bose concept drift algorithm:
```bash
wpm predict drift --window-size 500 -i continuous_log.xes
```

### 3. Analyze the Change Points
The output will list timestamp boundaries where the statistical distribution of the Directly-Follows Graph shifted beyond the threshold.

## Example

`examples/drift-detection.ts` demonstrates live EWMA drift detection with configurable window size and threshold:

```bash
tsx examples/drift-detection.ts data/small-example.xes 100 0.3
```
