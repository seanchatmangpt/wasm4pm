# Release Verification Report

Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
Git Commit: $(git rev-parse --short HEAD)

## Verification Status

---
### Gate 1: All Tests Pass
✗ **WASM build failed:**
    |        ^^^^^^^^^^^^^^
    |
    = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default


warning: creating a shared reference to mutable static
  --> wasm4pm/src/probabilistic/wasm_bindings.rs:18:12
   |
18 |         if STREAMING_LOGS.is_none() {
   |            ^^^^^^^^^^^^^^^^^^^^^^^^ shared reference to mutable static
   |
   = note: for more information, see <https://doc.rust-lang.org/edition-guide/rust-2024/static-mut-references.html>
   = note: shared references to mutable statics are dangerous; it's undefined behavior if the static is mutated or if a mutable reference is created for it while the shared reference lives
   = note: `#[warn(static_mut_refs)]` (part of `#[warn(rust_2024_compatibility)]`) on by default


warning: creating a mutable reference to mutable static
  --> wasm4pm/src/probabilistic/wasm_bindings.rs:31:26
   |
31 |     let store = unsafe { STREAMING_LOGS.as_mut().unwrap() };
   |                          ^^^^^^^^^^^^^^^^^^^^^^^ mutable reference to mutable static
   |
   = note: for more information, see <https://doc.rust-lang.org/edition-guide/rust-2024/static-mut-references.html>
   = note: mutable references to mutable statics are dangerous; it's undefined behavior if any other pointer to the static is used or if any other reference is created for the static while the mutable reference lives


    Finished `release` profile [optimized] target(s) in 32.05s
[INFO]: ⬇️  Installing wasm-bindgen...
Error: invalid type: sequence, expected a string at line 3 column 19
Caused by: invalid type: sequence, expected a string at line 3 column 19

## Summary
✗ **Some release gates FAILED** - Review above
✗ **Tests failed - see logs**

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[191/400]⎯

 FAIL  __tests__/state/object-storage.test.js > State Management - Object Storage > should store OCEL and return a handle
 FAIL  __tests__/state/object-storage.test.ts > State Management - Object Storage > should store OCEL and return a handle
TypeError: Cannot read properties of undefined (reading '__wbindgen_free')
 ❯ Module.load_ocel_from_json pkg/wasm4pm.js:4644:14
    4642|         return getStringFromWasm0(ptr2, len2);
    4643|     } finally {
    4644|         wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
       |              ^
    4645|     }
    4646| }
 ❯ __tests__/state/object-storage.test.ts:32:25

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[192/400]⎯

 FAIL  __tests__/state/object-storage.test.js > State Management - Object Storage > should generate unique handles for different objects
 FAIL  __tests__/state/object-storage.test.ts > State Management - Object Storage > should generate unique handles for different objects
TypeError: Cannot read properties of undefined (reading '__wbindgen_free')
 ❯ Module.load_eventlog_from_xes pkg/wasm4pm.js:4561:14
    4559|         return getStringFromWasm0(ptr2, len2);
    4560|     } finally {
    4561|         wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
       |              ^
    4562|     }
    4563| }
 ❯ __tests__/state/object-storage.test.ts:40:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[193/400]⎯

 FAIL  __tests__/state/object-storage.test.js > State Management - Object Storage > should track object count correctly
 FAIL  __tests__/state/object-storage.test.ts > State Management - Object Storage > should track object count correctly
