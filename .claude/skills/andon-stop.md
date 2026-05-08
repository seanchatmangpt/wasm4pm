---
name: Andon Stop
description: Stop-the-line protocol when Andon signals appear
type: skill
---

# Skill: Andon Stop (Global)

## Purpose

Recognize and respond to stop-the-line signals. When these appear, halt all work immediately and fix the underlying issue before proceeding.

## Andon Signals (CRITICAL)

| Signal | Meaning | Action |
|--------|---------|--------|
| `error[E` | Compiler error | HALT. Read the error. Fix the code. Re-compile. |
| `test.*FAILED` | Test failure | HALT. Read the failure. Fix the cause. Re-test. |
| `FM-5 violation` | Self-referential falsification in cognition | HALT. Review test for mocks of init.js. Remove. Re-test. |
| `panicked at` | Runtime panic | HALT. Read the panic trace. Fix. Re-run. |
| `dead param` | Unused parameter pattern `let _ = x;` | HALT. Remove the parameter or use it. Re-check. |

## What NOT To Do

❌ Skip to the next feature  
❌ Say "I'll fix it later"  
❌ Mark as done despite the signal  
❌ Use `#[allow(...)]` to silence  
❌ Use `|| true` to hide failures  

## What TO Do

✅ Stop immediately  
✅ Read the error output  
✅ Identify root cause  
✅ Apply targeted fix  
✅ Re-run the failing check  
✅ Verify signal cleared (exit 0)  
✅ THEN continue  

## Signals in Context

### wasm4pm Specific

Signals from `pnpm build`, `pnpm test`, `wpm doctor`, `make cognition-build`:

```
error[E0308]: mismatched types          # Compiler error → fix code
test.*FAILED: cognition_breed_test      # Test failure → debug + fix
FM-5 violation: init.js mocked         # Self-falsification → remove mock
```

### open-ontologies Specific

Signals from `make check`, `make test`, `make adversarial`:

```
error[E0425]: cannot find value in scope  # Compiler error
test.*FAILED: cell8_gates_test            # Test failure
dead param: let _ = unused_var;           # Dead-param gate violation
```

## The Doctrine

> The easiest way to pass validation is to fix the issues.

**Stop the line. Keep working until the signal clears. Do not proceed until validation passes.**

This is not optional. This is production discipline.
