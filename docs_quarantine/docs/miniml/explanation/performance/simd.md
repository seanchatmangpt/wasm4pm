# SIMD Acceleration

SIMD (Single Instruction, Multiple Data) is a processor feature that applies the same operation to multiple data elements simultaneously. In miniml, WASM SIMD instructions accelerate the most computationally intensive operations -- distance calculations, matrix multiplications, and preprocessing transforms -- without any code changes from the user.

## What SIMD Is

A scalar operation processes one value at a time:

```
c[0] = a[0] + b[0]      // one addition
c[1] = a[1] + b[1]      // another addition
c[2] = a[2] + b[2]      // another addition
c[3] = a[3] + b[3]      // another addition
// 4 instructions
```

A SIMD operation processes multiple values in a single instruction:

```
[c0, c1, c2, c3] = [a0, a1, a2, a3] + [b0, b1, b2, b3]
// 1 instruction, 4 results
```

The width of the SIMD register determines how many elements are processed simultaneously. A 128-bit register holds four 32-bit floats or two 64-bit doubles. This means up to 4x throughput for f32 operations and 2x for f64 operations, compared to scalar code.

## WASM v128 SIMD

WebAssembly SIMD operates on 128-bit vectors (`v128`). The instruction set includes:

- **Arithmetic:** `f64x2.add`, `f64x2.mul`, `f64x2.sub`
- **Comparison:** `f64x2.lt`, `f64x2.eq`
- **Shuffle/rearrange:** `i8x16.shuffle`
- **Load/store:** `v128.load`, `v128.store`

miniml compiles Rust code that uses these intrinsics into WASM SIMD instructions. When the browser supports WASM SIMD, these instructions map directly to native hardware SIMD (SSE/AVX on x86, NEON on ARM). When SIMD is not supported, the WASM engine falls back to scalar execution with no errors -- the code still works, just slower.

## How miniml Uses SIMD

### Vectorized Distance Computations

KNN prediction requires computing distances between a query point and every training point. For n training samples with d features, this is O(n*d) multiply-accumulate operations. With SIMD, miniml processes 2 doubles per instruction (f64x2):

```
// Pseudocode: squared Euclidean distance with SIMD
sum_v = [0.0, 0.0]           // v128 accumulator
for i in 0..features.len() step 2:
    diff_v = [query[i] - train[i], query[i+1] - train[i+1]]
    sum_v = sum_v + diff_v * diff_v
distance = sum_v[0] + sum_v[1]
```

### Matrix Operations

Matrix multiplication and transpose operations use blocked algorithms with SIMD inner kernels. The key insight is that matrix operations are embarrassingly parallel at the element level, and SIMD provides the parallelism without the overhead of threading.

### Preprocessing Transforms

Standardization (subtract mean, divide by std), normalization, and scaling all apply the same operation across all features of every sample. These are textbook SIMD patterns.

## Performance Impact

| Operation | Scalar | SIMD (f64) | Speedup |
|-----------|--------|------------|---------|
| KNN distance (1000 samples, 10 features) | baseline | 1.8-2.2x | ~2x |
| Matrix multiply (100x100) | baseline | 1.9-2.5x | ~2x |
| Standardization (1000 samples, 20 features) | baseline | 2.0-3.0x | ~2.5x |
| Batch KNN predict (500 queries) | baseline | 2.0-4.0x | ~3x |

The speedup depends on:
- **Data alignment** -- properly aligned arrays allow efficient load/store
- **Loop unrolling** -- processing multiple elements per iteration amortizes loop overhead
- **Cache behavior** -- SIMD accesses contiguous memory, which is cache-friendly
- **Register pressure** -- keeping values in v128 registers avoids memory round-trips

Real-world speedups range from 1.8x to over 4x depending on the operation and hardware. The upper bound for f64 SIMD on 128-bit registers is 2x, but reduced instruction count, better pipeline utilization, and cache effects can push observed speedups higher.

## Which Operations Benefit

SIMD acceleration is most effective when:

- The same operation applies to many consecutive data elements
- Data is stored contiguously in memory (which miniml's flat layout guarantees)
- The operation is arithmetic-heavy (multiply, add, compare)

Operations that benefit most:
- **KNN distance computation** -- the inner loop is pure multiply-accumulate
- **Matrix multiplication** -- the quintessential SIMD workload
- **Preprocessing (standardization, normalization, scaling)** -- element-wise transforms
- **Gradient computations** -- dot products and element-wise operations

Operations that benefit less:
- **Tree traversal** -- branch-heavy, data-dependent access patterns
- **Sorting** -- comparison-based, irregular memory access
- **Single-sample prediction** -- too few operations to amortize SIMD overhead

## Browser Support

WASM SIMD is supported in:

- **Chrome 91+** (June 2021) -- full support, maps to SSE/AVX
- **Firefox 89+** (June 2021) -- full support, maps to SSE/AVX
- **Safari 16.4+** (March 2023) -- full support, maps to NEON on Apple Silicon
- **Node.js 18+** -- V8-based, same as Chrome
- **Edge 91+** -- Chromium-based, same as Chrome

Coverage is now broad enough that SIMD can be used as the default for production workloads. The fallback path ensures correctness everywhere.

## Zero-Allocation Hot Paths

SIMD acceleration alone is not enough. Allocating memory inside tight loops defeats the purpose because allocation overhead dominates computation time.

miniml's hot paths use pre-allocated buffers:

```
// Before: allocates on every call
fn compute_distance(a: &[f64], b: &[f64]) -> f64 {
    let diff: Vec<f64> = a.iter().zip(b).map(|(x, y)| x - y).collect();  // allocation
    diff.iter().map(|d| d * d).sum()
}

// After: pre-allocated buffer, reused across calls
fn compute_distance(a: &[f64], b: &[f64], buf: &mut [f64]) -> f64 {
    for i in 0..a.len() { buf[i] = a[i] - b[i]; }  // no allocation
    buf.iter().map(|d| d * d).sum()
}
```

Combined with SIMD, zero-allocation hot paths ensure that the CPU spends time on actual computation, not garbage collection or memory management.

## See Also

- [Memory Layout](../architecture/memory-layout.md) -- How flat arrays enable SIMD efficiency
- [Performance Benchmarks](../../../performance.md) -- Measured speedups across operations
- [Classification Algorithms](../algorithms/classification.md) -- Which algorithms use SIMD internally
