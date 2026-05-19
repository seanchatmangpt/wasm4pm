# Memory Layout

The way data is arranged in memory has a direct impact on performance. miniml uses a flat, row-major layout with pre-allocated buffers to maximize cache efficiency and minimize allocation overhead in WASM.

## Flat Row-Major Storage

Data in miniml is stored as contiguous 1-dimensional arrays, laid out row by row:

```
// A 3x4 matrix (3 samples, 4 features):
// [[1.0, 2.0, 3.0, 4.0],
//  [5.0, 6.0, 7.0, 8.0],
//  [9.0, 10.0, 11.0, 12.0]]

// Flat row-major storage:
// [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0]
//  |---- row 0 ----|  |---- row 1 ----|  |------ row 2 ------|
```

Element at row `i`, column `j` is at index `i * num_columns + j`.

### Why Row-Major for ML

Most ML operations iterate over samples (rows). KNN computes distances between a query and each training sample. Tree algorithms split on features within each sample. Preprocessing applies transforms row by row.

Row-major layout means accessing all features of a single sample reads contiguous memory, which is cache-friendly:

```
// Accessing row 1: indices 4, 5, 6, 7 -- contiguous, one cache line
// Accessing column 2: indices 2, 6, 10 -- strided, may span multiple cache lines
```

Since ML workloads are row-heavy, row-major is the natural choice.

## Data Representation

### JavaScript Side: Float64Array

miniml accepts and returns `Float64Array` (or plain number arrays that get converted). Float64Array is a typed array backed by an `ArrayBuffer` -- a contiguous block of memory with a known byte layout:

```
// User provides data as Float64Array
const X = new Float64Array([
    1.0, 2.0, 3.0,
    4.0, 5.0, 6.0,
    7.0, 8.0, 9.0
]);
// 72 bytes: 9 values * 8 bytes per f64
```

When this data crosses into WASM, it is transferred (not copied) when possible. The WASM module receives a pointer to the same underlying buffer.

### Rust Side: Vec<f64>

Inside the WASM module, data lives as `Vec<f64>` -- Rust's growable array type backed by a contiguous heap allocation:

```
// Rust representation
struct Dataset {
    data: Vec<f64>,        // flat row-major storage
    nrows: usize,           // number of samples
    ncols: usize,           // number of features
}

impl Dataset {
    fn at(&self, row: usize, col: usize) -> f64 {
        self.data[row * self.ncols + col]
    }
}
```

`Vec<f64>` has O(1) indexed access and no indirection. The data pointer points directly to the float values.

## No Allocations in Hot Paths

The most performance-critical code in miniml -- distance computations, matrix operations, preprocessing -- avoids allocating memory during execution. Instead, buffers are pre-allocated once and reused:

```
// Allocation happens once during model construction
struct KNNClassifier {
    train_data: Vec<f64>,
    // Pre-allocated buffer for distance computation
    diff_buffer: Vec<f64>,
}

impl KNNClassifier {
    fn predict_one(&mut self, query: &[f64]) -> usize {
        // Reuse buffer across predictions -- no allocation
        compute_distances(&self.train_data, query, &mut self.diff_buffer);
        // ... find k nearest neighbors ...
    }
}
```

This matters because:
- **WASM allocation is not free.** Even though WASM has a fast bump allocator, allocation requires incrementing a pointer and potentially triggering GC.
- **Cache locality.** A pre-allocated buffer that stays in L1/L2 cache across calls is faster than allocating fresh memory that may be in a different cache line.
- **Predictability.** No allocation means no GC pauses, which matters for real-time inference.

## WASM Memory Model

WASM uses a linear memory model -- a single contiguous address space that grows as needed (up to a configurable maximum). There is no garbage collector for WASM-managed memory.

```
WASM Linear Memory:
+------------------------------------------+
|  Stack (grows downward)                  |
|                                          |
|  ............                            |
|                                          |
|  Heap (grows upward)                     |
|  - Vec<f64> data buffers                 |
|  - Model parameters                      |
|  - Pre-allocated work buffers            |
|  ............                            |
|                                          |
|  Imported JS data (Float64Array)         |
+------------------------------------------+
```

Properties of this model:
- **O(1) access** -- any memory location is reachable in constant time via pointer arithmetic
- **No fragmentation** -- linear memory is compact; deallocation does not create holes
- **Growth cost** -- resizing memory copies the entire buffer; miniml pre-allocates to minimize growth
- **No GC pauses** -- there is no garbage collector for WASM linear memory

## Trade-offs: Flat Arrays vs Nested Structures

miniml chose flat arrays over more intuitive nested structures (`Vec<Vec<f64>>`) for performance reasons:

| Aspect | Flat `Vec<f64>` | Nested `Vec<Vec<f64>>` |
|--------|-----------------|----------------------|
| Memory layout | Contiguous | Scattered (each inner Vec is separate allocation) |
| Cache behavior | Excellent for row access | Poor (each row may be in different cache line) |
| Allocation count | 1 allocation for entire dataset | n+1 allocations (one per row + outer) |
| SIMD compatibility | Direct (contiguous = vectorizable) | Difficult (strided access) |
| Index computation | `i * ncols + j` | `data[i][j]` |
| Flexibility | Fixed column count per row | Each row can have different length |

The fixed-column-count constraint is acceptable for ML datasets, where every sample has the same features. The performance gains from contiguous memory far outweigh the ergonomic cost of manual indexing.

## See Also

- [SIMD Acceleration](../performance/simd.md) -- How contiguous memory enables SIMD operations
- [Performance Benchmarks](../../../performance.md) -- Measured impact of memory layout choices
- [Classification Algorithms](../algorithms/classification.md) -- How algorithms access data during training and prediction
