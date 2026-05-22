# Ensemble Methods

Ensemble methods combine multiple base learners to produce a single prediction that is more accurate and robust than any individual learner. The core insight is simple: a committee of experts, if sufficiently diverse, will make better decisions than any single expert alone.

## Why Ensembles Work

### Bias-Variance Decomposition

Any model's prediction error can be decomposed into three components:

```
Total Error = Bias^2 + Variance + Irreducible Noise
```

- **Bias** -- systematic error from the model being too simple to capture the true pattern
- **Variance** -- error from the model being too sensitive to the specific training data
- **Irreducible noise** -- inherent randomness in the data (cannot be eliminated)

A single model must trade off bias and variance. Ensembles can reduce both simultaneously by combining models that make different errors.

### Wisdom of Crowds

If you have B independent models, each with accuracy p > 0.5, the majority vote of the ensemble has higher accuracy than any individual model. The key requirement is **diversity** -- models must make different errors. If all models make the same errors, the ensemble gains nothing.

Ensemble methods enforce diversity through different mechanisms:
- **Bagging:** Different training data subsets (bootstrap samples)
- **Boosting:** Sequential focus on different error patterns
- **Stacking:** Different algorithms learning different aspects of the data

## Bagging (Bootstrap Aggregating)

Bagging trains multiple models on different bootstrap samples of the training data and combines predictions by averaging (regression) or majority voting (classification).

### How It Works

```
For b = 1 to B:
    S_b = bootstrap_sample(S)           // sample n points with replacement
    model_b = train(S_b)                // independent training
Prediction: mode(model_1(x), ..., model_B(x))   // classification
           or mean(model_1(x), ..., model_B(x))  // regression
```

### Bootstrap Sampling

A bootstrap sample is drawn by sampling n points from the training set with replacement. Each sample contains approximately 63.2% unique training points. The remaining ~36.8% are out-of-bag (OOB) samples, which provide a free validation estimate.

### Why Bagging Reduces Variance

Each model sees a slightly different dataset and thus produces a slightly different prediction. The variance of the average of B independent predictions is Var/Mean^2 / B. By averaging, the ensemble's variance decreases proportionally to 1/B.

Bagging is most effective with high-variance models (deep decision trees). It provides minimal benefit for low-variance models (linear regression), which already have low variance.

### Random Forest: Bagging with Feature Subspace

Random Forest extends bagging by adding a second source of diversity: at each split in each tree, only a random subset of features (typically sqrt(d) for classification, d/3 for regression) is considered. This decorrelates trees further, especially when some features are strongly predictive.

Without feature subspace, if one feature is very informative, all trees would split on it first, producing correlated trees. With feature subspace, different trees split on different features, increasing diversity.

## Boosting

Boosting trains models sequentially, where each new model focuses on the errors of the current ensemble. Unlike bagging, which trains models independently, boosting adapts based on performance.

### Gradient Boosting

Gradient Boosting frames the ensemble as a functional gradient descent problem. The ensemble is built by iteratively adding trees that reduce the loss:

```
F_0(x) = argmin_c sum L(y_i, c)                    // initial constant prediction
For m = 1 to M:
    r_i = -dL(y_i, F_{m-1}(x_i)) / dF              // pseudo-residuals (negative gradient)
    h_m = fit_tree(X, r)                             // tree fitted to residuals
    F_m(x) = F_{m-1}(x) + nu * h_m(x)               // add tree with learning rate
```

Key concepts:
- **Pseudo-residuals** -- the direction in which the loss would decrease most (steepest descent)
- **Learning rate (nu)** -- shrinks each tree's contribution. Smaller values need more trees but generalize better
- **Tree depth** -- shallow trees (depth 3-8) act as weak learners that avoid overfitting
- **Subsampling** -- using a fraction of training data per round adds stochasticity and regularization

### AdaBoost

AdaBoost uses a different mechanism: it reweights training samples based on classification errors.

```
Initialize: w_i = 1/n
For t = 1 to T:
    Train weak learner h_t on weighted samples
    Compute weighted error: epsilon_t = sum(w_i * I(h_t(x_i) != y_i))
    Compute: alpha_t = 0.5 * ln((1 - epsilon_t) / epsilon_t)
    Reweight: w_i *= exp(alpha_t * I(h_t(x_i) != y_i))
    Normalize: w_i = w_i / sum(w_i)
Final: H(x) = sign(sum(alpha_t * h_t(x)))
```

Misclassified samples get higher weights, forcing subsequent learners to focus on hard examples. The alpha_t weight gives more influence to more accurate learners.

### Why Boosting Reduces Bias

Each round of boosting fits the residual error of the current ensemble. If the current ensemble underfits (high bias), the residuals are large and informative, and the next tree can reduce the bias. Sequential correction allows the ensemble to approximate complex functions that no single tree could represent.

### Regularization in Boosting

Boosting can overfit if run too long. Regularization strategies:
- **Learning rate** -- smaller nu requires more trees but reduces overfitting
- **Tree depth** -- limiting depth limits model complexity
- **Subsampling** -- using a fraction of data per round adds noise (stochastic gradient descent)
- **Early stopping** -- stop when validation loss stops improving

## Stacking

Stacking (Stacked Generalization) trains a meta-learner on the predictions of multiple base learners. Unlike bagging and boosting, stacking can combine fundamentally different algorithms:

```
Level 0 (base learners):
    KNN, Decision Tree, Random Forest, SVM, Logistic Regression
    -- each produces predictions (or probabilities)

Level 1 (meta-learner):
    Trained on: [KNN_pred, DT_pred, RF_pred, SVM_pred, LR_pred] -> true_label
    -- learns which base learners to trust for different types of inputs
```

The meta-learner must be trained on out-of-fold predictions to avoid overfitting (using the same data for both levels causes the meta-learner to trust base learners that overfit their training data).

Stacking is more complex than bagging or boosting but can capture complementary strengths of different algorithms.

## When to Use Which Method

| Method | Best When | Avoid When |
|--------|-----------|------------|
| **Bagging / Random Forest** | High-variance base models, need parallelism, limited tuning | Need maximum accuracy, base models are already low-variance |
| **Gradient Boosting** | Tabular data, need best accuracy, can tune hyperparameters | Need fast training, limited compute, noisy data |
| **AdaBoost** | Binary classification, weak learners available, quick convergence | Noisy data with outliers (exponential loss is sensitive) |
| **Stacking** | Multiple good but diverse algorithms available | Limited data, need simplicity, production latency constraints |

## Trade-offs

| Dimension | Bagging | Boosting | Stacking |
|-----------|---------|----------|----------|
| **Training speed** | Fast (parallel) | Slow (sequential) | Slow (multiple models) |
| **Prediction speed** | Medium (average B models) | Medium (sum M trees) | Slow (all base + meta) |
| **Accuracy** | High | Very High | Very High |
| **Overfitting risk** | Low | Medium-High | Medium |
| **Hyperparameter sensitivity** | Low | High | Medium |
| **Interpretability** | Low | Low | Very Low |
| **Parallelizable** | Yes (independent models) | No (sequential) | Partially (base learners only) |

## See Also

- [Classification Algorithms](classification.md) -- Individual algorithms used as base learners
- [What is AutoML?](../automl/overview.md) -- How AutoML selects and tunes ensemble methods
- [Algorithm Reference](../../../algorithms.md) -- API details and configuration options
