# Dempster-Shafer Theory

## Origin
- **Paper:** "A Mathematical Theory of Evidence" (Shafer, 1976)
- **Authors:** Glenn Shafer (building on Arthur P. Dempster)
- **Tradition:** Evidential Reasoning, Uncertainty Management, Belief Functions

## Algorithm
Dempster-Shafer theory combines belief mass distributions over subsets of hypotheses.
1. Group the rules (which represent basic probability assignments/masses) by their source identifier.
2. Initialize the hypotheses mapping (mapping names to u8 bits, max 8 hypotheses).
3. Compute the implicit ignorance mass (the remaining mass to reach 1.0) and assign it to the frame of discernment (the set of all hypotheses).
4. Combine the mass functions of the sources pairwise using Dempster's rule of combination:
   $m_{1+2}(A) = \frac{1}{1-K} \sum_{B \cap C = A} m_1(B) m_2(C)$
   where $K$ is the conflict factor:
   $K = \sum_{B \cap C = \emptyset} m_1(B) m_2(C)$
5. If $K \ge 1.0$, return a complete conflict error.
6. Calculate belief (Bel) and plausibility (Pl) for query hypotheses.
   - Bel(A) = sum of masses of subsets of A.
   - Pl(A) = sum of masses of subsets intersecting A.

## Pseudocode
```
function run(input):
    mapping = map_hypotheses(input.rules)
    sources = group_by_source(input.rules)
    
    current_bpa = sources.first()
    for next_bpa in sources.rest():
        combined = {}
        conflict = 0.0
        for (a, m1) in current_bpa:
            for (b, m2) in next_bpa:
                if a and b don't overlap:
                    conflict += m1 * m2
                else:
                    combined[a intersection b] += m1 * m2
        if conflict >= 1.0:
            return Err("K=1 conflict")
        for key in combined:
            combined[key] /= 1.0 - conflict
        current_bpa = combined
        
    query = parse_query(input.goals)
    bel = sum(mass for (sub, mass) in current_bpa if sub is subset of query)
    pl = sum(mass for (sub, mass) in current_bpa if sub intersects query)
    return bel, pl
```

## Input contract
- `intent`: not used
- `facts`: not used
- `rules`: represents basic probability assignments (certainty factor as mass, conclusion as hypotheses subset, id as source).
- `goals`: contains a query goal (`predicate = "query"` or `id = "query"`) with the target hypothesis subset in `value`.
- `cases`: not used
- `state`: not used
- `candidates`: passed through unchanged

## Output contract
- `selected`: `Bel=<bel>, Pl=<pl>` representation of the results.
- `explanation`: string detailing the query, belief, plausibility, and frame.
- `inference_trace`: trace steps recording `"ds-load-bpa"`, `"ds-combine"`, and `"ds-belief"`.

## Complexity
- Time: $O(S \cdot 2^{2H})$ where $S$ is the number of sources and $H$ is the number of hypotheses (max 8).
- Space: $O(2^H)$ for keeping track of the mass distributions.

## Generalization examples
- **Sensor Fusion**: Combining conflictual diagnostic messages from multiple sensors (e.g. lidar and camera) regarding obstacles.
- **Medical Diagnosis**: Fusing opinions of different specialists on a set of potential diseases.

## Adversarial coverage
- Precondition rejects if rules (BPAs) are empty or query goal is missing.
- Postcondition validates that the trace is not empty.
- Complete conflict factor ($K \ge 1.0$) raises a typed refusal error.
