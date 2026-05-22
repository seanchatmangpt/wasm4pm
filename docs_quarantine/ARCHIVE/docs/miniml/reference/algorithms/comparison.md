# Algorithm Comparison

When to use which algorithm. Decision guides organized by task type.

## Classification: Which Algorithm?

### Quick Decision Flow

1. **Small dataset (< 100 samples)?**
   - Yes: Naive Bayes or Logistic Regression
   - No: continue

2. **Need interpretable model?**
   - Yes: Decision Tree or Logistic Regression
   - No: continue

3. **Nonlinear decision boundary expected?**
   - Yes: SVM (RBF kernel) or Random Forest
   - No: Logistic Regression or Perceptron

4. **Need best possible accuracy?**
   - Yes: Gradient Boosting or Stacking
   - No: KNN or Decision Tree

### Comparison Table

| Algorithm | Accuracy | Speed (Train) | Speed (Predict) | Interpretability | Data Size |
|-----------|----------|---------------|-----------------|------------------|-----------|
| KNN | Medium | Instant | Slow | Medium | Small-Medium |
| Decision Tree | Medium | Fast | Fast | High | Any |
| Random Forest | High | Medium | Medium | Low | Medium-Large |
| Logistic Regression | Medium | Fast | Fast | High | Any |
| Naive Bayes | Low-Medium | Fast | Fast | High | Any |
| SVM | High | Slow | Medium | Low | Small-Medium |
| Gradient Boosting | Very High | Medium | Medium | Low | Medium |
| Neural Network | Very High | Slow | Fast | Low | Large |

## Regression: Which Algorithm?

### Quick Decision Flow

1. **Linear relationship?**
   - Yes: Linear Regression or Ridge
   - No: continue

2. **Need uncertainty estimates?**
   - Yes: Bayesian Linear Regression or Gaussian Process
   - No: continue

3. **Outlier-robust prediction needed?**
   - Yes: Quantile Regression
   - No: continue

4. **Complex nonlinear pattern?**
   - Yes: SVR (RBF) or Polynomial Regression
   - No: Elastic Net

### Comparison Table

| Algorithm | Accuracy | Speed (Train) | Uncertainty | Robustness | Assumptions |
|-----------|----------|---------------|-------------|------------|-------------|
| Linear | Medium | Fast | No | Low | Linear, normal errors |
| Ridge | Medium | Fast | No | Medium | Linear |
| Elastic Net | Medium | Fast | No | High | Linear |
| Polynomial | High | Fast | No | Low | Polynomial pattern |
| SVR | High | Slow | No | Medium | Kernel choice |
| Quantile | Medium | Fast | Yes (quantile) | High | Minimal |
| Bayesian Linear | Medium | Fast | Yes | Medium | Conjugate prior |
| Gaussian Process | High | Slow | Yes | Medium | Stationarity |

## Clustering: Which Algorithm?

| Algorithm | Cluster Shape | Needs k? | Handles Outliers | Speed |
|-----------|--------------|----------|-----------------|-------|
| K-Means | Spherical | Yes | No | Fast |
| K-Means++ | Spherical | Yes | No | Fast |
| DBSCAN | Arbitrary | No | Yes | Medium |
| Hierarchical | Any (via linkage) | Yes (cut) | No | Slow |

- **Use K-Means** when clusters are roughly spherical and you know k.
- **Use DBSCAN** when you do not know k and need outlier detection.
- **Use Hierarchical** when you want a dendrogram and to explore different numbers of clusters.

## Preprocessing: Which Scaler?

| Scaler | When to Use | Sensitive to Outliers? |
|--------|-------------|----------------------|
| Standard Scaler | General purpose, algorithms assuming normality | Yes |
| Min-Max Scaler | Neural networks, image data | Yes |
| Robust Scaler | Data with outliers | No |
| Normalizer | Text data, TF-IDF features | No |

## Statistical Tests: Which Test?

### Comparing Two Groups

| Situation | Parametric | Nonparametric |
|-----------|-----------|---------------|
| Independent groups, normal | Two-Sample T-Test | Mann-Whitney U |
| Paired, normal differences | Paired T-Test | Wilcoxon Signed-Rank |
| Independent groups, unequal variance | Welch's T-Test | Mann-Whitney U |

### Comparing Three+ Groups

| Situation | Test |
|-----------|------|
| Normal data, equal variance | One-Way ANOVA |
| Categorical counts | Chi-Square Independence |
| Ordinal or non-normal | Kruskal-Wallis (use Mann-Whitney pairwise) |

### Distribution Checks

| Question | Test |
|----------|------|
| Is data normally distributed? | KS Test |
| Does data fit expected frequencies? | Chi-Square Goodness-of-Fit |
| Is a mean different from a value? | One-Sample T-Test |

## Survival Analysis: Which Model?

| Question | Algorithm |
|----------|-----------|
| What is the survival probability over time? | Kaplan-Meier |
| Which covariates affect survival? | Cox Proportional Hazards |
| Need median survival time? | Kaplan-Meier (median field) |

## Graph Algorithms: Which to Use?

| Question | Algorithm |
|----------|-----------|
| Which nodes are most important? | PageRank |
| What is the shortest path between two nodes? | Shortest Path (Dijkstra) |
| Are there natural groups in the network? | Community Detection |
