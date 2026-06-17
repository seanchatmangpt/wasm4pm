# scientific-discovery — Breed Chain Case Study

## Domain

Computational organic chemistry: identify an unknown compound with molecular formula **C6H12O**
by fusing multi-source spectrometry data (MS, NMR, IR) through a six-stage cognitive pipeline
that mirrors classic AI chemistry programs — DENDRAL, Prolog constraint propagation, X-ray
crystallography scene parsing, STRIPS experiment planning, and SOAR preference resolution.

## Breed Chain

```
hearsay
  → dendral
      → prolog
          → autoinstinct_vision
              → autoinstinct_learning
                  → soar
```

## Stage Transitions

**hearsay → dendral**
The KSAR blackboard reconciles MS, NMR, and IR evidence into a ranked candidate list
(top: cyclohexanol, confidence 0.72). The transformer extracts functional-group constraints
(secondary alcohol, ring present, no carbonyl) and seeds the dendral enumeration.

**dendral → prolog**
DENDRAL generates 7 structural isomers of C6H12O consistent with ring-alcohol constraints.
The transformer carries all non-eliminated candidates and maps them to prolog pruning input
with spectral evidence facts (ms_base_peak=57, ir_oh=true, nmr_secondary_carbon_oh=true).

**prolog → autoinstinct_vision**
Prolog SLD resolution eliminates the ether ring (oxacycloheptane) and the primary alcohol
(cyclopentyl_methanol), leaving 5 conforming candidates. The transformer promotes the top
candidate to conformation variants (chair equatorial / chair axial OH) for crystallographic
scene parsing.

**autoinstinct_vision → autoinstinct_learning**
The vision scene parser assigns ring topology (6-membered chair, equatorial OH preferred)
from the electron density map. The transformer maps structural conformation findings to
experiment-plan candidates and sets ambiguity context for the STRIPS planner.

**autoinstinct_learning → soar**
The STRIPS/HACKER planner produces an ordered experiment sequence (NMR COSY → GC-MS →
MS/MS). The transformer remaps plan IDs to competing approach operators for SOAR preference
resolution.

## How to Run

```bash
bash chain.sh
```

The script auto-detects `wpm` from system PATH or
`<repo-root>/apps/wasm4pm/dist/bin/wpm.js`.

Each stage:
1. (If not stage 0) transforms the previous `result.json` into this stage's `intent.json`
2. Runs `wpm cognition run --contract <breed> --input intent.json --format json`
3. Saves `result.json`
4. Prints `Stage N [breed]: ok / hash=<first 16 of output_hash>`

## Expected Final Output

```
Stage 0 [hearsay]: ok / hash=<hash>
Stage 1 [dendral]: ok / hash=<hash>
Stage 2 [prolog]: ok / hash=<hash>
Stage 3 [autoinstinct_vision]: ok / hash=<hash>
Stage 4 [autoinstinct_learning]: ok / hash=<hash>
Stage 5 [soar]: ok / hash=<hash>

=== Chain complete: 6/6 stages ok ===
```

**Final conclusion:** cyclohexanol (chair conformation, equatorial OH) identified as the
canonical structure. SOAR preference resolution selects NMR COSY as the first validation
experiment (immediately available, non-destructive, resolves cis/trans stereoisomers). A
chunk is learned: IF stereo_ambiguity_present AND NMR_immediately_available THEN
prefer_NMR_COSY_before_GCMS. Confidence: 0.94.
