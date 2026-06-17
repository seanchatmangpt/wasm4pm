# factory-agent — Breed Chain Case Study

**Domain:** Intelligent factory floor agent — full incident lifecycle from perception to operator debrief.

A machine overheats on the factory floor. This chain walks a 13-breed pipeline from raw sensor perception through diagnosis, planning, safety validation, cognitive load monitoring, case retention, and finally plain-language operator explanation.

## Breed Chain Diagram

```
autoinstinct_vision
        |
        | machine states + bottleneck facts
        v
autoinstinct_semantics
        |
        | CD primitives (PTRANS/ATRANS) for operator routing command
        v
hearsay
        |
        | fused sensor hypotheses (overheating confirmed, pressure, throughput)
        v
mycin
        |
        | certainty-factor diagnosis (dx_coolant_failure CF~0.92)
        v
gps
        |
        | means-ends operator sequence (coolant_flush → feed_adjust)
        v
strips
        |
        | STRIPS action plan with frame axioms and precondition checks
        v
autoinstinct_learning
        |
        | bitmask-optimized plan selection (plan_B chosen, plan_A eliminated)
        v
soar
        |
        | preference resolution (tie broken → strategy_parallel_coolant_repair)
        v
dendral
        |
        | generate-and-test root-cause enumeration (pump_seized ranked #1)
        v
prolog
        |
        | safety constraint unification (plan_valid proven, lockout satisfied)
        v
autoinstinct_neurosis
        |
        | cognitive load classification (overload detected, escalation queued)
        v
cbr
        |
        | case retrieval + retention (2 similar past cases, new case #48 retained)
        v
eliza
        |
        | operator-facing plain-language debrief
        v
     [done]
```

## Data Flow Between Stages

**vision → semantics:** Machine state facts (running/blocked/idle per machine) flow forward. Semantics uses the blocked/idle state to enrich the routing command context.

**semantics → hearsay:** Parsed PTRANS/ATRANS candidates and machine-state facts seed the blackboard. Hearsay fuses these with sensor readings to build production-state hypotheses.

**hearsay → mycin:** Top hypotheses (overheating confirmed) plus sensor fact values become symptom facts for MYCIN certainty-factor rules.

**mycin → gps:** The diagnosed root cause (`dx_coolant_failure`) and current vs target KPI values (temp, throughput) drive means-ends analysis operator selection.

**gps → strips:** GPS's ordered operator list becomes the planning goal for STRIPS, which adds frame axioms and verifies preconditions (machine must be stopped before flush).

**strips → autoinstinct_learning:** The STRIPS action sequence and goal set feed the bitmask optimizer, which selects the minimum-cost plan satisfying all goals.

**autoinstinct_learning → soar:** The best plan candidates flow into SOAR preference resolution, which detects a tie between two strategies and creates a subgoal to resolve it via operator preference.

**soar → dendral:** The selected strategy and confirmed diagnosis serve as constraints for DENDRAL's generate-and-test enumeration of physical root-cause explanations.

**dendral → prolog:** The top-ranked explanation (pump seized) and the planned action sequence are handed to Prolog for safety rule unification and lockout-tagout verification.

**prolog → autoinstinct_neurosis:** The validated plan status flows into neurosis monitoring, which assesses operator cognitive load given the active alarm count and response metrics.

**autoinstinct_neurosis → cbr:** The escalation flag and load level annotate the incident record before CBR retrieves similar past cases and retains the current incident.

**cbr → eliza:** The retrieved similar cases and full incident summary (diagnosis, resolution, escalation, batch status) give ELIZA the context to generate a plain-language operator debrief.

## How to Run

```bash
bash /Users/sac/wasm4pm/examples/cognition/chains/factory-agent/chain.sh
```

The script auto-detects `wpm` from `PATH` or falls back to `$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js`.

Each stage prints:
```
Stage N [breed]: ok / hash=<first 16 chars of output_hash>
```

## Expected Final Output

```
Stage 0 [autoinstinct_vision]: ok / hash=<hash>
Stage 1 [autoinstinct_semantics]: ok / hash=<hash>
Stage 2 [hearsay]: ok / hash=<hash>
Stage 3 [mycin]: ok / hash=<hash>
Stage 4 [gps]: ok / hash=<hash>
Stage 5 [strips]: ok / hash=<hash>
Stage 6 [autoinstinct_learning]: ok / hash=<hash>
Stage 7 [soar]: ok / hash=<hash>
Stage 8 [dendral]: ok / hash=<hash>
Stage 9 [prolog]: ok / hash=<hash>
Stage 10 [autoinstinct_neurosis]: ok / hash=<hash>
Stage 11 [cbr]: ok / hash=<hash>
Stage 12 [eliza]: ok / hash=<hash>

=== Chain complete: 13/13 stages ok ===
```

The final ELIZA stage produces a plain-language operator debrief explaining the coolant pump seizure, the partial-stop flush resolution (90 min downtime), batch A resumption at station 3, and supervisor escalation — with reassurance due to detected cognitive overload.
