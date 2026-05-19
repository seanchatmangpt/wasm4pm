# Encode Categorical Data

Convert string or category values into numeric form for ML models.

## Problem

ML models require numeric input, but real-world data contains categories -- colors, countries, product types, education levels. You need to convert these to numbers without losing information or introducing false ordinal relationships.

## Solution

Choose an encoding method based on the nature of the categorical variable: label encoding for ordinal data, one-hot encoding for nominal data, and ordinal encoding when you need to map categories to a specific order.

### Step 1: Identify the type of categorical variable

```typescript
// Nominal (no inherent order): color, country, department
const colors = ["red", "blue", "green", "blue", "red", "green", "red"];

// Ordinal (has natural order): education, size, rating
const sizes = ["small", "medium", "large", "medium", "small", "large", "medium"];

// Binary (two values): yes/no, true/false, pass/fail
const passed = ["yes", "no", "yes", "yes", "no", "yes"];
```

### Step 2: Label encoding (nominal data)

Assigns a unique integer to each category. Simple but can introduce false ordinal relationships.

```typescript
import { labelEncoder } from "@seanchatmangpt/wminml";

// Convert strings to numbers first
const colorNumbers = colors.map((c) =>
  c === "blue" ? 0 : c === "green" ? 1 : 2
);
const encoded = labelEncoder(colorNumbers);

console.log(`Encoded: ${JSON.stringify(encoded)}`);
// [2, 0, 1, 0, 2, 1, 2]
```

### Step 3: One-hot encoding (nominal data, multiple categories)

Creates a binary column for each category. No false ordinal relationship.

```typescript
import { oneHotEncoder } from "@seanchatmangpt/wminml";

const nClasses = 3;
const colorNumbers = colors.map((c) =>
  c === "blue" ? 0 : c === "green" ? 1 : 2
);

// oneHotEncoder takes number[] and nFeatures (number of classes)
const oneHot = oneHotEncoder(colorNumbers, nClasses);

// Result for 7 samples x 3 classes:
// "red"   -> [0, 0, 1]
// "blue"  -> [1, 0, 0]
// "green" -> [0, 1, 0]

// Verify the encoding
for (let i = 0; i < colorNumbers.length; i++) {
  const row: number[] = [];
  for (let j = 0; j < nClasses; j++) {
    row.push(oneHot[i * nClasses + j]);
  }
  console.log(`${colors[i]} -> [${row.join(", ")}]`);
}
```

### Step 4: Ordinal encoding (ordinal data)

Maps categories to integers preserving a specific order.

```typescript
import { ordinalEncoder } from "@seanchatmangpt/wminml";

const sizeNumbers = sizes.map((s) =>
  s === "small" ? 0 : s === "medium" ? 1 : 2
);
const encoded = ordinalEncoder(sizeNumbers);

console.log(`Encoded: ${JSON.stringify(encoded)}`);
// [0, 1, 2, 1, 0, 2, 1]
```

### Step 5: Build a feature matrix with mixed types

```typescript
function encodeFeatures(
  numericFeature: number[],
  nominalFeature: number[],
  ordinalFeature: number[],
  nNominalClasses: number
): { X: number[]; nFeatures: number } {
  const nSamples = numericFeature.length;
  const nominalOneHot = oneHotEncoder(nominalFeature, nNominalClasses);
  const ordinalEncoded = ordinalEncoder(ordinalFeature);

  const nFeatures = 1 + nNominalClasses + 1; // numeric + one-hot + ordinal
  const X: number[] = [];

  for (let i = 0; i < nSamples; i++) {
    // Numeric feature
    X.push(numericFeature[i]);

    // One-hot encoded nominal feature
    for (let j = 0; j < nNominalClasses; j++) {
      X.push(nominalOneHot[i * nNominalClasses + j]);
    }

    // Ordinal encoded feature
    X.push(ordinalEncoded[i]);
  }

  return { X, nFeatures };
}
```

### Choosing the right encoder

| Variable Type | Encoder | Notes |
|--------------|---------|-------|
| Nominal (2 categories) | Label or One-Hot | Either works; one-hot is safer |
| Nominal (3+ categories) | One-Hot | Label encoding creates false ordering |
| Ordinal | Ordinal | Preserves natural order |
| High cardinality (> 10) | Label | One-hot creates too many columns |
| Tree-based models | Label | Trees handle label-encoded categories well |
| Distance-based models | One-Hot | KNN, K-Means need binary columns |

## Tips

- All encoders return `number[]` directly -- they do NOT return `{ encoded, classes }` objects.
- One-hot encoding increases dimensionality. For categories with many unique values (> 10), label encoding is more practical.
- Tree-based models (Decision Tree) handle label-encoded categories naturally because they split on values, not distances.
- Never use label encoding for nominal data with distance-based models (KNN, K-Means). The integer values imply an ordering that does not exist.

## See Also

- [Scale Your Features](scaling.md) -- normalize after encoding
- [Handle Missing Values](missing-values.md) -- clean data before encoding
- [Train a Classifier](../classification/train-model.md) -- using encoded features in models
