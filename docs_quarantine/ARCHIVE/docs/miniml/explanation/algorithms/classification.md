# Classification Algorithms

Classification assigns input samples to discrete categories (classes). miniml implements ten classification algorithms, each with different strengths in accuracy, speed, interpretability, and data requirements. This page explains the theory behind each.

## Overview

All classification algorithms in miniml share the same interface: `fit(X, y)` to train on features X and labels y, then `predict(X_new)` to produce class labels for new data. The differences lie in how they learn the decision boundary between classes.

Algorithms fall into broad families:

- **Instance-based:** KNN -- stores training data, compares new points to stored examples
- **Tree-based:** Decision Tree, Random Forest, Gradient Boosting, AdaBoost -- partition feature space
- **Probabilistic:** Naive Bayes, Logistic Regression -- model class probabilities
- **Linear:** Perceptron, SVM -- find separating hyperplanes

## KNN (K-Nearest Neighbors)

KNN is an instance-based (lazy) learner. It does not build an explicit model during training -- it simply stores the training data. At prediction time, it finds the k training points closest to the query point and takes a majority vote.

**Distance metrics:** Euclidean distance is default. The distance between two points x and y with d features:

```
d(x, y) = sqrt( sum_{i=1}^{d} (x_i - y_i)^2 )
```

**Prediction:** Given k nearest neighbors with labels {y_1, ..., y_k}:

```
prediction = mode(y_1, y_2, ..., y_k)
```

**Properties:**
- No training phase -- all computation at prediction time
- O(n) prediction time (must compare to every training point)
- Naturally handles multiclass problems
- Sensitive to feature scaling -- features with larger ranges dominate distance
- K controls the bias-variance tradeoff: small k = low bias, high variance; large k = high bias, low variance

## Decision Tree

A decision tree recursively partitions the feature space into regions, assigning a class label to each region. Each internal node tests a feature against a threshold; each leaf node assigns a class.

**Splitting criteria** -- miniml uses Gini impurity (default) and information gain:

Gini impurity of a set S with C classes:

```
Gini(S) = 1 - sum_{c=1}^{C} p_c^2
```

where p_c is the proportion of class c in S. The split that minimizes the weighted average Gini of the two child nodes is chosen.

Information gain (based on entropy):

```
Entropy(S) = - sum_{c=1}^{C} p_c * log2(p_c)
Gain(S, A) = Entropy(S) - sum_{v in values(A)} (|S_v| / |S|) * Entropy(S_v)
```

**Properties:**
- Fast training: O(n * d * log n) for n samples, d features
- Fast prediction: O(depth) -- typically O(log n)
- Interpretable: can inspect the tree to understand decisions
- Prone to overfitting without depth limits or pruning
- Nonparametric: no assumptions about data distribution

## Random Forest

Random Forest is an ensemble of decision trees trained with bagging (bootstrap aggregating) and feature subspace randomization.

**Bagging:** Each tree is trained on a bootstrap sample -- a random sample of n training points drawn with replacement. On average, each bootstrap sample contains ~63.2% unique training points (the rest are duplicates).

**Feature subspace:** At each split, only a random subset of sqrt(d) features is considered. This decorrelates the trees.

**Prediction:** Majority vote across all trees:

```
prediction = mode(T_1(x), T_2(x), ..., T_B(x))
```

where T_i is the i-th tree and B is the number of trees.

**Properties:**
- Reduces variance compared to a single decision tree
- Robust to overfitting (ensemble averaging smooths out individual tree errors)
- Handles high-dimensional data well (feature subspace randomization)
- Less interpretable than a single tree
- Training is parallelizable (each tree is independent)

## Gradient Boosting

Gradient Boosting builds an ensemble of weak learners (typically shallow decision trees) sequentially. Each new tree is trained to correct the errors of the previous ensemble.

**Mechanism:** Instead of fitting the target directly, each tree fits the negative gradient of the loss function (residuals):

```
F_0(x) = argmin_c sum L(y_i, c)           // initial prediction (mean/mode)
F_m(x) = F_{m-1}(x) + nu * h_m(x)        // add m-th tree with learning rate nu
```

where h_m(x) is the tree fitted to the pseudo-residuals:

```
r_i = -dL(y_i, F(x_i)) / dF(x_i)         // gradient of loss w.r.t. current prediction
```

**Learning rate (nu/shrinkage):** Scales each tree's contribution. Smaller values (0.01-0.1) require more trees but generalize better.

**Properties:**
- Often the most accurate algorithm on tabular data
- Reduces both bias and variance (unlike bagging, which mainly reduces variance)
- Sequential training -- not parallelizable
- Sensitive to hyperparameters (learning rate, tree depth, number of trees)
- Can overfit without proper regularization

## AdaBoost

AdaBoost (Adaptive Boosting) trains weak learners sequentially, reweighting training samples to focus on previously misclassified examples.

