# Non-linear Relationships

Model relationships that are not straight lines.

## Problem

Your data shows curves, saturation effects, or exponential growth. Linear regression produces a poor fit with low R-squared because it can only draw straight lines. You need models that capture curvature.

## Solution

Use polynomial regression for general curves, exponential regression for growth/decay, and power regression for scaling laws.

### Step 1: Detect non-linearity

Fit a linear model first. If R-squared is low and residuals show a pattern, the relationship is non-linear.

```typescript
import { linearRegression } from "@seanchatmangpt/wminml";

const lin = linearRegression(XTrain, yTrain);
const preds = lin.predict(XTest);

// Compute R-squared manually
const mean = yTest.reduce((a, b) => a + b, 0) / yTest.length;
let ssTot = 0;
let ssRes = 0;
for (let i = 0; i < yTest.length; i++) {
  ssTot += (yTest[i] - mean) ** 2;
  ssRes += (yTest[i] - preds[i]) ** 2;
}
const r2 = 1 - ssRes / ssTot;

if (r2 < 0.7) {
  console.log(
    `Linear R-squared is ${(r2 * 100).toFixed(1)}% -- consider non-linear models`
  );
}
```

### Step 2: Try polynomial regression

Polynomial regression fits a curve of any degree. Higher degree captures more complex shapes.

```typescript
import { polynomialRegression, trainTestSplit } from "@seanchatmangpt/wminml";

const nFeatures = 2;
const { xTrain, xTest, yTrain, yTest } = trainTestSplit(
  X, y, 0.8, nFeatures
);

// Compare polynomial degrees
for (const degree of [2, 3, 4, 5]) {
  const model = polynomialRegression(xTrain, yTrain, { degree });
  const trainPred = model.predict(xTrain);
  const testPred = model.predict(xTest);

  const trainR2 = rSquared(yTrain, trainPred);
  const testR2 = rSquared(yTest, testPred);

  console.log(
    `Degree ${degree}: train R2=${trainR2.toFixed(4)}, test R2=${testR2.toFixed(4)}`
  );
}

// Pick the degree where test R2 is highest (not train R2)
```

### Step 3: Try exponential regression

For data that grows or decays proportionally -- population growth, radioactive decay, compound interest.

```typescript
import { exponentialRegression } from "@seanchatmangpt/wminml";

const exp = exponentialRegression(XTrain, yTrain);
const expPred = exp.predict(XTest);
const expR2 = rSquared(yTest, expPred);

console.log(`Exponential R2: ${(expR2 * 100).toFixed(1)}%`);
console.log(`Model: y = ${exp.a.toFixed(4)} * e^(${exp.b.toFixed(4)} * x)`);

// If R2 is high and the data shows accelerating growth, exponential is a good fit
```

### Step 4: Try power regression

For scaling relationships -- "if x doubles, y quadruples." Common in physics, economics, biology.

```typescript
import { powerRegression } from "@seanchatmangpt/wminml";

const pow = powerRegression(XTrain, yTrain);
const powPred = pow.predict(XTest);
const powR2 = rSquared(yTest, powPred);

console.log(`Power R2: ${(powR2 * 100).toFixed(1)}%`);
console.log(`Model: y = ${pow.a.toFixed(4)} * x^${pow.b.toFixed(4)}`);
```

### Step 5: Pick the right model

```typescript
const models = [
  { name: "Polynomial (3)", preds: polynomialRegression(XTrain, yTrain, { degree: 3 }).predict(XTest) },
  { name: "Exponential", preds: exponentialRegression(XTrain, yTrain).predict(XTest) },
  { name: "Power", preds: powerRegression(XTrain, yTrain).predict(XTest) },
];

let bestName = "";
let bestR2 = -Infinity;

for (const { name, preds } of models) {
  const r2 = rSquared(yTest, preds);
  console.log(`${name}: R2=${r2.toFixed(4)}`);
  if (r2 > bestR2) {
    bestR2 = r2;
    bestName = name;
  }
}

console.log(`\nBest model: ${bestName} (R2=${bestR2.toFixed(4)})`);
```

### Choosing the right model

| Data Pattern | Model | Example |
|-------------|-------|---------|
| U-shape or parabola | Polynomial (deg 2) | Cost vs production volume |
| S-curve or multiple bends | Polynomial (deg 3-4) | Dose-response curves |
| Accelerating growth | Exponential | Population, compound interest |
| Decaying signal | Exponential | Radioactive decay, cooling |
| Scaling law | Power | Metabolic rate vs body mass |
| Diminishing returns | Power (exponent < 1) | Experience vs productivity |

## Tips

- Polynomial degree > 5 usually overfits. Watch for test R2 dropping as degree increases.
- Exponential and power regression assume strictly positive values. Transform or filter negatives first.
- Use `trainTestSplit` to evaluate on held-out data. A high training R2 with low test R2 means overfitting.
- Combine with regularization (see [Regularization Techniques](regularization.md)) for high-degree polynomials.

## See Also

- [Predict Continuous Values](predict-values.md) -- regression basics
- [Regularization Techniques](regularization.md) -- controlling polynomial overfitting
- [Choose K for K-Means](../clustering/choose-k.md) -- another approach to finding structure in data
