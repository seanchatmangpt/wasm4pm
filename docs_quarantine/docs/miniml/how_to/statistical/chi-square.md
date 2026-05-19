# Chi-Square Tests

Test relationships between categorical variables: goodness-of-fit and independence.

## What You'll Learn

- Chi-square goodness-of-fit test
- Chi-square test of independence for contingency tables

## Prerequisites

```typescript
import { init, chiSquareTest, chiSquareIndependence } from '@seanchatmangpt/wminml';
await init();
```

## Goodness-of-Fit Test

Test whether observed frequencies match expected frequencies.

```typescript
// A die is rolled 60 times. Is it fair?
const observed = new Float64Array([8, 12, 9, 11, 10, 10]);
const expected = new Float64Array([10, 10, 10, 10, 10, 10]); // uniform expectation

const result = chiSquareTest(observed, expected);

console.log(result.statistic);  // chi-square statistic
console.log(result.pValue);     // p-value (> 0.05 = fits expected distribution)
console.log(result.df);         // degrees of freedom (k - 1)
```

If `pValue < 0.05`, the observed data does not fit the expected distribution well.

## Test of Independence

Test whether two categorical variables are independent using a contingency table.

```typescript
// 2x2 contingency table (row-major):
//          | Feature A | Feature B |
//   Group1 |    10     |    20     |
//   Group2 |    20     |    10     |
const contingency = new Float64Array([10, 20, 20, 10]);
const nRows = 2;
const nCols = 2;

const result = chiSquareIndependence(contingency, nRows, nCols);

console.log(result.statistic);  // chi-square statistic
console.log(result.pValue);     // < 0.05 = significant association
console.log(result.df);         // (rows-1) * (cols-1)
```

### Larger Contingency Table

```typescript
// 3x2 table: survey responses by region
//          | Yes | No |
//   East   |  30 | 20 |
//   West   |  25 | 35 |
//   North  |  15 | 25 |
const table = new Float64Array([30, 20, 25, 35, 15, 25]);
const result = chiSquareIndependence(table, 3, 2);
console.log(result.df);  // (3-1)*(2-1) = 2
```

## Interpreting Results

| Metric | Meaning |
|--------|---------|
| `pValue < 0.05` | Variables are associated (reject independence) |
| `pValue >= 0.05` | No evidence of association |
| `statistic` | Larger values indicate greater deviation from expected |

## Tips

- Expected frequencies must all be positive (no zeros).
- The contingency table is stored in row-major order: `table[row * nCols + col]`.
- The table must have at least 2 rows and 2 columns for the independence test.
- For small sample sizes (expected counts < 5), chi-square may be unreliable.
