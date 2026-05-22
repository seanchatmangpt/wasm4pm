# How-To: Use ML Clustering

## Goal
Group similar process executions (traces) together to identify distinct variants or abnormal behaviors using native ML clustering.

## Steps

### 1. Feature Extraction
Convert the event log traces into feature vectors (e.g., activity counts, transition frequencies).
```bash
wpm ml extract-features -i log.xes -o features.csv
```

### 2. Run DBSCAN Clustering
Use the density-based clustering algorithm to find natural groupings without specifying `k`.
```bash
wpm ml cluster --algorithm dbscan -i features.csv
```

### 3. Interpret Results
The CLI will output the number of clusters found and assign each `case_id` to a cluster. Noise cases are marked as `-1`.
