# What is AutoML?

AutoML (Automated Machine Learning) removes the need for manual trial-and-error in building ML pipelines. Instead of hand-picking algorithms, features, and hyperparameters, AutoML searches the space of possible configurations and finds combinations that perform well on your data.

## What AutoML Automates

A typical ML workflow involves three interdependent decisions:

1. **Feature Selection** -- Which columns in your dataset actually help predict the target? Irrelevant features add noise; redundant features add computational cost.
2. **Algorithm Selection** -- Which model family fits your data best? A decision tree may excel on tabular data with nonlinear relationships, while logistic regression may suffice for linearly separable classes.
3. **Hyperparameter Tuning** -- What configuration of the chosen algorithm yields the best generalization? Tree depth, learning rate, number of neighbors -- these knobs matter.

Making these three decisions manually requires domain expertise, iterative experimentation, and significant time. AutoML formalizes the search into an optimization problem.

## miniml's Approach: GA + PSO

miniml uses two complementary metaheuristic algorithms:

- **Genetic Algorithm (GA)** for feature selection -- searches the discrete space of feature subsets
- **Particle Swarm Optimization (PSO)** for hyperparameter tuning -- searches the continuous/ordinal space of hyperparameter values

These are not grid search or random search. They are population-based methods that learn from previous evaluations to focus the search on promising regions.

### Genetic Algorithm for Feature Selection

Each candidate solution is a **binary chromosome** with one gene per feature: 1 means the feature is included, 0 means excluded. The algorithm evolves a population of these chromosomes:

```
population = [chromosome, chromosome, ...]   // e.g., 50 individuals

for each generation:
    fitness = evaluate(chromosome)           // cross-validation score
    select parents based on fitness          // tournament or roulette
    crossover: swap gene segments            // single-point or uniform
    mutate: flip random genes (low rate)     // maintain diversity
    replace weakest individuals
```

The fitness function is the cross-validation accuracy (or F1, or RMSE) of a model trained on the selected features. This directly optimizes for generalization rather than training accuracy.

Key parameters: population size (default 50), mutation rate (default 0.01), generations (default 50).

### Particle Swarm Optimization for Hyperparameters

PSO treats each hyperparameter configuration as a point in a multidimensional space. A swarm of particles explores this space, each remembering its personal best position and the swarm's global best:

```
for each particle i:
    velocity[i] = inertia * velocity[i]
                 + cognitive * random * (personal_best[i] - position[i])
                 + social * random * (global_best - position[i])
    position[i] = position[i] + velocity[i]
    fitness[i] = evaluate(position[i])
    update personal_best, global_best
```

PSO works well for hyperparameters because the space is typically continuous (learning rate, regularization strength) or ordinal (tree depth, number of estimators). Particles naturally balance exploration (inertia, social component) with exploitation (cognitive component).

Key parameters: swarm size (default 30), inertia weight, cognitive and social coefficients, iterations (default 50).

## The Pipeline

The full AutoML pipeline in miniml runs as follows:

```
Raw Data
    |
    v
[Feature Selection via GA]
    |  Selects optimal feature subset
    v
[Algorithm Evaluation]
    |  Tries each algorithm on selected features
    |  KNN, Decision Tree, Random Forest, SVM, etc.
    v
[Hyperparameter Optimization via PSO]
    |  For best algorithm(s), tunes hyperparameters
    v
Best Pipeline: {features, algorithm, hyperparameters}
```

Each stage feeds into the next. Feature selection narrows the search space for algorithm evaluation, and algorithm evaluation identifies which models are worth tuning.

## When to Use AutoML vs Manual Selection

| Scenario | Recommendation |
|----------|---------------|
| Exploring a new dataset with unknown characteristics | Use AutoML to establish a baseline |
| Domain expert with strong prior knowledge | Manual selection may be faster |
| Many features, unclear relevance | GA feature selection saves significant time |
| Production pipeline with tight latency requirements | AutoML to find best model, then manual verification |
| Limited data, high-dimensional | AutoML feature selection critical to avoid overfitting |
| Real-time inference needed | AutoML may find a simpler, faster model than manual selection |

## Limitations and Trade-offs

**Computational cost.** AutoML evaluates hundreds of candidate pipelines. Each evaluation requires cross-validation, which means training multiple models. This is inherently slower than a single manual training run.

**No free lunch.** The No Free Lunch theorem states that no single optimization strategy outperforms all others across all possible problems. GA+PSO work well for the problem structure typical of ML pipelines, but there are datasets where a manual expert will find a better configuration.

**Search space bounds.** AutoML can only search within the space you give it. If the best algorithm is not in the candidate list, or if feature engineering (creating new features from existing ones) is needed, AutoML cannot help.

**Overfitting the validation set.** Running hundreds of evaluations on the same validation folds can leak information. miniml uses nested cross-validation (inner loop for hyperparameter search, outer loop for model evaluation) to mitigate this.

**Reproducibility.** Metaheuristics are stochastic. Two runs may produce different results. Set a seed for reproducible pipelines.

## See Also

- [Optimization Suite](../../../optimization.md) -- Full parameter reference for GA and PSO
- [Algorithms](../algorithms/classification.md) -- Theory behind each algorithm AutoML can select
- [AutoML Guide](../../../automl.md) -- Practical usage and configuration
