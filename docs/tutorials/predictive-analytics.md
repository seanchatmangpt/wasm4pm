# Predictive Analytics with pmctl

**Time**: 40 minutes
**Prerequisites**: pmctl installed, an XES event log file (use any `.xes` file in the project or generate one with `pmctl init --sample`)

## Introduction

Process discovery tells you what happened. Predictive analytics tells you what will happen. In this tutorial you'll learn how to use pmctl's predictive commands to answer three fundamental process mining questions:

- **What happens next?** -- next-activity prediction
- **How long will it take?** -- remaining-time estimation
- **Is the process changing?** -- concept drift detection

All three capabilities are built into pmctl's `predict` and `drift-watch` commands. Results auto-save to `.wasm4pm/results/` so you can review them later with `pmctl results`.

---

## Exercise 1: Predict Next Activities (15 min)

**Goal**: Use n-gram prediction to forecast the next activity in a running case.

### Step 1: Basic next-activity prediction

Run the prediction against your event log. This builds an n-gram model from all completed traces and outputs the most likely next activity given an empty prefix (i.e., the most common first activity in the log).

```bash
pmctl predict next-activity -i your-log.xes
```

The output shows a ranked list of predicted activities with their probabilities. The probability reflects how frequently each activity follows the given prefix across all traces in the log.

### Step 2: Provide a prefix context

A prefix is the sequence of activities that have already occurred in a running case. Supplying a prefix gives the model context and produces more specific predictions.

```bash
pmctl predict next-activity -i your-log.xes --prefix "activity1,activity2"
```

Replace `activity1,activity2` with actual activity names from your log. Use activity names exactly as they appear in the XES file. The prediction now answers: given that `activity1` then `activity2` have occurred, what comes next?

### Step 3: Tune prediction accuracy

Two parameters control prediction behavior:

- `--ngram-order` -- the length of the history window (default: 2). An order of 2 means the model looks at the last 2 activities to predict the next one. Higher orders capture longer-range dependencies but require more data.
- `--top-k` -- how many predictions to return (default: 3). Shows only the k most likely activities.

```bash
pmctl predict next-activity -i your-log.xes --ngram-order 3 --top-k 5
```

When you increase `ngram-order`, the model considers a longer prefix. This can improve accuracy for processes with complex sequential patterns, but it also means some prefixes may never have been seen in the training data, resulting in lower confidence.

### Step 4: Inspect the saved result

Every `predict` run auto-saves its output. View the most recent result:

```bash
pmctl results --last
```

This prints the full JSON result including the model parameters, predictions, and metadata (timestamp, input hash, task).

### Understanding the output

The key fields in a next-activity prediction result are:

| Field | Meaning |
|---|---|
| `predictions` | Array of `{activity, probability}` pairs, sorted by probability descending |
| `model.ngram_order` | The n-gram order used (default 2) |
| `model.vocabulary_size` | Number of distinct activities in the training data |
| `model.coverage` | Fraction of prefixes in the log that had at least one matching n-gram |

A high coverage value (close to 1.0) means the model has seen most prefix patterns. Low coverage suggests you need more training data or a lower n-gram order.

---

## Exercise 2: Estimate Case Duration (10 min)

**Goal**: Predict how long a running case will take to complete.

### Step 1: Run remaining-time prediction

Provide a prefix of activities that have already occurred. The model looks at historical cases with similar prefixes and estimates the remaining time.

```bash
pmctl predict remaining-time -i your-log.xes --prefix "start,process,review"
```

### Step 2: Interpret the output

The result contains:

| Field | Meaning |
|---|---|
| `remaining_ms` | Predicted remaining time in milliseconds |
| `remaining_human` | Human-readable duration (e.g., "2h 15m") |
| `confidence` | Confidence score between 0 and 1 |
| `bucket_count` | Number of historical cases matching this prefix pattern |
| `interpretation` | Plain-text explanation of the prediction |

The confidence score depends on how many historical cases share a similar prefix. If only a few cases match, the estimate is less reliable. The `bucket_count` field tells you how much data the prediction is based on.

---

## Exercise 3: Detect Concept Drift (15 min)

**Goal**: Monitor a process log for changes in behavior over time.

Concept drift occurs when the underlying process changes -- new activities appear, activity frequencies shift, or the order of activities changes. Detecting drift early helps you identify when models need retraining or processes need investigation.

### Step 1: One-shot drift detection

Run a single drift analysis across the entire log. This divides the log into windows and compares activity distributions between consecutive windows.

```bash
pmctl predict drift -i your-log.xes --drift-window 50
```

The `--drift-window` parameter controls the window size (number of events per window). Smaller windows are more sensitive to short-term fluctuations; larger windows smooth over noise but may miss gradual drift.

The output reports:
- **Drift score** per window pair (Jaccard distance between activity sets)
- **EWMA smoothed score** (exponentially weighted moving average)
- **Alerts** for windows where the score exceeds the default threshold

### Step 2: Start real-time monitoring

For continuous monitoring, use `drift-watch`. This command reads the log and runs drift detection at a configurable interval, printing results as they arrive.

```bash
pmctl drift-watch -i your-log.xes --interval 5000
```

The `--interval` parameter sets the polling interval in milliseconds (default: 5000). The command runs until you press Ctrl+C.

### Step 3: Adjust sensitivity

Two parameters control drift detection sensitivity:

- `--alpha` -- the EWMA smoothing factor (default: 0.3). Higher values (closer to 1.0) make the detector react faster to changes but also to noise. Lower values (closer to 0.0) smooth out fluctuations but react slower to genuine drift.
- `--threshold` -- the alert threshold (default: 0.2). A window pair with a drift score above this value triggers an ALERT.

```bash
pmctl drift-watch -i your-log.xes --alpha 0.5 --threshold 0.2
```

### Step 4: Watch for alerts

When drift is detected, the output includes lines prefixed with `ALERT`. For example:

```
[12:34:56] Window 45-50: drift_score=0.34 ALERT: significant behavior change detected
[12:34:56]   New activities: "escalate_to_manager"
[12:34:56]   Disappeared activities: "auto_approve"
```

The alert tells you which window shows drift, what the score is, and which activities are new or disappeared. Use this information to decide whether the process has genuinely changed or whether the alert is noise that can be tuned away.

---

## What You Learned

- **Next-activity prediction** uses n-gram models (a form of Markov chain). The n-gram order controls how much history the model considers. Higher orders capture more context but need more data.
- **Remaining-time estimation** uses bucket-based estimation. Historical cases with similar activity prefixes are grouped, and the median remaining time from those cases is reported as the prediction.
- **Drift detection** uses Jaccard-distance comparison between sliding windows, smoothed with an EWMA filter. The `--alpha` and `--threshold` parameters let you trade off sensitivity versus noise tolerance.
- All results auto-save to `.wasm4pm/results/` and can be browsed with `pmctl results --last`.

---

## Next Steps

- **How-To**: [Predictive Mining Workflow](../how-to/predictive-mining.md) -- end-to-end workflow for integrating predictions into your analysis
- **Explanation**: [Predictive Process Mining](../explanations/predictive-process-mining.md) -- how n-gram models, EWMA smoothing, and bucket estimation work under the hood
- **Reference**: [Prediction CLI](../reference/prediction-cli.md) -- complete option reference for `predict` and `drift-watch` commands
