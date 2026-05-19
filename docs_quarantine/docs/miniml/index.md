# miniml Documentation (Diataxis Framework)

Complete documentation for miniml, organized using the Diataxis framework.

## What is Diataxis?

**Diataxis** is a documentation pattern that organizes content into four categories based on user intent:

1. **Tutorials** — Learning-oriented lessons
2. **How-to Guides** — Problem-oriented instructions
3. **Explanation** — Understanding-oriented theory
4. **Reference** — Information-oriented specifications

## Quick Navigation

| I want to... | Go to |
|--------------|-------|
| **Learn miniml from scratch** | [Tutorials](#tutorials) |
| **Solve a specific problem** | [How-to Guides](#how-to-guides) |
| **Understand how it works** | [Explanations](#explanations) |
| **Look up API details** | [Reference](#reference) |

---

## Tutorials

*Learning-oriented lessons that guide you from zero to working knowledge.*

### Getting Started
- **[Your First ML Model](tutorials/01-first-model.md)** — Train your first classifier in 5 minutes
- **[AutoML Quick Start](tutorials/02-automl-quickstart.md)** — Automatic feature selection and hyperparameter tuning
- **[Time Series Analysis](tutorials/03-time-series.md)** — Forecast sales data with miniml
- **[Customer Clustering](tutorials/04-clustering.md)** — Segment customers with K-Means++

### Advanced Tutorials
- **[Probabilistic Methods](tutorials/05-probabilistic.md)** — Monte Carlo and Markov Chain methods
- **[Statistical Analysis](tutorials/06-statistical.md)** — Hypothesis testing and inference
- **[Gaussian Processes](tutorials/07-gaussian-processes.md)** — Uncertainty quantification

---

## How-to Guides

*Problem-oriented guides that answer "How do I...?" questions.*

### Classification
- **[Train a Classifier](how_to/classification/train-model.md)** — Choose and train the right classifier
- **[Handle Imbalanced Data](how_to/classification/imbalanced-data.md)** — Techniques for skewed classes
- **[Multi-class Classification](how_to/classification/multi-class.md)** — Beyond binary classification

### Regression
- **[Predict Continuous Values](how_to/regression/predict-values.md)** — Choose and train regression models
- **[Regularization Techniques](how_to/regression/regularization.md)** — L1, L2, and Elastic Net
- **[Non-linear Relationships](how_to/regression/nonlinear.md)** — Polynomial, exponential, power models

### Clustering
- **[Choose K for K-Means](how_to/clustering/choose-k.md)** — Elbow method, silhouette analysis
- **[Handle Arbitrary Shapes](how_to/clustering/dbscan.md)** — Density-based clustering
- **[Hierarchical Clustering](how_to/clustering/hierarchical.md)** — Dendrograms and linkage methods

### Preprocessing
- **[Scale Your Features](how_to/preprocessing/scaling.md)** — Standard Scaler, MinMax, Robust
- **[Encode Categorical Data](how_to/preprocessing/encoding.md)** — Label, One-Hot, Ordinal
- **[Handle Missing Values](how_to/preprocessing/missing-values.md)** — Imputation strategies

### AutoML
- **[Automatic Feature Selection](how_to/automl/feature-selection.md)** — GA-based feature optimization
- **[Hyperparameter Tuning](how_to/automl/hyperparameter-tuning.md)** — PSO optimization
- **[Custom AutoML Pipelines](how_to/automl/custom-pipelines.md)** — Build custom AutoML workflows

### Advanced Analytics
- **[Detect Concept Drift](how_to/analytics/drift-detection.md)** — Monitor model degradation
- **[Find Anomalies](how_to/analytics/anomaly-detection.md)** — Isolation forest, statistical methods
- **[Compute Prediction Intervals](how_to/analytics/prediction-intervals.md)** — Bootstrap, conformal prediction

### Probabilistic Methods
- **[Monte Carlo Integration](how_to/probabilistic/monte-carlo.md)** — Numerical integration via sampling
- **[Markov Chain Analysis](how_to/probabilistic/markov-chains.md)** — Steady state, n-step probabilities
- **[Hidden Markov Models](how_to/probabilistic/hmm.md)** — Forward, Viterbi, Baum-Welch
- **[MCMC Sampling](how_to/probabilistic/mcmc.md)** — Bayesian parameter estimation

### Statistical Analysis
- **[Compare Groups with t-Tests](how_to/statistical/t-tests.md)** — One-sample, two-sample, paired
- **[Test Independence](how_to/statistical/chi-square.md)** — Chi-square tests
- **[ANOVA for Multiple Groups](how_to/statistical/anova.md)** — One-way analysis of variance
- **[Nonparametric Tests](how_to/statistical/nonparametric.md)** — Mann-Whitney U, Wilcoxon

### Kernel Methods
- **[Compute RBF Kernels](how_to/kernels/rbf.md)** — Radial basis function kernels
- **[Polynomial Kernels](how_to/kernels/polynomial.md)** — Polynomial kernel matrices
- **[Sigmoid Kernels](how_to/kernels/sigmoid.md)** — Hyperbolic tangent kernels

### Bayesian Methods
- **[Bayesian Parameter Estimation](how_to/bayesian/estimation.md)** — MCMC-based inference
- **[Bayesian Linear Regression](how_to/bayesian/regression.md)** — Conjugate prior regression

### Gaussian Processes
- **[Fit a GP Model](how_to/gaussian-processes/fit.md)** — GP regression with uncertainty
- **[Predict with Uncertainty](how_to/gaussian-processes/predict.md)** — Mean, std, confidence intervals

### Survival Analysis
- **[Kaplan-Meier Estimator](how_to/survival/kaplan-meier.md)** — Survival curves
- **[Cox Proportional Hazards](how_to/survival/cox.md)** — Hazard ratio modeling

### Graph Algorithms
- **[Compute PageRank](how_to/graph/pagerank.md)** — Link analysis ranking
- **[Find Shortest Paths](how_to/graph/shortest-path.md)** — Dijkstra's algorithm
- **[Detect Communities](how_to/graph/community-detection.md)** — Label propagation

---

## Explanations

*Understanding-oriented content that explains concepts and theory.*

### Core Concepts
- **[What is AutoML?](explanation/automl/overview.md)** — Feature selection + hyperparameter optimization + algorithm selection
- **[SIMD Acceleration](explanation/performance/simd.md)** — How WASM v128 intrinsics provide 4-100x speedup
- **[Memory Layout](explanation/architecture/memory-layout.md)** — Flat row-major storage for cache efficiency

### Algorithm Theory
- **[Classification Algorithms](explanation/algorithms/classification.md)** — How KNN, trees, SVMs work
- **[Ensemble Methods](explanation/algorithms/ensembles.md)** — Bagging, boosting, stacking
- **[Clustering Algorithms](explanation/algorithms/clustering.md)** — K-means convergence, DBSCAN density
- **[Regression Analysis](explanation/algorithms/regression.md)** — OLS, regularization, bias-variance tradeoff

### Probabilistic Theory
- **[Monte Carlo Methods](explanation/probabilistic/monte-carlo.md)** — Law of large numbers, variance reduction
- **[Markov Chains](explanation/probabilistic/markov-chains.md)** — Stationary distributions, mixing times
- **[Hidden Markov Models](explanation/probabilistic/hmm.md)** — Forward-backward algorithm, Viterbi path
- **[MCMC Theory](explanation/probabilistic/mcmc.md)** — Detailed balance, convergence diagnostics

### Statistical Theory
- **[Hypothesis Testing](explanation/statistical/hypothesis-testing.md)** — p-values, confidence intervals, statistical power
- **[Probability Distributions](explanation/statistical/distributions.md)** — Normal, Binomial, Poisson, Exponential
- **[ANOVA](explanation/statistical/anova.md)** — F-statistic, assumptions, post-hoc analysis

### Kernel Theory
- **[Kernel Functions](explanation/kernels/overview.md)** — RBF, polynomial, sigmoid kernels
- **[Kernel Trick](explanation/kernels/overview.md)** — Implicit feature spaces

### Bayesian Theory
- **[Bayesian Inference](explanation/bayesian/inference.md)** — Prior, likelihood, posterior
- **[Conjugate Priors](explanation/bayesian/inference.md)** — Closed-form Bayesian updating

### Gaussian Process Theory
- **[GP Regression](explanation/gaussian-processes/regression.md)** — Kernel functions, covariance matrices
- **[Uncertainty Quantification](explanation/gaussian-processes/regression.md)** — Prediction intervals, posterior variance

---

## Reference

*Information-oriented technical specifications and API documentation.*

### API Reference
- **[Classification API](reference/api/classification.md)** — Complete classification function signatures
- **[Regression API](reference/api/regression.md)** — Complete regression function signatures
- **[Clustering API](reference/api/clustering.md)** — Complete clustering function signatures
- **[Preprocessing API](reference/api/preprocessing.md)** — Complete preprocessing function signatures
- **[AutoML API](reference/api/automl.md)** — Complete AutoML function signatures
- **[Probabilistic API](reference/api/probabilistic.md)** — Complete probabilistic function signatures
- **[Statistical API](reference/api/statistical.md)** — Complete statistical function signatures
- **[Kernel API](reference/api/kernels.md)** — Complete kernel function signatures
- **[Bayesian API](reference/api/bayesian.md)** — Complete Bayesian function signatures
- **[GP API](reference/api/gaussian-processes.md)** — Complete GP function signatures
- **[Survival API](reference/api/survival.md)** — Complete survival function signatures
- **[Association API](reference/api/association.md)** — Complete association rule function signatures
- **[Recommendation API](reference/api/recommendation.md)** — Complete recommendation function signatures
- **[Graph API](reference/api/graph.md)** — Complete graph function signatures

### Algorithm Reference
- **[All Algorithms](reference/algorithms/overview.md)** — Complete list of 70+ algorithms with parameters
- **[Algorithm Complexity](reference/algorithms/complexity.md)** — Time and space complexity analysis
- **[Algorithm Comparison](reference/algorithms/comparison.md)** — When to use which algorithm

### Configuration Reference
- **[AutoML Configuration](reference/config/automl.md)** — GA, PSO, algorithm selection parameters

### Error Handling
- **[Error Types](reference/errors/types.md)** — All MlError variants and meanings
- **[Troubleshooting](reference/errors/troubleshooting.md)** — Common issues and solutions

---

## Diataxis Principles

### Content Guidelines

| Category | Purpose | Tone | Style |
|----------|---------|------|-------|
| **Tutorials** | Learning | Conversational, step-by-step | Code-first, minimal theory |
| **How-to Guides** | Problem-solving | Direct, pragmatic | Solution-focused, reusable |
| **Explanation** | Understanding | Clear, conceptual | Theory-first, examples optional |
| **Reference** | Information | Concise, precise | Formal, complete |

### Writing Guidelines

- **Start with the goal** — What does the user want to achieve?
- **Be specific** — Use concrete examples and real data
- **Show, don't tell** — Code examples over prose descriptions
- **Link to related content** — Cross-reference between categories
- **Keep it updated** — Documentation must match current code

---

## Documentation Stats

| Category | Files | Coverage |
|----------|-------|----------|
| **Tutorials** | 7 | Classification, AutoML, time series, clustering, probabilistic, statistical, GP |
| **How-to Guides** | 32 | All 15 algorithm families |
| **Explanations** | 17 | Core concepts, algorithm theory, probabilistic, statistical, kernels, Bayesian, GP |
| **Reference** | 17 | Full API reference, algorithm comparison, configuration, errors |
| **Total** | **82** | **Complete coverage of 70+ algorithms** |

---

## Contributing to Documentation

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on contributing to miniml documentation.

When adding documentation:
1. **Choose the right category** — Tutorials, How-to, Explanation, or Reference
2. **Follow the writing guidelines** — Match the tone and style for that category
3. **Include examples** — All tutorials and how-to guides must have runnable code
4. **Cross-reference** — Link to related content in other categories
5. **Test your examples** — All code examples must be verified to work

---

## License

BSL 1.1 — Free for non-commercial, educational, and research use. Cloud/SaaS use requires a commercial license. Converts to AGPL-3.0 on 2028-04-08. See [LICENSE](../../LICENSE) for details.
