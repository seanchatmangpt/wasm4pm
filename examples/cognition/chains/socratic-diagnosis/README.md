# Socratic Diagnosis — Breed Chain Case Study

A 7-stage clinical reasoning pipeline that mirrors the complete Socratic diagnostic method: interview, semantic parsing, affect modeling, differential diagnosis, treatment planning, plan sequencing, and case retention.

## Domain

Clinical intake and diagnosis. A patient presents with an utterance ("I have been feeling hot and I keep coughing a lot"). Seven AI breeds in sequence extract symptoms, parse physiological semantics, model affect/urgency, produce a ranked differential, select treatment operators, sequence them into a legal plan, and retain the case for future retrieval.

## Breed Chain Diagram

```
eliza --> autoinstinct_semantics --> autoinstinct_neurosis --> mycin --> gps --> strips --> cbr
```

## Stage Transitions

**eliza -> autoinstinct_semantics**
ELIZA extracts matched symptom keywords (fever, cough) from the patient utterance via keystack patterns. The transformer reads confirmed symptom facts and constructs a symptom narrative string for CD primitive parsing.

**autoinstinct_semantics -> autoinstinct_neurosis**
autoinstinct_semantics maps each symptom to a Conceptual Dependency primitive (ATRANS for fever, EXPEL for cough, PTRANS for pathogen hypothesis). The transformer forwards CD primitive facts and symptom count to the affect model.

**autoinstinct_neurosis -> mycin**
autoinstinct_neurosis accumulates a paranoia score from symptom count, duration, and PTRANS threat signal, then classifies urgency. The transformer forwards urgency_level, paranoia_score, and all symptom/CD facts into the MYCIN evidence base.

**mycin -> gps**
MYCIN backward-chains over symptom facts with certainty factors, producing a ranked differential (influenza as top candidate with CF ~0.72). The transformer picks the top uneliminated candidate and its CF score as the GPS start state.

**gps -> strips**
GPS performs means-ends analysis: for each difference between sick-state and healthy-goal, it selects a reducing operator (antiviral, antipyretic, fluids, rest). The transformer reads selected operators from the GPS candidate list and emits operator_* facts for STRIPS.

**strips -> cbr**
STRIPS sequences the unordered operator set into a legal plan respecting precondition/add/delete lists and frame axioms. The transformer extracts the plan_sequence and all accumulated facts (diagnosis, CF, symptoms, CD primitives, paranoia) for CBR retention.

## How to Run

```bash
bash chain.sh
```

The script auto-detects `wpm` in PATH or falls back to `$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js`.

## Expected Final Output

```
Stage 0 [eliza]: ok / hash=<16-char hash>
Stage 1 [autoinstinct_semantics]: ok / hash=<16-char hash>
Stage 2 [autoinstinct_neurosis]: ok / hash=<16-char hash>
Stage 3 [mycin]: ok / hash=<16-char hash>
Stage 4 [gps]: ok / hash=<16-char hash>
Stage 5 [strips]: ok / hash=<16-char hash>
Stage 6 [cbr]: ok / hash=<16-char hash>

=== Chain complete: 7/7 stages ok ===
```

Each `result.json` is saved to `stages/N-<breed>/result.json`. The final CBR result contains the retained case indexed by Jaccard-comparable symptom features, with `diagnosis=influenza`, treatment plan, and certainty factor encoded as the outcome.
