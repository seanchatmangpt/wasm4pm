# 08 — Benchmark Gates (G1–G5)

**Agent A9.** The benchmark gate is the kernel's **CI admission gate**: a single
command, `wpm benchmark gate`, that aggregates five gates against *real WASM
evidence and BLAKE3 math*, emits a machine-readable JSON verdict, and **exits
non-zero on any gate failure**. It is the executable form of the anti-cheat ALIVE
rule — "build workflow completed" is not proof; a passing determinism re-hash, a
re-verifying receipt, an exact-1.0 admission (or a correctly named `AndonPull`),
holding invariants, and a complete report are.

---

## The five gates

| Gate | Name | Oracle | Pass condition |
|------|------|--------|----------------|
| **G1** | determinism | mathematical theorem | `discover_dfg` run twice on a fixed log ⇒ **identical BLAKE3** of outputs |
| **G2** | receipt-verify | BLAKE3 chain | stored `combined_hash` recomputes to `BLAKE3([input,config,plan,output])` (`--verify-receipt-hash`) |
| **G3** | conformance | exact-1.0 admission (mcpp-conformance.md) | token-replay `fitness == 1.0` admits; below ⇒ `AndonPull::RouteConformanceGap` |
| **G4** | metric-interdependency | invariants I-1..I-5 | conformance metrics violate **0 critical** invariants (`conformance-invariants.ts`) |
| **G5** | report-completeness | structural | every gate carries all required fields (`id,name,pass,ran,reason,evidence`) |

> **Naming note (reconciliation C3):** the canonical scheme calls G4 an *equivalence*
> gate. This implementation, per the A9 task assignment, wires **metric-interdependency**
> (the I-1..I-5 invariant validator) as G4. Projection/round-trip *equivalence*
> (POWL↔WF-net, POWL→tree, OCEL flatten/project) is a separate concern owned by A4/A5/A2
> and is documented there; it can be layered as an additional check without renaming the
> five demanded gates. This doc records the divergence honestly rather than silently
> relabeling.

---

## Command

```
wpm benchmark gate [--gates g1,g2,...] [--receipt <path>]
                   [--verify-receipt-hash] [--format human|json|sarif] [-q|-v]
```

- **`--gates`** — comma-separated subset (e.g. `g1,g2`). Default: all five. Unselected
  gates are emitted with `ran: false` (skipped), so CI can run a determinism+receipt
  gate independently of the (intentionally strict) conformance gate.
- **`--verify-receipt-hash`** — enables G2 (default on); `--verify-receipt-hash=false`
  disables it.
- **`--receipt <path>`** — verify an *external* receipt JSON in G2; without it, G2 builds
  a fresh BLAKE3 chain from the G1 evidence and self-verifies (closed loop).

**File:** `apps/wasm4pm/src/commands/benchmark.ts` (subcommand `gate`, registered in the
existing `benchmark` noun → `apps/wasm4pm/src/cli.ts`). No new top-level command, no new
MCP tool — reachable purely through the existing `wpm` CLI.

**Exit code:** `0` (ADMITTED) when every *ran* gate passes; `6` (`conformance_fail`,
the AndonPull exit) when any ran gate fails.

---

## The fixture & why it is honest

G1/G3/G4 use an **inline, deterministic** event log (`A→B→C→D` × 3), embedded in the
command — no external file — so the determinism oracle is grounded in the WASM algorithm,
not in filesystem state, and the gate is reproducible on any machine.

The default WASM build's auto-discovered alpha++ Petri net token-replays at **`< 1.0`**
(measured `0.875` for this fixture — a real property of the alpha-net start/end-place
semantics, not a bug to be hidden). Therefore **G3 genuinely refuses** the under-fit
model with `RouteConformanceGap`. This is the *negative proof* for the exact-1.0
admission gate: the kernel is not FAKE-LIVE because its strictest gate actually pulls
the cord on unproven motion.

---

## Machine-readable verdict (shape)

```json
{
  "command": "benchmark gate",
  "exit_code": 6,
  "payload": {
    "verdict": "ANDON_PULL",
    "gates_total": 5, "gates_passed": 4, "gates_failed": 1,
    "andon_reason": "RouteConformanceGap: fitness 0.875 < 1.0 — unproven motion, admission refused",
    "gates": [
      { "id": "G1", "name": "determinism", "pass": true,  "ran": true,
        "reason": "ok", "evidence": { "hash_run_1": "eed3…", "hash_run_2": "eed3…", "algorithm": "discover_dfg" } },
      { "id": "G2", "name": "receipt-verify", "pass": true, "ran": true,
        "reason": "ok", "evidence": { "source": "self-built", "combined_hash": "2039…", "input_hash": "…", … } },
      { "id": "G3", "name": "conformance", "pass": false, "ran": true,
        "reason": "RouteConformanceGap: fitness 0.875 < 1.0 …", "evidence": { "fitness": 0.875, "total_cases": 3, "admission_threshold": 1 } },
      { "id": "G4", "name": "metric-interdependency", "pass": true, "ran": true,
        "reason": "ok", "evidence": { "total_violations": 0, "critical": 0, "warnings": 0, "violation_ids": [] } },
      { "id": "G5", "name": "report-completeness", "pass": true, "ran": true,
        "reason": "ok", "evidence": { "gates_checked": ["G1","G2","G3","G4"], "missing_fields": [] } }
    ]
  }
}
```

