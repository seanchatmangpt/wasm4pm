# AutoML API

Complete reference for the automated machine learning pipeline. AutoML handles algorithm selection, feature selection, and hyperparameter optimization with minimal user configuration.

---

## autoFitRegression

```ts
autoFitRegression(x, y, nSamples, nFeatures): Promise<AutoMLResult>
```

One-liner automated regression. Evaluates LinearRegression and PolynomialRegression using cross-validation, selects the best, and optionally performs feature selection.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat training features (nSamples * nFeatures) |
| `y` | `number[]` | Target values |
| `nSamples` | `number` | Number of training samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** `AutoMLResult`

```ts
const result = await autoFitRegression(flatX, y, 100, 5);
console.log(result.best_algorithm); // e.g. "LinearRegression"
console.log(result.best_score);     // e.g. 0.95
```

---

## autoFitClassification

```ts
autoFitClassification(x, y, nSamples, nFeatures): Promise<AutoMLResult>
```

One-liner automated classification. Evaluates KNearestNeighbors, LogisticRegression, NaiveBayes, DecisionTree, and Perceptron using cross-validation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat training features (nSamples * nFeatures) |
| `y` | `number[]` | Class labels (integers) |
| `nSamples` | `number` | Number of training samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** `AutoMLResult`

---

## recommendAlgorithm

```ts
recommendAlgorithm(nSamples, nFeatures, nClasses, isSparse): Promise<string>
```

Returns a recommended algorithm name based on data characteristics, without fitting any model.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Number of features |
| `nClasses` | `number` | Number of classes |
| `isSparse` | `boolean` | Whether the data is sparse |

**Returns:** `string` -- Algorithm name (e.g. `"NaiveBayes"`, `"Perceptron"`, `"LogisticRegression"`, `"DecisionTree"`, `"KNearestNeighbors"`).

**Selection rules:**
- nSamples < 100: `NaiveBayes`
- isSparse: `Perceptron`
- nFeatures > 100: `LogisticRegression`
- nClasses > 5: `DecisionTree`
- Otherwise: `KNearestNeighbors`

---

## AutoMLResult Interface

Returned by `autoFitRegression`, `autoFitClassification`, and the internal `AutoMLEngine`.

| Property | Type | Description |
|----------|------|-------------|
| `.best_algorithm` | `string` (readonly) | Name of the best algorithm |
| `.best_score` | `number` (readonly) | Best validation score (0-1) |
| `.evaluations` | `number` (readonly) | Number of algorithms evaluated |
| `.selected_features` | `number[]` (readonly) | Indices of selected features |
| `.algorithm_scores` | `string[]` (readonly) | All scores as `"name:score"` strings |
| `.rationale` | `string` (readonly) | Human-readable explanation for selection |
| `.original_features` | `number` (readonly) | Total features before selection |
| `.feature_selection_performed` | `boolean` (readonly) | Whether feature selection was applied |
| `.problem_type` | `string` (readonly) | Detected type: `"classification"` or `"regression"` |

### Methods

```ts
result.summary(): string
```

Returns a formatted multi-line summary string.

```ts
result.algorithmScore(algorithmName: string): number | null
```

Returns the validation score for a specific algorithm, or `null` if not evaluated.

```ts
result.isBetterThan(other: AutoMLResult): boolean
```

Compares two results by `best_score`.

---

## AutoML Configuration

The `AutoMLEngine` (internal, not directly exported to TypeScript) supports the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cv_folds` | `number` | `5` | Cross-validation folds |
| `population_size` | `number` | `30` | Genetic algorithm population size |
| `generations` | `number` | `20` | Genetic algorithm generations |
| `do_feature_selection` | `boolean` | `true` | Whether to perform feature selection |
| `max_features` | `number` | `10` | Maximum features after selection |

The one-liner functions (`autoFitRegression`, `autoFitClassification`) use these defaults. To customize, use the WASM-level `AutoMLEngine` directly.

---

## Problem Type Detection

AutoML auto-detects the problem type based on label values:

- **Classification**: All labels are integers in range [0, 10] with zero fractional part
- **Regression**: Labels contain fractional values or integers outside [0, 10]

Evaluated algorithms per type:

| Problem Type | Algorithms |
|-------------|------------|
| Classification | KNearestNeighbors, LogisticRegression, NaiveBayes, DecisionTree, Perceptron |
| Regression | LinearRegression, PolynomialRegression |

---

## Early Stopping

The engine supports early stopping (enabled by default). If any algorithm achieves a validation score >= 0.95, evaluation stops immediately and that algorithm is returned. Disable with `.with_early_stopping(false)` at the engine level.

---

## Genetic Feature Selection (Internal)

```ts
selectFeaturesGA(data, targets, nFeatures, maxFeatures, populationSize, generations): number[]
```

Uses a genetic algorithm to select the optimal feature subset. Each gene is binary (include/exclude). Fitness is evaluated via 3-fold cross-validation with a nearest-neighbor classifier.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[]` | Flat feature data |
| `targets` | `number[]` | Target values |
| `nFeatures` | `number` | Total features |
| `maxFeatures` | `number` | -- | Maximum features to select |
| `populationSize` | `number` | -- | GA population size |
| `generations` | `number` | -- | GA generations |

**Returns:** `number[]` -- Indices of selected features.

---

## PSO Hyperparameter Optimization (Internal)

```ts
optimizeHyperparametersPSO(data, targets, algorithm, nSamples, nFeatures, nParticles, maxIter): AutoMLResult
```

Particle Swarm Optimization for hyperparameter tuning. Search space depends on the algorithm:

| Algorithm | Hyperparameters |
|-----------|----------------|
| KNearestNeighbors | n_neighbors: [1, 50] |
| LogisticRegression | C: [0.01, 10.0], max_iter: [100, 2000] |
| DecisionTree | max_depth: [1, 20], min_samples_split: [2, 100] |
