# Kaplan-Meier Survival Curves

Estimate survival probabilities over time from time-to-event data.

## What You'll Learn

- Computing Kaplan-Meier survival curves
- Reading confidence intervals for survival estimates
- Finding median survival time

## Prerequisites

```typescript
import { init, kaplanMeier } from '@seanchatmangpt/wminml';
await init();
```

## Basic Usage

`kaplanMeier` returns a flat array: `[medianSurvival, nEventTimes, t1, s1, lo1, hi1, n1, t2, s2, lo2, hi2, n2, ...]`

```typescript
// times: months until event or censoring
// events: 1.0 = event occurred, 0.0 = censored (lost to follow-up)
const times = new Float64Array([5, 8, 12, 15, 20, 24, 30, 36]);
const events = new Float64Array([1, 1, 0, 1, 1, 0, 1, 0]);

const result = kaplanMeier(times, events);

const medianSurvival = result[0];
const nEventTimes = result[1];

console.log(`Median survival: ${medianSurvival} months`);

// Read the survival curve
for (let i = 0; i < nEventTimes; i++) {
  const offset = 2 + i * 5;
  const t = result[offset];       // time
  const s = result[offset + 1];   // survival probability
  const lo = result[offset + 2];  // 95% CI lower
  const hi = result[offset + 3];  // 95% CI upper
  const n = result[offset + 4];   // number at risk

  console.log(`t=${t}: S(t)=${s.toFixed(3)} [${lo.toFixed(3)}, ${hi.toFixed(3)}] n=${n}`);
}
```

## Interpreting the Output

| Value | Description |
|-------|-------------|
| `result[0]` | Median survival time (time when survival drops to 0.5, or NaN if never) |
| `result[1]` | Number of unique event times |
| `result[2+i*5]` | Event time |
| `result[3+i*5]` | Survival probability at that time |
| `result[4+i*5]` | Lower 95% confidence bound |
| `result[5+i*5]` | Upper 95% confidence bound |
| `result[6+i*5]` | Number of subjects at risk |

## Practical Example

```typescript
// Clinical trial: 10 patients, some censored
const times = new Float64Array([3, 5, 7, 8, 10, 12, 15, 18, 22, 30]);
const events = new Float64Array([1, 1, 1, 0, 1, 1, 0, 1, 0, 1]);

const result = kaplanMeier(times, events);

if (Number.isNaN(medianSurvival)) {
  console.log('Median survival not reached (more than 50% still alive)');
} else {
  console.log(`Median survival: ${medianSurvival} months`);
}
```

## Tips

- `times` and `events` must have the same length.
- Events are coded as 1.0 (event) or 0.0 (censored).
- Censoring means the subject was lost to follow-up before the event occurred.
- Confidence intervals use the log-log transform (Greenwood's formula).
- If no events occur, the result contains no time points.
- Data is automatically sorted by time internally.
