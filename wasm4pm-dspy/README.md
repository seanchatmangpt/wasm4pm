# wasm4pm-dspy

A DSPy breed-selection compiler for wasm4pm's cognition kernel: it turns a free-text
goal into a real, executed run of one of the 55 classical-AI "breeds"
(`crates/wasm4pm-cognition`), never letting the language model act on its own authority.

## Calculus: SELECT → ADMIT → RUN

```
NL goal ──▶ SELECT (DSPy, optional) ──▶ ADMIT (deterministic, always) ──▶ RUN (real wpm CLI)
```

- **SELECT** (`signatures.py`, `program.py`) — a DSPy `propose → critique → repair`
  pipeline proposes a candidate `{breed, payload}` from a free-text goal, shown only
  the real 55-breed registry as its allowlist. This stage never has execution authority.
- **ADMIT** (`admission.py`, `registry.py`) — a pure function with **zero `dspy`
  import**. It independently re-checks the candidate against the same registry file
  the Rust kernel is generated from, and against the `BreedInput` schema's
  `deny_unknown_fields` contract. Refuses (`AdmissionRefused`) an unknown breed, a
  malformed payload, or any field the LM invented outside the schema. This is the sole
  gate deciding whether SELECT's output is trusted — matching the
  `benchmark-manufacturing/admission.py` precedent's discipline: *SELECT != DO*.
- **RUN** (`runner.py`) — shells out to the real, already-built `wpm lab cognition run`
  CLI (`apps/wasm4pm/dist/bin/wpm.js`), parses its result envelope, and independently
  re-derives the BLAKE3 receipt (`run_id == blake3(breed + "|" + output_hash)`,
  `replay_pointer == output_hash[:16]`) before returning evidence — never trusting the
  subprocess's claim of success without re-checking it.

The deterministic core (`registry.py`, `admission.py`, `runner.py`) has no dependency on
`dspy` or an LM at all and is fully testable without one. `dspy` is an optional extra
(`pip install wasm4pm-dspy[llm]`) needed only for `signatures.py`/`program.py`/
`compile_cli.py`.

## Usage

```python
from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.runner import run_admitted_breed_input

candidate = {
    "breed": "ebl",
    "payload": {
        "intent": "learn", "facts": [...], "rules": [...],
        "goals": [...], "cases": [], "candidates": [], "state": [],
    },
}
admitted = admit_breed_input(candidate)          # raises AdmissionRefused if invalid
result = await run_admitted_breed_input(admitted)  # real subprocess + verified receipt
```

With the `llm` extra installed and `GROQ_API_KEY` set, `program.BreedSelectionProgram`
can produce `candidate` from a free-text goal instead of hand-building it. See
`compile_cli.py` for the dev-only MIPROv2 optimization loop (never run in CI).

## Testing

Chicago-style throughout — real subprocess, real WASM kernel, real Groq API when the
`llm` extra's tests run; nothing is mocked. `tests/test_admission_chicago.py` needs no
LM or subprocess. `tests/test_runner_chicago.py` needs a built `apps/wasm4pm` CLI
(`cd ../apps/wasm4pm && pnpm build`). `tests/test_nl_to_breed_input_chicago.py` needs a
real `GROQ_API_KEY` and skips (never mocks) without one.
