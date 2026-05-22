# Error Types

All error variants returned by miniml operations. Errors are returned as thrown exceptions with descriptive messages.

## MlError

All miniml functions return `MlError` on failure (wrapped as `JsValue` in WASM). The error contains a single `message` field describing what went wrong.

## Common Error Messages

### Data Validation Errors

| Error Message | Cause |
|---------------|-------|
| `"n_samples must be > 0"` | Passed zero or empty data |
| `"n_features must be > 0"` | Feature count is zero |
| `"data must not be empty"` | Empty array passed where data is required |
| `"data length must be divisible by n_features"` | Row-major data length does not match nFeatures |
| `"targets length must match number of samples"` | Y array length differs from X rows |
| `"times and events must have the same length"` | Survival analysis arrays have mismatched lengths |
| `"Paired samples must have the same length"` | Paired test arrays differ in size |
| `"Observed and expected must have the same length"` | Chi-square test array mismatch |

### Dimension Mismatch Errors

| Error Message | Cause |
|---------------|-------|
| `"vectors must have same length"` | Kernel computation on vectors of different sizes |
| `"transition_matrix must have n_states^2 elements"` | Markov chain matrix size wrong |
| `"initial_distribution must have n_states elements"` | Initial distribution size wrong |
| `"emission_probs must have n_states * n_observations elements"` | HMM emission matrix wrong shape |
| `"Contingency table size does not match n_rows * n_cols"` | Chi-square independence table wrong size |
| `"adjacency must have n_nodes^2 elements"` | Graph adjacency matrix wrong size |

### Statistical Test Errors

| Error Message | Cause |
|---------------|-------|
| `"Need at least 2 observations for a t-test"` | Sample too small |
| `"Each sample needs at least 2 observations"` | One or both groups too small |
| `"Both samples must be non-empty"` | Mann-Whitney U with empty group |
| `"Need at least 2 paired observations"` | Paired test with < 2 pairs |
| `"Data must be non-empty"` | describe() or other function on empty data |
| `"No non-zero differences found"` | Wilcoxon with all identical pairs |
| `"Expected frequencies must be positive"` | Chi-square with zero expected value |
| `"Need at least one group"` / `"Need at least 2 groups for ANOVA"` | ANOVA with insufficient groups |

### Model-Specific Errors

| Error Message | Cause |
|---------------|-------|
| `"Matrix is not positive definite"` | Cholesky decomposition failed (Bayesian, GP) |
| `"n_nodes must be > 0"` | Graph algorithm with no nodes |
| `"source must be < n_nodes"` | Shortest path source out of range |
| `"damping must be in (0, 1)"` | PageRank damping outside valid range |
| `"max_iter must be > 0"` | Iterative algorithm with zero iterations |
| `"Row X of transition matrix sums to Y (expected 1.0)"` | Invalid Markov transition matrix |
| `"initial_distribution sums to X (expected 1.0)"` | Invalid initial distribution |

### Optimization Errors

| Error Message | Cause |
|---------------|-------|
| `"proposal_sd must be > 0"` | MCMC proposal width is zero or negative |
| `"alpha must be between 0 and 1"` | Significance level out of range |
| `"confidence must be in (0.5, 0.999]"` | Bootstrap confidence level invalid |
| `"noise must be >= 0"` | GP noise parameter negative |

## Handling Errors in JavaScript

```typescript
import { init, tTestOneSample } from '@seanchatmangpt/wminml';
await init();

try {
  const result = tTestOneSample(new Float64Array([1]), 0.0, 0.05);
} catch (error) {
  console.error(`miniml error: ${error.message}`);
  // "Need at least 2 observations for a t-test"
}
```

## Error Categories

All errors fall into these categories:

1. **Input validation** -- wrong dimensions, empty data, invalid parameters
2. **Numerical** -- matrix not positive definite, convergence failure
3. **Domain** -- insufficient data for the algorithm, invalid probability distributions

Check inputs before calling functions to avoid the most common errors.
