# ELIZA

## Origin
- **Paper:** "ELIZA — A Computer Program for the Study of Natural Language Communication Between Man and Machine" (1966)
- **Authors:** Joseph Weizenbaum
- **Tradition:** Pattern matching, symbolic AI, natural language processing

## Algorithm
ELIZA matches a lowercased user intent against an ordered list of wildcard patterns, longest-pattern first. Each pattern uses `*` as a greedy slot capture over whitespace-delimited tokens. On the first match, captured slot values are bound positionally and substituted into a response template using `${1}`, `${2}`, ... placeholders. If no custom patterns are supplied via `facts`, a built-in Rogerian script is used as the default frame set.

## Pseudocode
```
function run(input):
    frames = parse_frames(input.facts)  // facts with key=="frame.pattern", "pattern||template"
    if frames is empty: frames = default_rogerian_frames()
    sort frames by descending pattern length   // more specific before catch-all *

    text = lowercase(input.intent)
    for each frame in frames:
        record TraceStep("try-pattern", frame.pattern)
        slots = try_match(frame.pattern, text)
        if slots is not None:
            response = render(frame.template, slots)
            record TraceStep("match-pattern", frame.pattern)
            for each slot: record TraceStep("bind-slot", "${i}=slot")
            return BreedOutput(selected=frame.pattern, explanation=response)
    return BreedOutput(selected=None, explanation="No pattern matched.")
```

## Input contract
- `intent`: the user utterance to match (lowercased internally); must be non-empty or `preconditions` rejects
- `facts`: optional custom frame definitions; each `Fact { key="frame.pattern", value="<pattern>||<template>" }` registers one frame; if absent, default Rogerian frames apply
- `rules`: not used by this breed
- `goals`: not used by this breed
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: the matched pattern string (e.g. `"i am *"`) when a match fires; `None` if no pattern matched
- `explanation`: the fully rendered response with slot values substituted, or `"No pattern matched."`
- `inference_trace`: one `"try-pattern"` step per frame attempted, followed by a `"match-pattern"` step and one `"bind-slot"` step per captured slot on the successful frame; postcondition requires at least one trace step

## Complexity
- Time: O(F × T) where F = number of frames and T = number of tokens in the intent; the wildcard matching is linear in tokens for non-branching patterns
- Space: O(F + T) for the frame list and per-step bindings
- Determinism: yes — longest-pattern sort is stable; first match always wins

## Generalization examples
- **Customer support routing**: facts encode support scripts (`"i need *||Let me transfer you to ${1} support"`); intent is the customer message; selected returns the matched topic label
- **Process mining intent classification**: facts encode XES attribute phrases; ELIZA classifies a natural-language query ("I need remaining time prediction") into a prediction task label without a separate NLP model

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: stub gate — zero-digest evidence strings that pass gate flags are still detected; bounded registry — registry cannot grow beyond `BoundedRegistry::capacity_limit()` even under repeated insert
- Property tests: `postconditions` rejects an empty `inference_trace` (a breed that matched nothing but recorded no attempts is a fraud signal)

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/frame.rs` for source
