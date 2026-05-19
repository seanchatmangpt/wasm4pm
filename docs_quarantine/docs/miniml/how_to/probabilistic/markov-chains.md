# Markov Chains

Model systems that transition between discrete states with known probabilities.

## What You'll Learn

- Creating a Markov chain from a transition matrix
- Computing steady-state distributions
- N-step transition probabilities
- Simulating chain trajectories

## Prerequisites

```typescript
import { init, MarkovChain } from '@seanchatmangpt/wminml';
await init();
```

## Create a Markov Chain

A transition matrix where each row sums to 1.0 and an initial distribution.

```typescript
// 2-state weather model:
//   State 0 = Sunny, State 1 = Rainy
//   P(stay sunny) = 0.9, P(sunny->rainy) = 0.1
//   P(rainy->sunny) = 0.3, P(stay rainy) = 0.7
const transitionMatrix = new Float64Array([0.9, 0.1, 0.3, 0.7]);
const initialDist = new Float64Array([0.5, 0.5]);

const chain = MarkovChain.fromMatrix(transitionMatrix, 2, initialDist);
```

## Steady-State Distribution

Compute the long-run probability of being in each state using power iteration.

```typescript
const steady = chain.steadyState(1000, 1e-10);
// Expected: [0.75, 0.25] — sunny 75% of the time
console.log(steady);
```

## N-Step Transition Probabilities

What is the probability of being in each state after N steps?

```typescript
// After 10 steps, starting from any state
const p10 = chain.nStepProbability(10);
// Each row is the state distribution after 10 steps from that starting state
console.log(p10);

// After 100 steps, all rows converge to the steady state
const p100 = chain.nStepProbability(100);
```

## Simulate a Trajectory

Generate a sequence of states by sampling from the chain.

```typescript
// Start in state 0 (Sunny), simulate 20 steps
const trajectory = chain.simulate(0, 20, 42);
// [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
console.log(trajectory);
```

## Tips

- Transition matrix must be row-major: `P[i][j] = matrix[i * nStates + j]`.
- Each row must sum to 1.0 (within tolerance 0.01).
- `steadyState` converges faster for chains without periodic behavior.
- Use `nStepProbability` with small steps to inspect transition dynamics, or large steps (100+) to verify convergence to steady state.
