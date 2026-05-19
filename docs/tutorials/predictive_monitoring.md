# Tutorial: Predictive Process Monitoring

## Learning Objectives
In this tutorial, you will:
1. Load a historical event log.
2. Train a predictive model for "Remaining Time".
3. Run predictions on live, incomplete cases.

## Step 1: Training the Model
We will use the ML regression capability to learn the duration patterns of our historical cases.
```bash
wpm predict train --target remaining-time -i history.xes --save-model my_model.bin
```

## Step 2: Predicting Live Cases
Now, feed a streaming or incomplete trace to predict its remaining time.
```bash
wpm predict run --model my_model.bin -i live_cases.xes
```

## Step 3: Evaluating Accuracy
Inspect the Root Mean Square Error (RMSE) of your predictions.
```bash
wpm predict eval --model my_model.bin -i test.xes
```