TypeError: Cannot read properties of undefined (reading 'object_count')
 ❯ Module.object_count pkg/wasm4pm.js:4843:22
    4841|  */
    4842| export function object_count() {
    4843|     const ret = wasm.object_count();
       |                      ^
    4844|     if (ret[2]) {
    4845|         throw takeFromExternrefTable0(ret[1]);
 ❯ __tests__/state/object-storage.test.ts:47:31

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[194/400]⎯

 Test Files  52 failed | 14 passed | 2 skipped (68)
      Tests  388 failed | 274 passed | 86 skipped (772)
   Start at  20:57:25
   Duration  1.43s (transform 1.47s, setup 672ms, collect 4.17s, tests 3.26s, environment 9ms, prepare 4.29s)

---
### Gate 2: Code Coverage (>70%)
⚠ **Coverage report generation failed (continuing)**
---
### Gate 3: TypeScript Type Checking
✗ **TypeScript errors:**
npm warn Unknown env config "publish-branch". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown env config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown env config "use-lockfile". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

> wasm4pm@26.4.16 type:check
> tsc --noEmit

__tests__/analysis.test.ts(6,23): error TS2307: Cannot find module '../pkg/wasm4pm.js' or its corresponding type declarations.
__tests__/parity.test.ts(90,36): error TS2307: Cannot find module '@wasm4pm/wasm' or its corresponding type declarations.
---
### Gate 4: Rust Code Quality (Clippy)
⚠ **Clippy warnings (continuing):**
  --> wasm4pm/src/probabilistic/wasm_bindings.rs:18:12
   |
18 |         if STREAMING_LOGS.is_none() {
   |            ^^^^^^^^^^^^^^^^^^^^^^^^ shared reference to mutable static
   |
   = note: for more information, see <https://doc.rust-lang.org/edition-guide/rust-2024/static-mut-references.html>
   = note: shared references to mutable statics are dangerous; it's undefined behavior if the static is mutated or if a mutable reference is created for it while the shared reference lives
   = note: `-D static-mut-refs` implied by `-D warnings`
   = help: to override `-D warnings` add `#[allow(static_mut_refs)]`

error: creating a mutable reference to mutable static
  --> wasm4pm/src/probabilistic/wasm_bindings.rs:31:26
   |
31 |     let store = unsafe { STREAMING_LOGS.as_mut().unwrap() };
   |                          ^^^^^^^^^^^^^^^^^^^^^^^ mutable reference to mutable static
   |
   = note: for more information, see <https://doc.rust-lang.org/edition-guide/rust-2024/static-mut-references.html>
   = note: mutable references to mutable statics are dangerous; it's undefined behavior if any other pointer to the static is used or if any other reference is created for the static while the mutable reference lives

error: could not compile `wpm` (wasm4pm) (lib) due to 26 previous errors
---
### Gate 5: Code Formatting
⚠ **Formatting issues (auto-fixable):**
[warn] src/config.d.ts
[warn] src/config.js
[warn] src/errors.d.ts
[warn] src/errors.js
[warn] src/mcp_server.d.ts
[warn] src/mcp_server.js
[warn] src/pipeline.d.ts
[warn] src/pipeline.js
[warn] src/receipt.d.ts
[warn] src/receipt.js
[warn] src/types.d.ts
[warn] src/types.js
[warn] src/visualizations.d.ts
[warn] src/visualizations.js
[warn] src/watch.d.ts
[warn] src/watch.js
[warn] tests/fixtures/README.md
[warn] vitest.config.d.ts
[warn] vitest.config.js
[warn] Code style issues found in 130 files. Run Prettier with --write to fix.
---
### Gate 6: Security Audit (cargo audit)
⚠ **Security audit output:**
    Fetching advisory database from `https://github.com/RustSec/advisory-db.git`
      Loaded 1049 security advisories (from /Users/sac/.cargo/advisory-db)
    Updating crates.io index
    Scanning Cargo.lock for vulnerabilities (258 crate dependencies)
Crate:     paste
Version:   1.0.15
Warning:   unmaintained
Title:     paste - no longer maintained
Date:      2024-10-07
ID:        RUSTSEC-2024-0436
URL:       https://rustsec.org/advisories/RUSTSEC-2024-0436
Dependency tree:
paste 1.0.15
├── simba 0.8.1
│   └── nalgebra 0.32.6
│       └── statrs 0.17.1
│           └── wasm4pm 26.4.10
└── metal 0.27.0
    └── wgpu-hal 0.19.5
        ├── wgpu-core 0.19.4
        │   └── wgpu 0.19.4
        │       └── wasm4pm 26.4.10
        └── wgpu 0.19.4

Crate:     rand
Version:   0.8.5
Warning:   unsound
Title:     Rand is unsound with a custom logger using `rand::rng()`
Date:      2026-04-09
ID:        RUSTSEC-2026-0097
URL:       https://rustsec.org/advisories/RUSTSEC-2026-0097
Dependency tree:
rand 0.8.5
├── statrs 0.17.1
│   └── wasm4pm 26.4.10
├── rand_distr 0.4.3
│   ├── wasm4pm 26.4.10
│   └── nalgebra 0.32.6
│       └── statrs 0.17.1
├── wasm4pm 26.4.10
└── nalgebra 0.32.6

error: 2 denied warnings found!
---
### Gate 7: OTEL Observability
⚠ **OTEL integration optional**
---
### Gate 8: Hardcoded Secrets Check
⚠ **Manual review required for potential secrets**
---
### Gate 9: Watch Mode Verification
✓ **Watch mode tests exist**
---
### Gate 10: WASM Build Verification
✗ **WASM build incomplete**

## Summary
✗ **Some release gates FAILED** - Review above
