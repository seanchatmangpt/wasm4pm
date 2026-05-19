# Hidden Markov Models

Work with sequences where the underlying states are hidden and only observations are visible.

## What You'll Learn

- Creating an HMM from parameters
- Computing observation likelihood with the forward algorithm
- Decoding the most likely state sequence with Viterbi
- Training an HMM from observation data using Baum-Welch

## Prerequisites

```typescript
import { init, HMM } from '@seanchatmangpt/wminml';
await init();
```

## Create an HMM

Define initial probabilities, transition matrix, and emission matrix.

```typescript
// 2 hidden states: {Fair, Loaded}
// 2 observation symbols: {Heads, Tails}
const initial = new Float64Array([0.5, 0.5]);
const transition = new Float64Array([
  0.8, 0.2,   // Fair -> mostly stay Fair
  0.3, 0.7,   // Loaded -> mostly stay Loaded
]);
const emission = new Float64Array([
  0.5, 0.5,   // Fair: equal heads/tails
  0.9, 0.1,   // Loaded: mostly heads
]);

const hmm = HMM.fromParams(initial, transition, emission, 2, 2);
```

## Forward Algorithm — Observation Likelihood

Compute `P(observations | model)`, returned as a log-likelihood.

```typescript
const observations = new Uint32Array([0, 0, 1, 0, 0, 0, 1, 0]);
const logLikelihood = hmm.forward(observations);
console.log(logLikelihood);  // log probability (negative number)
```

## Viterbi Algorithm — Decode State Sequence

Find the most likely sequence of hidden states.

```typescript
const observations = new Uint32Array([0, 0, 1, 0, 0, 0, 1, 0]);
const states = hmm.viterbi(observations);
// [0, 0, 1, 0, 0, 0, 1, 0] — state at each time step
console.log(states);
```

## Baum-Welch — Train from Observations

Learn HMM parameters from unlabeled observation sequences.

```typescript
const observations = new Uint32Array([0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
const trained = HMM.train(observations, 2, 2, 100, 1e-6, 42);

console.log(trained.nStates);         // 2
console.log(trained.nObservations);   // 2

// Use the trained model for inference
const ll = trained.forward(observations);
console.log(ll);  // improved log-likelihood after training
```

## Tips

- Observations must be non-negative integers representing symbol indices (0, 1, ..., nObsSymbols-1).
- The forward algorithm uses scaling to prevent numerical underflow for long sequences.
- Baum-Welch is sensitive to initialization. Try different seeds if results are poor.
- More iterations and longer observation sequences improve training quality.
