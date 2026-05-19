# Canonical Token-Replay Fitness Formula

wasm4pm uses the **van der Aalst two-component weighted formula**:

```
fitness = 0.5 × (1 − missing / max(1, consumed))
        + 0.5 × (1 − remaining / max(1, produced))
```

where:
- `missing` = tokens consumed by transitions that were not available (added artificially)
- `consumed` = total tokens consumed during replay
- `remaining` = tokens left in non-sink places after replay
- `produced` = total tokens produced during replay

## Why max(1, ·)?

Prevents division by zero on empty traces or empty nets. For an empty trace replayed
against a net with no transitions fired: consumed=0, produced=0, missing=0, remaining=0 →
fitness = 0.5×(1−0/1) + 0.5×(1−0/1) = 1.0. This is the correct identity — an empty trace
perfectly conforms to any net that starts and ends in the same marking.

## Note on alternative formulas

A common single-fraction variant `1 − (missing + remaining) / (consumed + produced)` is
mathematically distinct and gives different values on deviating traces. The single-fraction
variant is NOT used in wasm4pm. Every benchmark, test, and comparison result in this project
uses the two-component formula above.

## Threshold justification

| Algorithm | Fitness threshold | Rationale |
|-----------|------------------|-----------|
| dfg | 0.95 | DFG replays exactly; low fitness indicates log quality issues |
| inductive_miner | 0.85 | Guaranteed sound model; fitness reflects real log conformance |
| heuristic_miner | 0.70 | Approximate discovery; some deviation is expected |
| alpha_plus_plus | 0.60 | Structural algorithm; incomplete models accepted |
| genetic_algorithm | 0.75 | Stochastic convergence; variance in quality expected |
| (default) | 0.80 | Conservative baseline for algorithms not listed above |
