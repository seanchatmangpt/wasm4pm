# ML Algorithm Selection Guide (Based on Benchmarks)

**Quick reference for choosing algorithms based on performance constraints and use cases.**

---

## By Constraint: Latency Requirement

### Sub-10ms Latency (Real-time streaming)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **Naive Bayes** | 0.34ms ⭐ | Fastest classifier |
| **Anomaly Detection** | 0.39ms ⭐ | Per-event overhead <0.5ms |
| **Linear Regression** | 0.25ms ⭐ | Closed-form solution |
| **Throughput Forecast** | 0.055ms ⭐⭐ | Ultra-fast series analysis |
| Logistic | 12.4ms | Borderline — might exceed 10ms variance |

**Profile:**
```
Best: anomaly(0.39ms) + linear_regress(0.25ms) + throughput_forecast(0.055ms)
Total: ~0.7ms per event
State: 200 point anomaly buffer → ~1KB memory
```

### 10-100ms Latency (Interactive prediction)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **k-NN (k=3-5)** | 18-20ms | Good balance |
| **Decision Tree (d=5)** | 6.4ms ⭐ | Fastest, high quality |
| **k-Means (k=5)** | 3.5ms ⭐ | Clustering |
| **Exponential Regress** | 0.32ms | Complex patterns |
| Polynomial d=2 | 0.27ms | Non-linear trends |

**Recommended Stack:**
- Classification: Decision Tree d=5 (6.4ms, 90%+ quality)
- Clustering: k-Means k=5 (3.5ms)
- Regression: Exponential (0.32ms, models growth)

### 1-10 Second Latency (Batch processing)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **DBSCAN (eps=0.5)** | 21.9ms | Arbitrary shapes |
| **Polynomial d=3** | 1.0ms | Flexible |
| **PCA (10f→3c)** | 1.3ms | Dimensionality reduction |
| All algorithms | OK | Use highest quality option |

**Recommended Stack:**
- Use best-quality variants regardless of speed
- Polynomial d=3 > Linear
- DBSCAN > k-Means for better cluster quality
- PCA as preprocessing for feature engineering

### 10s+ Latency (Offline analysis)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **PCA (20f→3c)** | 3.3ms | More features OK |
| **All algorithms** | ✅ | No speed constraints |

**Recommended:** Use algorithms tuned for quality:
- PCA for feature reduction
- Decision Tree + DBSCAN for interpretability
- Polynomial regression for complex relationships

---

## By Constraint: Data Size

### Small (n ≤ 100)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **k-NN** | 0.68ms | No training overhead |
| **Naive Bayes** | 0.30ms ⭐ | Fast training |
| **PCA** | 0.18ms | Low overhead |
| **Anomaly** | <0.1ms | Single-pass |

**Use:** k-NN or Naive Bayes (both fast, minimal setup)

### Medium (100 < n ≤ 10K)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **k-NN (k=5)** | 20ms | Still fast |
| **Logistic** | 32ms | Good quality |
| **Decision Tree** | 65ms | High quality |
| **k-Means** | 35ms | Scalable |
| **Anomaly** | 8ms | Sub-10ms |

**Use:** Decision Tree (best quality), or k-NN/Logistic for speed

### Large (10K < n ≤ 100K)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **Linear Regress** | 180ms | Scales well |
| **Logistic** | 280ms | Still linear |
| **Naive Bayes** | 170ms | Robust |
| **k-Means** | 400ms | Converges fast |
| ❌ **DBSCAN** | 1.5s+ | Avoid (O(n²)) |
| ❌ **PCA (20f)** | >10s | Expensive |

**Avoid:** DBSCAN (quadratic), PCA with 20+ features

**Use:** k-Means, Linear regression, Naive Bayes

### XLarge (n > 100K)

| Algorithm | Time | Notes |
|-----------|------|-------|
| **Anomaly** | Constant time | Streaming-friendly |
| **Throughput Forecast** | Constant time | Streaming-friendly |
| **Naive Bayes** | Linear | Scales well |
| **Linear Regress** | Linear | Closed-form |
| **k-Means** | Linear (iterations) | Good for size reduction |

**Must Use Streaming:** Anomaly, Forecasting

**Avoid:** All others for full-dataset analysis (too slow)

---

## By Constraint: Quality Requirement

### Low Quality OK (70-80%)

| Algorithm | Quality | Time |
|-----------|---------|------|
| **Naive Bayes** | 75-80% | 0.34ms |
| **Logistic** | 70-75% | 12.4ms |
| **Linear Regress** | 0.4-0.6 R² | 0.25ms |

**Use:** Baseline algorithms (lowest overhead)

### Medium Quality (80-90%)

| Algorithm | Quality | Time |
|-----------|---------|------|
| **k-NN (k=5)** | 80-85% | 18ms |
| **Exponential Regress** | 0.6-0.8 R² | 0.32ms |
| **k-Means** | 60-70% cluster quality | 3.5ms |
| **Throughput Forecast** | Variance: 5-15% | 0.055ms |

