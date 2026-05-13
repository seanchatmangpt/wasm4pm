# One-Way ANOVA

Test whether the means of three or more groups differ significantly.

## What You'll Learn

- Running a one-way ANOVA
- Interpreting F-statistic and p-value
- Understanding between-group and within-group variation

## Prerequisites

```typescript
import { init, oneWayAnova } from '@seanchatmangpt/wminml';
await init();
```

## Run ANOVA

Provide all group data concatenated and a `groupSizes` array indicating where each group ends.

```typescript
// Three treatment groups with 5 observations each
const groupA = new Float64Array([1.0, 2.0, 1.5, 2.5, 1.8]);
const groupB = new Float64Array([10.0, 11.0, 10.5, 11.5, 10.2]);
const groupC = new Float64Array([20.0, 21.0, 20.5, 19.5, 20.8]);

// Concatenate all groups into one array
const groups = new Float64Array([...groupA, ...groupB, ...groupC]);
const groupSizes = new Uint32Array([5, 5, 5]);

const result = oneWayAnova(groups, groupSizes);

console.log(result.fStatistic);        // F-statistic (large = big differences)
console.log(result.pValue);            // < 0.05 = significant differences exist
console.log(result.betweenGroupsSs);   // sum of squares between groups
console.log(result.withinGroupsSs);    // sum of squares within groups
console.log(result.betweenGroupsDf);   // k - 1 (number of groups minus 1)
console.log(result.withinGroupsDf);    // N - k (total observations minus groups)
```

## Interpreting Results

| Metric | Meaning |
|--------|---------|
| `pValue < 0.05` | At least one group mean differs from the others |
| `pValue >= 0.05` | No significant difference between group means |
| `fStatistic` | Ratio of between-group to within-group variance |
| `betweenGroupsSs` | How much variation is explained by group membership |
| `withinGroupsSs` | Residual variation within groups |

## Practical Example

```typescript
// Test whether three teaching methods produce different test scores
const method1 = [78, 82, 85, 80, 77];  // Lecture
const method2 = [88, 92, 90, 85, 91];  // Interactive
const method3 = [72, 75, 70, 74, 73];  // Self-study

const allScores = new Float64Array([...method1, ...method2, ...method3]);
const sizes = new Uint32Array([5, 5, 5]);
const result = oneWayAnova(allScores, sizes);

if (result.pValue < 0.05) {
  console.log('Teaching method has a significant effect on scores');
  console.log(`F({result.betweenGroupsDf}, ${result.withinGroupsDf}) = ${result.fStatistic.toFixed(2)}`);
}
```

## Tips

- ANOVA requires at least 2 groups, but is meaningful with 3+ groups.
- Group sizes must sum to the total length of the data array.
- ANOVA only tells you that differences exist -- use post-hoc t-tests to find which groups differ.
- Each group must have at least 1 observation; total must exceed the number of groups.
