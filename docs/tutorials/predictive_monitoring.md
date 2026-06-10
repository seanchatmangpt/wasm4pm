# Tutorial: Predictive Process Monitoring

## Learning Objectives
In this tutorial, you will:
1. Understand the six perspectivas of process prediction.
2. Estimate the remaining time for an in-flight case.
3. Predict the next most likely activity for a running trace.

## Step 1: Remaining Time Prediction
To predict when a running case will finish, use the `remaining-time` task. You must supply the current trace as a comma-separated `--prefix`.

```bash
# Predict remaining time for a case that has finished "Register" and "Approve"
wpm predict remaining-time -i data/small-example.xes --prefix "Register,Approve"
```

The output will provide an estimate in hours, backed by a Weibull survival model.

## Step 2: Next Activity Prediction
To see what the next step should be, use the `next-activity` task.

```bash
# Get the top-5 most likely next activities
wpm predict next-activity -i data/small-example.xes --prefix "Register" --top-k 5
```

This uses an n-gram language model (default order: 2) to compute probabilities for all possible continuations.

## Step 3: Drift Detection
Predictive monitoring also includes identifying if the process has changed over time.

```bash
# Detect concept drift in a log window of 20 traces
wpm predict drift -i data/small-example.xes --drift-window 20
```

## Examples

- `examples/prediction-next-activity.ts` — n-gram next-activity forecasting: `tsx examples/prediction-next-activity.ts log.xes`
- `examples/drift-detection.ts` — EWMA concept drift: `tsx examples/drift-detection.ts log.xes 100 0.3`
- `examples/03-prediction/01-next-activity.ts` — basic prediction walkthrough
