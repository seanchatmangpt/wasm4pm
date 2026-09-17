<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/examples/out/truex_replay_valid.md; source-sha256: 4e475acd7a048ccff5ba236e2e8e719d0c9f9480dc7d4c34d19168a6b6a6e048; reason: tooling or agent control surface -->


# Truex Capture: App State to Admitted Execution Receipt
**Run**: valid  
**Status**: `ReceiptAdmitted`  
**Trace ID**: `b04fe629005a0601cea1c1c1b7263983`  
**Receipt Hash**: `5347576487730d716e0d3998547f2d8eae77caeb1d44a570f2fc023e725b62a9`  

## Expected Path Constraints
Hash: `5548b5fcac3109bcc176bad6f91e1408cbef34e87b1cba6cdf55a672f64b5694`

## State Diagram Replay
```mermaid
stateDiagram-v2
  idle --> cart_updated
  cart_updated --> address_added
  address_added --> processing
  processing --> paid


```

## OTLP Payload Details
This payload was wrapped in a Truex envelope and egressed via OpenTelemetry.
    