**Mechanism:**

```
Initialize: w_i = 1/n for all samples
For each round t:
    Train weak learner h_t on weighted samples
    Compute error: epsilon_t = sum(w_i * I(h_t(x_i) != y_i)) / sum(w_i)
    Compute alpha_t = 0.5 * ln((1 - epsilon_t) / epsilon_t)
    Update weights: w_i *= exp(-alpha_t * y_i * h_t(x_i))
    Normalize weights
Final: H(x) = sign(sum(alpha_t * h_t(x)))
```

**Properties:**
- Exponential loss function makes it sensitive to outliers and noisy labels
- Converges quickly -- often needs fewer rounds than gradient boosting
- Each weak learner needs only to be slightly better than random (accuracy > 0.5)
- Theoretical error bound decreases exponentially with the number of rounds

## Naive Bayes

Naive Bayes applies Bayes' theorem with a strong (naive) conditional independence assumption:

```
P(y | x_1, ..., x_d) = P(y) * prod_{i=1}^{d} P(x_i | y) / P(x)
```

Prediction: `argmax_y P(y) * prod_i P(x_i | y)`.

The independence assumption means each feature's probability given the class is estimated independently. This is almost never true in practice, but Naive Bayes often works surprisingly well anyway.

**Properties:**
- Extremely fast: O(n * d) training, O(d) prediction
- Works well with high-dimensional data (text classification)
- Requires very little training data
- Poor calibration -- predicted probabilities are often extreme
- Cannot model feature interactions

## Logistic Regression

Logistic regression models the probability of class membership using the sigmoid (logistic) function:

```
P(y=1 | x) = 1 / (1 + exp(-(w^T * x + b)))
```

Training maximizes the log-likelihood via gradient descent:

```
L(w) = sum_i [y_i * log(sigma(w^T * x_i)) + (1 - y_i) * log(1 - sigma(w^T * x_i))]
```

**Properties:**
- Linear decision boundary
- Outputs calibrated probabilities
- Fast training with gradient descent
- Assumes linear separability (or approximately so)
- Regularization (L1/L2) controls overfitting

## Perceptron

The perceptron is the simplest linear classifier. It updates weights whenever a sample is misclassified:

```
if y_i * (w^T * x_i + b) <= 0:
    w = w + learning_rate * y_i * x_i
    b = b + learning_rate * y_i
```

**Convergence theorem:** If the data is linearly separable, the perceptron converges in a finite number of updates. If not, it oscillates indefinitely.

**Properties:**
- Simplest classifier -- easy to understand and implement
- Guaranteed convergence on linearly separable data
- No convergence guarantee on non-separable data
- Sensitive to learning rate and initialization
- Basis for neural networks

## SVM (Support Vector Machine)

SVM finds the hyperplane that maximizes the margin between classes. Only the support vectors (training points closest to the decision boundary) determine the solution.

**Objective (soft margin):**

```
min  0.5 * ||w||^2 + C * sum_i xi_i
s.t. y_i * (w^T * x_i + b) >= 1 - xi_i
     xi_i >= 0
```

where C controls the tradeoff between margin width and classification error.

**Kernel trick:** SVM can implicitly map data to higher dimensions using a kernel function K(x, x') without computing the transformation explicitly. This allows learning nonlinear decision boundaries.

**Properties:**
- Maximum margin principle provides good generalization
- Effective in high-dimensional spaces
- Memory-intensive for large datasets (kernel matrix is n x n)
- Binary by default -- multiclass requires one-vs-rest or one-vs-one

## Algorithm Comparison

| Algorithm | Accuracy | Speed (Train) | Speed (Predict) | Interpretability | Data Size | Linearity |
|-----------|----------|---------------|-----------------|-----------------|-----------|-----------|
| KNN | Medium | Instant | Slow (O(n)) | Low | Small-Med | Nonlinear |
| Decision Tree | Medium | Fast | Fast | High | Any | Nonlinear |
| Random Forest | High | Medium | Medium | Low | Any | Nonlinear |
| Gradient Boosting | Very High | Slow | Fast | Low | Any | Nonlinear |
| AdaBoost | High | Medium | Fast | Low | Any | Nonlinear |
| Naive Bayes | Low-Medium | Very Fast | Very Fast | Medium | Any | Linear (assumed) |
| Logistic Regression | Medium | Fast | Very Fast | High | Any | Linear |
| Perceptron | Low-Medium | Fast | Very Fast | High | Any | Linear |
| SVM | High | Medium | Medium | Low | Small-Med | Linear/Kernel |

## See Also

- [Ensemble Methods](ensembles.md) -- Deep dive into bagging, boosting, and stacking
- [Clustering Algorithms](clustering.md) -- Unsupervised counterparts to classification
- [Regression Analysis](regression.md) -- Continuous output variants of these algorithms
- [Algorithm Reference](../../../algorithms.md) -- API details and usage examples
