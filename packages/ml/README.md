# @wasm4pm/ml

Micro-ML analysis for process mining. 6 algorithms for classification, clustering, forecasting, anomaly detection, regression, and dimensionality reduction.

## Algorithms

| Algorithm | Export Name | Input | Output | Key Metric |
|-----------|-------------|-------|--------|------------|
| Classify | `classifyTraces` | Features + labels | Class assignments | Accuracy, F1 |
| Cluster | `clusterTraces` | Features | Cluster assignments | Silhouette score |
| Forecast | `forecastSeries` | Time series | Predicted values | MAE, RMSE, MAPE |
| Anomaly | `detectEnhancedAnomalies` | Feature vectors | Anomaly scores | Precision, Recall |
| Regress | `regressRemainingTime` | Features + target | Coefficients | R², MAE |
| PCA | `reduceFeaturesPCA` | Feature matrix | Reduced dimensions | Variance explained |

## Known Behavior

- `@wasm4pm/ml` functions succeed with empty arrays. Do not assume rejection — always handle the empty result case.
- `regressRemainingTime` uses only the first feature column as independent variable (univariate regression).
- PCA fails on `running-example.xes` (insufficient features).
- Decision tree classifier always reports `confidence: 1` (hardcoded).
- REINFORCE agent is inherently non-deterministic (Gumbel-max sampling).

## Usage

```typescript
import { classifyTraces, forecastSeries, detectEnhancedAnomalies } from '@wasm4pm/ml';

const result = classifyTraces(features, labels);
// result: { classes: string[], accuracy: number, confusionMatrix: number[][] }
```

## CLI

```bash
pictl ml classify -i events.json
pictl ml forecast -i events.json --horizon 10
pictl ml anomaly -i events.json --threshold 0.8
```