**Use:** Balanced algorithms (accuracy + speed)

### High Quality (90%+ / R²>0.85)

| Algorithm | Quality | Time |
|-----------|---------|------|
| **Decision Tree** | 90-95% | 6.4ms |
| **Polynomial d=3** | 0.7-0.8 R² | 1.0ms |
| **DBSCAN** | Arbitrary shapes | 21.9ms |
| **Anomaly (custom)** | 85-92% detection | 0.39ms |

**Use:** When accuracy is critical

---

## By Use Case

### ✓ Real-Time Process Monitoring (Streaming)

**Constraints:** <1ms per event, minimal state

**Stack:**
1. **Anomaly Detection** (0.39ms) — Detect spikes
2. **Throughput Forecast** (0.055ms) — Monitor event rate
3. **Naive Bayes** (0.34ms) — Lightweight classification

**Example:** RevOps monitoring
```
Per event: extract features (0.1ms)
  → anomaly detection (0.4ms)
  → naive bayes predict (0.3ms)
  → forecast update (0.06ms)
Total: ~0.8ms/event
State: 200 point anomaly buffer + model weights (~10KB)
```

### ✓ Batch Conformance Analysis (1-10 sec allowed)

**Constraints:** Single run, focus on quality

**Stack:**
1. **Decision Tree** (6.4ms) — Classify outcome
2. **DBSCAN** (21.9ms) — Group conforming vs deviant
3. **Polynomial d=3** (1.0ms) — Trend in remaining time

**Example:** End-of-period analytics
```
Load 10K events (0.1s)
  → classify (6.4ms)
  → cluster by conformance (21.9ms)
  → regress trends (1.0ms)
Total: ~1s processing
Output: outcome prediction, conforming groups, time trends
```

### ✓ Feature Engineering (Pre-processing)

**Constraints:** Once per run, many features

**Stack:**
1. **PCA (10f→3c)** (1.3ms) — Decorrelate
2. **Normalize** (0.1ms) — Min-max scale
3. Use reduced features for downstream

**Example:** Before clustering
```
100 process events × 20 features = 2000 data points
  → PCA 20f→5c (expensive but once)
  → k-means k=5 on reduced (faster now)
Total: PCA 3-5ms + k-means 1-2ms = 5-7ms
Speedup: 3x faster clustering after this investment
```

### ✓ Online Prediction (Sub-100ms per request)

**Constraints:** <100ms, good accuracy (80%+)

**Stack (Option A - Speed):**
1. **k-NN k=3** (18ms) — Fast prediction
2. **Logistic** (12.4ms) — Probability calibration

**Stack (Option B - Quality):**
1. **Decision Tree d=5** (6.4ms) — Interpretable rules
2. **Exponential Regress** (0.32ms) — Time trends

**Example:** Predict remaining time
```
Request: case features
  → extract from log (0.1ms)
  → exponential regress (0.3ms)
  → decision tree classify (6.4ms)
  → format response (0.2ms)
Total: ~7ms latency
```

### ✓ Discovery Analysis (Full-depth investigation)

**Constraints:** No time limit, maximum quality

**Stack:**
1. **PCA 20f→3c** (3.3ms) — Feature importance
2. **DBSCAN eps=0.5** (21.9ms) — Arbitrary clusters
3. **Polynomial d=3** (1.0ms) — Non-linear trends
4. **k-NN k=10** (350ms) — Fine-grained nearest neighbors

**Example:** Deep-dive variant analysis
```
1. Load log + extract features (0.5s)
2. PCA for feature importance (3.3ms)
3. DBSCAN to find variant clusters (21.9ms)
4. Polynomial regression on each cluster (1-5ms each)
5. Detail k-NN neighbors within clusters (100-350ms)
Total: 0.6-1.0s for comprehensive analysis
```

---

## Comparison Matrix (n=1K benchmark)

| | Speed | Quality | Interpretability | Use Case |
|---|---|---|---|---|
| **Naive Bayes** | ⭐⭐⭐ 0.34ms | ⭐⭐ 75% | ⭐⭐ | Baseline, streaming |
| **k-NN k=3** | ⭐⭐ 18ms | ⭐⭐⭐ 82% | ⭐⭐⭐ | Real-time, online |
| **Logistic** | ⭐⭐ 12.4ms | ⭐⭐ 70% | ⭐⭐⭐ | Probabilities |
| **Decision Tree** | ⭐⭐⭐ 6.4ms | ⭐⭐⭐⭐ 93% | ⭐⭐⭐⭐ | Best overall |
| **k-Means** | ⭐⭐⭐ 3.5ms | ⭐⭐ 65% | ⭐⭐ | Fast grouping |
| **DBSCAN** | ⭐ 21.9ms | ⭐⭐⭐ 85% | ⭐⭐ | Complex shapes |
| **Linear Regress** | ⭐⭐⭐ 0.25ms | ⭐ 0.4-0.6 R² | ⭐⭐⭐⭐ | Baseline trends |
| **Exponential** | ⭐⭐⭐ 0.32ms | ⭐⭐⭐ 0.6-0.8 R² | ⭐⭐ | Growth/decay |
| **Anomaly** | ⭐⭐⭐ 0.39ms | ⭐⭐⭐ 87% | ⭐⭐ | Real-time spikes |
| **PCA** | ⭐⭐ 1.3ms | ⭐⭐⭐ 70% var | ⭐⭐ | Feature engineering |