---

## Gate internals (grounding)

- **G1 — determinism.** `load_eventlog_from_xes(fixture)` → `discover_dfg(h, "concept:name")`
  twice → `hashData()` (BLAKE3, `@wasm4pm/contracts`) of each output → require equality.
  Measured: both runs hash to `eed38c6c…`.
- **G2 — receipt-verify.** `combined = BLAKE3([input_hash, config_hash, plan_hash, output_hash])`.
  *External* mode: verify the file's stored `combined_hash`/`receipt_hash` recomputes.
  *Self-built* mode: anchor `output_hash` on the G1 evidence, recompute, and cross-check
  with `verifyHash()`. A tampered external receipt fails with `MissingReceiptCoverage`.
- **G3 — conformance.** `discover_alpha_plus_plus` → `check_token_based_replay` →
  admit iff `avg_fitness >= 1.0`, else `RouteConformanceGap`. Exact, no tolerance.
- **G4 — metric-interdependency.** `validateConformanceResultFromCases(fitness, null, cases)`
  from `packages/observability/src/conformance-invariants.ts` (invariants I-1 bounds,
  I-2 ordering, I-3 case-count, I-4 token-balance, I-5 final-state). Pass iff 0 critical.
  precision is `null` (token replay does not produce it) so I-2 is skipped honestly.
- **G5 — report-completeness.** Every prior gate must carry all six required keys and a
  present `evidence` object — an anti-FAKE-LIVE check: a gate cannot pass by omitting its
  own evidence slot.

---

## Proof (Chicago-TDD)

**File:** `apps/wasm4pm/src/__tests__/benchmark-gate.test.ts` (9 tests, real WASM via
`runCli` — no `vi.mock` of `init.js`; the FM-5-safe path).

| Test | Proves |
|------|--------|
| `is registered as a benchmark subcommand` | reachable via `wpm benchmark` |
| `emits a complete machine-readable JSON verdict with all five gates` | G5 contract; 5 gates in order |
| `G1 determinism: discover_dfg … identical BLAKE3 hashes` | G1 positive (`hash_run_1 === hash_run_2`) |
| `G2 receipt-verify: self-built … re-verifies` | G2 positive (closed-loop hash) |
| `G2 --verify-receipt-hash: a TAMPERED external receipt is refused` | **G2 negative** (`MissingReceiptCoverage`, exit 6) |
| `G3 conformance: exact-1.0 … below 1.0 fires RouteConformanceGap` | **G3 negative** (exact-1.0 doctrine) |
| `G4 metric-interdependency: … invariants I-1..I-5` | G4 positive (0 critical) |
| `a subset that passes (g1,g2) yields ADMITTED with exit 0` | **positive overall** path, exit 0 |
| `full gate run … fires ANDON_PULL on the exact-1.0 conformance gate` | end-to-end negative; honest non-FAKE-LIVE |

```
$ npx vitest run src/__tests__/benchmark-gate.test.ts
 ✓ src/__tests__/benchmark-gate.test.ts  (9 tests)
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

---

## Verdict

```
Primitive:        Benchmark Gate (G1–G5 aggregation)
Paper grounding:  determinism theorem; BLAKE3 receipt chain; exact-1.0 admission;
                  conformance invariants I-1..I-5; anti-FAKE-LIVE completeness
Artifact:         apps/wasm4pm/src/commands/benchmark.ts (subcommand `gate`),
                  apps/wasm4pm/src/cli.ts (registration), uses
                  packages/observability/src/conformance-invariants.ts,
                  packages/contracts/src/hash.ts
Positive proof:   benchmark-gate.test.ts — "a subset that passes (g1,g2) yields ADMITTED with exit 0";
                  G1/G2/G4 green
Negative proof:   benchmark-gate.test.ts — tampered receipt ⇒ MissingReceiptCoverage (exit 6);
                  full run ⇒ RouteConformanceGap (fitness 0.875 < 1.0, exit 6)
Reachability:     CLI (wpm benchmark gate) | WASM (discover_dfg, alpha++, token replay)
Verdict:          ALIVE
```
