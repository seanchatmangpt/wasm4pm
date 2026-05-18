# wasm4pm Error Messages — Reference Guide

**Quick guide to 5 vague errors identified in clarity audit + improved versions.**

---

## Error #1: WASM Memory Inaccessible

**Location:** `packages/engine/src/wasm-loader.ts:315`  
**Current:** `"WASM memory is inaccessible or empty"`  
**Severity:** High (blocks all operations)

### What Users See
No memory buffer can be allocated; WASM kernel cannot function.

### Root Causes
1. Node.js version too old (need 16+)
2. WASM binary corrupted or incompatible
3. System is out of memory

### What to Do
```bash
# Step 1: Check Node.js version
node --version

# Step 2: Reinstall WASM binary
npm reinstall @wasm4pm/engine

# Step 3: Diagnose your environment
wpm doctor

# Step 4: If RAM is low, try with smaller dataset
wpm run log.xes --max-memory 512m
```

---

## Error #2: Module Not Loaded

**Location:** `packages/engine/src/wasm-loader.ts:220`  
**Current:** `"WASM module not initialized. Call init() before using the module."`  
**Severity:** High (initialization failed)

### What Users See
WASM runtime is not ready; operations cannot proceed.

### Root Causes
1. WASM binary not downloaded
2. Node.js version incompatible
3. Previous init failed; cached state is corrupted

### What to Do
```bash
# Step 1: Full diagnostics
wpm doctor --verbose

# Step 2: Clear cached state
rm -f .wasm4pm/state.json

# Step 3: Retry your command
wpm run log.xes

# Step 4: If still broken, hard reset
npm reinstall @wasm4pm/engine
wpm status
```

---

## Error #3: Memory Write Verification Failed

**Location:** `packages/engine/src/wasm-loader.ts:326`  
**Current:** `"WASM memory write verification failed"`  
**Severity:** High (memory is unstable)

### What Users See
Memory test failed; wrote 0x2a but read back 0x00 or garbage.

### Root Causes
1. Memory is readonly or protected
2. WASM runtime is allocating unstable memory
3. Hardware memory fault (bad RAM)

### What to Do
```bash
# Step 1: Check system memory health
wpm doctor

# Step 2: Clear WASM cache
rm -rf node_modules/.wasm4pm-cache

# Step 3: Reinstall
npm reinstall @wasm4pm/engine

# Step 4: If problem persists, check RAM
# (Run memtest86 or other hardware RAM checker)
```

---

## Error #4: Unhandled ML Task

**Location:** `apps/wasm4pm/src/ml-runner.ts` and others  
**Current:** `"Unhandled ML task: invalid_task"`  
**Severity:** Medium (user error)

### What Users See
ML task name is not recognized.

### Root Causes
1. Task name is misspelled
2. Task not compiled into this WASM build
3. User doesn't know what tasks are available

### What to Do
```bash
# Step 1: List valid tasks
wpm ml --help

# Step 2: Check which algorithms are available
wpm algorithms --filter ml

# Step 3: Use a valid task
wpm ml classify -i log.xes --method knn

# Valid tasks: classify, cluster, forecast, anomaly, regress, pca
```

---

## Error #5: Incomplete Model Metrics

**Location:** `apps/wasm4pm/src/commands/compare.ts` (line ~220)  
**Current:** `"Incomplete model metrics: variants=2, density=0.5, complexity=null"`  
**Severity:** Medium (partial result)

### What Users See
Some quality metrics computed, but others missing (e.g., complexity).

### Root Causes
1. Model structure has issues (gateway/merge mismatch)
2. Algorithm timed out
3. Dataset too small (<100 traces)

### What to Do
```bash
# Step 1: Verify model structure
wpm conformance -i log.xes -m model.pnml

# Step 2: Try with larger dataset
# (Need >1000 traces for reliable metrics)

# Step 3: Use simpler algorithm to avoid timeout
wpm run log.xes --algorithm dfg

# Step 4: Increase timeout
wpm run log.xes --timeout 60

# Step 5: Check for warnings
wpm status --verbose
```

---

## Error Message Best Practices

All improved messages follow this 4-part structure:

```
WHAT: [Operation] failed — [why in one sentence]

WHY: [Root cause 1]
     [Root cause 2]
     [Root cause 3]

CONTEXT: [Relevant state]: [values/files/paths]

FIX:
  1. [Diagnostic command]
  2. [Recovery step 1]
  3. [Recovery step 2]
  4. [Hard reset if needed]
```

---

## Testing

All errors are tested in:
- **File:** `apps/wasm4pm/src/__tests__/error-message-clarity-audit.test.ts`
- **Tests:** 16 total (all passing)
- **Coverage:**
  - Root cause explanation
  - Context information
  - Remediation guidance
  - Severity classification
  - Sensitivity (no path/key leaks)

Run tests with:
```bash
pnpm --filter "@wasm4pm/cli" test -- error-message-clarity-audit
```

---

## Implementation Status

| Error | Status | File | Priority |
|-------|--------|------|----------|
| #1 WASM Memory | Documented | wasm-loader.ts:315 | High |
| #2 Module Not Loaded | Documented | wasm-loader.ts:220 | High |
| #3 Memory Write Failed | Documented | wasm-loader.ts:326 | High |
| #4 Unhandled ML Task | Documented | ml-runner.ts | Medium |
| #5 Incomplete Metrics | Documented | compare.ts | Medium |

**Next Step:** Apply these improvements to actual error messages in source code.

---

## Related Files

- `apps/wasm4pm/src/error-messages-improved.ts` — Error message factory
- `apps/wasm4pm/src/__tests__/error-message-clarity-audit.test.ts` — Test suite
- `.claude/error-handling-audit-results.md` — Full audit report
- `packages/contracts/src/errors.ts` — Core error system
