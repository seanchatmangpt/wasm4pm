# AutoML Quick Start

Let miniml find the best algorithm, features, and hyperparameters for your dataset automatically.

## What AutoML Does

Picking the right algorithm and tuning its parameters is hard. miniml's `autoFitClassification` does it for you using two optimization techniques:

- **Genetic Algorithm (GA) feature selection**: Tests combinations of features to find the subset that maximizes accuracy
- **Particle Swarm Optimization (PSO) hyperparameter tuning**: Searches hyperparameter space to find optimal settings for each algorithm

You provide data. AutoML returns the best model it found, plus an explanation of why.

## Basic Usage

```typescript
import { init, autoFitClassification, autoFitRegression } from '@seanchatmangpt/wminml';

await init();

// 60 samples, 4 features, 3 classes (synthetic iris-like dataset)
const X = new Float64Array(240); // fill with your data
const y = new Float64Array(60);  // class labels: 0, 1, or 2

const result = await autoFitClassification(X, y, 60, 4);

console.log(`Best algorithm: ${result.algorithm}`);
console.log(`Accuracy:       ${(result.accuracy * 100).toFixed(1)}%`);
```

That's it. `autoFitClassification` trains multiple algorithms, selects features, tunes hyperparameters, and returns the winner.

For regression tasks, use `autoFitRegression` with the same signature:

```typescript
const regResult = await autoFitRegression(X, y, 100, 3);
console.log(`Best regressor: ${regResult.algorithm}`);
console.log(`R² score:       ${regResult.accuracy.toFixed(3)}`);
```

## How It Works Under the Hood

The AutoML pipeline runs in stages:

1. **Feature selection** (optional): A genetic algorithm evaluates subsets of your features across several generations. Features that hurt accuracy get dropped.
2. **Algorithm selection**: Every classifier in miniml gets a chance -- KNN, Decision Tree, Random Forest, Gradient Boosting, Naive Bayes, Logistic Regression.
3. **Hyperparameter tuning**: PSO particles explore the hyperparameter space for the top-performing algorithms.
4. **Cross-validation**: Models are evaluated with k-fold cross-validation to avoid overfitting.
5. **Selection**: The model with the highest cross-validated accuracy wins.

## Getting Recommendations

Not sure where to start? Use `recommendAlgorithm` to get a suggestion based on your data characteristics:

```typescript
import { recommendAlgorithm } from '@seanchatmangpt/wminml';

const suggestion = await recommendAlgorithm(1000, 20, 3, false);
console.log(`Recommended: ${suggestion}`);
```

## AutoML vs Manual Selection

When should you use AutoML versus picking an algorithm yourself?

| Scenario | Recommendation |
|----------|---------------|
| Exploring a new dataset | AutoML -- let it survey the landscape |
| Production pipeline with tight latency | Manual -- you know the best model already |
| Many features, unknown relevance | AutoML with feature selection enabled |
| Benchmarking / research | Manual -- you need control over each variable |
| Quick prototype | AutoML -- fastest path to a working model |

AutoML is a starting point, not an endpoint. Once you know which algorithm works best, you can train it manually with more fine-grained control.

## Summary

1. `autoFitClassification(x, y, nSamples, nFeatures)` tries every classifier and returns the best
2. `autoFitRegression(x, y, nSamples, nFeatures)` does the same for regression
3. `recommendAlgorithm(nSamples, nFeatures, nClasses, isSparse)` suggests which algorithm to try
4. Result includes `algorithm`, `accuracy`, and `predict()` for inference

## Next Steps

- **How-to**: Deep-dive into AutoML configuration in [how_to/automl/](../how_to/automl/)
- **Explanation**: How the genetic algorithm and PSO work in [explanation/automl/](../explanation/automl/)
- **Tutorial 01**: If you skipped it, start with [Your First ML Model](./01-first-model.md)