⭐ = Excellent, ⭐⭐ = Good, ⭐⭐⭐ = Very Good, ⭐⭐⭐⭐ = Excellent

---

## Decision Tree (Algorithm Selection)

```
START
│
├─ Latency < 10ms?
│  ├─ YES → Use Naive Bayes (0.34ms) or Linear (0.25ms)
│  └─ NO → Continue
│
├─ Need to classify (vs regress/cluster)?
│  ├─ YES
│  │  ├─ Quality > 90% needed?
│  │  │  ├─ YES → Decision Tree d=5 (6.4ms, 93%)
│  │  │  └─ NO → k-NN k=5 (18ms, 82%) or Naive Bayes (0.34ms, 75%)
│  │  └─ Interpreability critical?
│  │     ├─ YES → Decision Tree (rules are readable)
│  │     └─ NO → Logistic (70%, calibrated probabilities)
│  │
│  ├─ Need clustering?
│  │  ├─ Well-separated clusters? → k-Means k=5 (3.5ms)
│  │  └─ Arbitrary shapes? → DBSCAN (21.9ms, high quality)
│  │
│  └─ Need regression (predict continuous value)?
│     ├─ Simple trend? → Linear (0.25ms, baseline)
│     ├─ Growth/decay? → Exponential (0.32ms, 0.6-0.8 R²)
│     └─ Complex non-linear? → Polynomial d=2-3 (0.27-1ms, 0.5-0.8 R²)
│
├─ Data size?
│  ├─ n > 100K → Avoid DBSCAN, PCA; use Linear/Naive Bayes/k-Means
│  └─ n < 1K → All algorithms OK; choose by quality
│
└─ Use case?
   ├─ Real-time streaming → Anomaly + Forecast + Naive Bayes
   ├─ Batch analysis → Decision Tree + DBSCAN + Polynomial
   ├─ Feature engineering → PCA then k-Means
   └─ Online prediction → Decision Tree or k-NN
```

---

## Quick Reference Table

**For Ctrl+F searches** — find your constraint, see recommended algorithm:

```
LATENCY BUDGET          ALGORITHM           TIME    QUALITY
─────────────────────────────────────────────────────────
<1ms                    Linear              0.25ms  Baseline
<1ms                    Anomaly             0.39ms  87%
<1ms                    Throughput Forecast 0.055ms  Good
1-10ms                  Decision Tree       6.4ms   93%
1-10ms                  k-Means             3.5ms   65%
10-50ms                 k-NN                18ms    82%
50-100ms                Logistic            12ms    70%
100ms+                  DBSCAN              21ms    85%
100ms+                  PCA + cluster       4ms     70%

DATA SIZE               ALGORITHM           TIME    NOTES
─────────────────────────────────────────────────────────
n < 100                 k-NN                <1ms    No training
100 < n < 1K            Decision Tree       6.4ms   Best overall
1K < n < 10K            Linear              20ms    Scales well
10K < n < 100K          k-Means             400ms   Linear growth
n > 100K                Streaming only      <1ms/ev Must use anomaly/forecast

QUALITY TARGET          ALGORITHM           TIME    R² or Acc
─────────────────────────────────────────────────────────
70-75% (baseline)       Naive Bayes         0.34ms  75-80%
80-85% (good)           k-NN k=5            18ms    80-85%
90%+ (excellent)        Decision Tree       6.4ms   90-95%
R² > 0.8 (strong)       Exponential         0.32ms  0.6-0.8
R² > 0.9 (excellent)    Polynomial d=3      1.0ms   0.7-0.8

USE CASE                STACK               TOTAL TIME
─────────────────────────────────────────────────────────
Real-time monitoring    Anomaly + Forecast  0.5ms
Online prediction       Decision Tree       6.4ms
Batch analysis          DTree + DBSCAN      28ms
Deep analysis           PCA + DBSCAN + poly 30ms
```

---

**Last Updated:** May 5, 2026  
**Data Source:** `/Users/sac/wasm4pm/packages/ml/src/__tests__/ml_benchmarks.bench.ts`  
**Detailed Report:** `/Users/sac/wasm4pm/docs/ml-benchmarks.md`
