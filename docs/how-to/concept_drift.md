# How-To: Detect Concept Drift

## Goal
Identify moments in time where the underlying business process behavior fundamentally changed (Concept Drift).

## Steps

### 1. Set the Window Size
Drift detection compares a "reference" window of events against a "sliding" window. Determine an appropriate window size based on your event volume.

### 2. Run the Drift Detector
Execute the Bose concept drift algorithm:
```bash
wpm predict drift --window-size 500 -i continuous_log.xes
```

### 3. Analyze the Change Points
The output will list timestamp boundaries where the statistical distribution of the Directly-Follows Graph shifted beyond the threshold.

## Example

`examples/drift-detection.ts` demonstrates live EWMA drift detection with configurable window size and threshold:

```bash
tsx examples/drift-detection.ts data/small-example.xes 100 0.3
```
