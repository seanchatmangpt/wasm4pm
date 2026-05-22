# AutoML Configuration

Configuration parameters for the AutoML pipeline optimizer, including genetic algorithm feature selection and PSO hyperparameter optimization.

## AutoML Pipeline

AutoML in miniml performs three stages:

1. **Feature Selection** -- Genetic algorithm selects the most informative feature subset
2. **Algorithm Evaluation** -- Tests candidate algorithms with cross-validation
3. **Pipeline Optimization** -- PSO tunes hyperparameters for the best algorithm

## API Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `autoFitClassification(x, y, nSamples, nFeatures)` | Automated classification pipeline | `AutoMLResult` |
| `autoFitRegression(x, y, nSamples, nFeatures)` | Automated regression pipeline | `AutoMLResult` |
| `recommendAlgorithm(nSamples, nFeatures, nClasses, isSparse)` | Algorithm recommendation | `string` |

## Genetic Algorithm Parameters (Feature Selection)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `populationSize` | 50 | Number of individuals per generation |
| `generations` | 50 | Number of generations to evolve |
| `mutationRate` | 0.1 | Probability of flipping a feature bit per individual |
| `crossoverRate` | 0.7 | Probability of performing crossover between parents |
| `elitismCount` | 2 | Number of top individuals preserved unchanged per generation |
| `tournamentSize` | 3 | Tournament selection pool size |

### Feature Representation

Each individual is a binary vector of length `nFeatures`. A `1` means the feature is included, `0` means excluded.

### Fitness Function

Fitness is the cross-validation score (accuracy for classification, R-squared for regression) of the best algorithm using that feature subset.

## PSO Parameters (Hyperparameter Optimization)

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `particles` | 20 | 10-50 | Number of particles in the swarm |
| `inertia` | 0.7 | 0.4-0.9 | Momentum weight (velocity damping) |
| `cognitive` | 1.5 | 1.0-2.0 | Personal best attraction (c1) |
| `social` | 1.5 | 1.0-2.0 | Global best attraction (c2) |
| `maxVelocity` | 0.5 | 0.1-1.0 | Maximum velocity clamping per dimension |
| `maxIterations` | 100 | 50-500 | Maximum iterations before stopping |
| `tolerance` | 1e-6 | -- | Convergence tolerance on fitness improvement |

### Hyperparameter Search Space

PSO optimizes over algorithm-specific hyperparameters:

| Algorithm | Hyperparameters Searched |
|-----------|------------------------|
| KNN | `k` (1-20) |
| Decision Tree | `maxDepth` (3-20), `minSamplesSplit` (2-10) |
| Logistic Regression | `learningRate` (0.001-1.0), `lambda` (0.0-10.0) |
| Naive Bayes | (no hyperparameters) |
| Linear Regression | `learningRate` (0.001-1.0), `lambda` (0.0-10.0) |

## Cross-Validation Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `folds` | 5 | Number of CV folds |
| `stratified` | true | Use stratified sampling for classification |

## Algorithm Selection

AutoML evaluates these algorithms:

**Classification:** KNN, Decision Tree, Logistic Regression, Naive Bayes, Perceptron
**Regression:** Linear Regression, Polynomial Regression (degree 2)

The algorithm with the highest CV score is selected for the final pipeline.

## Usage Example

```typescript
import { init, autoFitClassification, autoFitRegression } from '@seanchatmangpt/wminml';
await init();

// AutoML automatically selects features and tunes hyperparameters
const result = await autoFitClassification(X, y, nSamples, nFeatures);

console.log(result.best_algorithm);  // e.g., "decision_tree"
console.log(result.best_score);      // e.g., 0.95
console.log(result.selected_features); // e.g., [0, 2, 5]
console.log(result.summary());

// Algorithm recommendation (no training needed)
const recommendation = await recommendAlgorithm(nSamples, nFeatures, nClasses, false);
console.log(recommendation); // e.g., "logistic_regression"
```

## AutoMLResult Interface

| Property | Type | Description |
|----------|------|-------------|
| `best_algorithm` | `string` | Name of the best algorithm found |
| `best_score` | `number` | Cross-validation score of the best algorithm |
| `evaluations` | `object` | Detailed evaluation results per algorithm |
| `selected_features` | `number[]` | Indices of selected features |
| `algorithm_scores` | `string[]` | Score summary per algorithm |
| `rationale` | `string` | Explanation of the selection |
| `original_features` | `number` | Total number of original features |
| `feature_selection_performed` | `boolean` | Whether feature selection was applied |
| `problem_type` | `string` | `'classification'` or `'regression'` |
| `summary()` | `() => string` | Human-readable summary |
| `algorithmScore(name)` | `(name: string) => number \| null` | Get score for a specific algorithm |

## Tuning Tips

- **More generations/population** = better feature selection but slower.
- **More particles/iterations** = better hyperparameter tuning but slower.
- For small datasets (< 50 samples), reduce `folds` to 3.
- For large datasets (> 1000 samples), reduce `populationSize` to 20 and `generations` to 30.
- Set `tolerance` tighter (1e-8) for higher quality; looser (1e-3) for faster convergence.
