# Tutorial — ML Quick Start

Goal: take an event log, run a classifier, interpret results — in under 10
minutes.

## Prerequisites

- wasm4pm CLI installed (`npm i -g @seanchatmangpt/wasm4pm-cli`) **or** the source
  monorepo built (`pnpm build` from repo root).
- An XES log. If you don't have one, generate a synthetic sample:

  ```bash
  wpm init                          # scaffolds wasm4pm.toml
  curl -L -o sample.xes \
    https://www.tf-pm.org/resources/logs/road-traffic-fine.xes
  ```

## Step 1 — Inspect the log

```bash
wpm validate -i sample.xes
wpm run -i sample.xes --algorithm dfg
```

You should see basic statistics (cases, events, activities) and a DFG output.

## Step 2 — Run a classifier

```bash
wpm ml classify -i sample.xes
```

You'll see consola output similar to:

```
ML classify · naive_bayes
predictions   1 250
classes       2  (paid, unpaid)
top accuracy  0.78  (held-out 20 %)
```

JSON form for piping into other tools:

```bash
wpm ml classify -i sample.xes --format json | jq '.predictions[0:3]'
```

## Step 3 — Interpret the result

A `ClassificationResult` has three useful pieces:

```json
{
  "method": "naive_bayes",
  "predictions": [
    { "caseId": "c-12", "predicted": "paid", "confidence": 0.91 }
  ],
  "modelInfo": { "classes": ["paid", "unpaid"], "accuracy": 0.78 }
}
```

1. `method` — which algorithm was actually used (default selection).
2. `predictions[].confidence` — model probability for the chosen class.
3. `modelInfo.accuracy` — held-out validation score; **trust above 0.65**.

If accuracy is below 0.6, your features may not predict the outcome — run
`wpm predict features -i sample.xes` to see which signals carry information.

## Step 4 — Try clustering

```bash
wpm ml cluster -i sample.xes
```

Use the returned `assignments` to group traces by `cluster` and inspect each
cohort with `wasm4pm run`:

```bash
wpm ml cluster -i sample.xes --format json |
  jq -r '.assignments[] | select(.cluster==0) | .caseId' > cluster0.txt
```

## Step 5 — Visualise with PCA

```bash
wpm ml pca -i sample.xes --components 2 --format json > pca.json
```

Plot `transformedData` columns 0 and 1 in your favourite plotting tool — colour
by the cluster assignments from Step 4.

## Next steps

- [`ml-algorithms.md`](../ml-algorithms.md) — full algorithm reference.
- [`prediction.md`](../prediction.md) — predictive tasks.
- [`drift-detection.md`](../drift-detection.md) — keep your model honest.
- [`examples/ml-classify.ts`](../../examples/ml-classify.ts).
