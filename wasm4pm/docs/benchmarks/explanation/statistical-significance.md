# Are Benchmark Differences Meaningful?

How to distinguish real performance differences from measurement noise when comparing 21 algorithms on the same hardware.

---

## The Core Problem

DFG completes in 3.0ms. Process Skeleton completes in 2.7ms. Is Process Skeleton actually faster, or is this just measurement noise?

This question is harder than it seems. We are comparing two numbers that each come from a distribution of possible values. On one run, DFG might take 2.8ms and Process Skeleton might take 3.1ms. The ordering flips. Which result do we trust?

The answer depends on understanding **variance**, **effect size**, and **practical significance**. This document explains how we think about these concepts and how you should interpret the benchmark numbers we publish.

---

## Confidence Intervals and Why We Report Median

When we say "DFG: 3.0ms," we mean the median of 7 runs. But the median is a point estimate -- it does not convey the spread of the underlying distribution.

Consider two hypothetical measurement sets:

**Algorithm A**: 2.8, 2.9, 3.0, 3.0, 3.1, 3.2, 3.3ms (median: 3.0ms, tight spread)
**Algorithm B**: 2.5, 2.7, 3.0, 3.0, 3.3, 3.8, 5.2ms (median: 3.0ms, wide spread)

Both report 3.0ms, but Algorithm A is consistently 3.0ms while Algorithm B occasionally spikes to 5.2ms. If you care about predictability (e.g., you need to guarantee sub-5ms response time), Algorithm A is the better choice despite identical medians.

We currently report medians without confidence intervals. This is a deliberate simplification for readability, but it means you should treat small differences (less than 10%) with skepticism. We plan to add interquartile ranges to future benchmark reports.

### Why Not Mean and Standard Deviation?

Benchmark timing distributions are typically right-skewed. The standard deviation assumes a symmetric, roughly normal distribution. On right-skewed data, the standard deviation overestimates the spread on the low side and underestimates it on the high side.

The median is robust to skewness. It always represents the center of the distribution, regardless of shape. This is why we chose it as our primary summary statistic.

---

## Effect Size vs Statistical Significance

These are two different questions:

1. **Statistical significance**: Is the observed difference likely to be real, or could it be due to chance?
2. **Effect size**: How large is the difference, in practical terms?

A difference can be statistically significant but practically meaningless. With 7 runs each, we can detect differences of a few percent for ultra-fast algorithms. But a 2% difference between 3.0ms and 3.06ms is not practically meaningful -- it falls within normal system jitter.

### Cohen's d for Benchmark Differences

Cohen's d is a standardized effect size measure:

```
d = (mean_A - mean_B) / pooled_standard_deviation
```

Rough guidelines:

- d < 0.2: Negligible effect (ignore the difference)
- d = 0.2-0.5: Small effect (visible but not actionable)
- d = 0.5-0.8: Medium effect (worth considering in optimization)
- d > 0.8: Large effect (clear, meaningful difference)

For our ultra-fast algorithms (DFG, Process Skeleton), the pooled standard deviation is typically 0.1-0.3ms. A 0.3ms difference (3.0ms vs 2.7ms) gives d ≈ 1.0-3.0, which is a large effect. The 10% difference between DFG and Process Skeleton is statistically and practically real.

For our medium-speed algorithms (Hill Climbing ~135ms, A* ~77ms), the standard deviation is typically 2-5ms. A 5ms difference between A* and ILP (77ms vs 87ms) gives d ≈ 1.0-2.5, also a large effect.

---

## The Multiple Comparison Problem

We benchmark 21 algorithms. If we compare every pair, that is 21 \* 20 / 2 = 210 pairwise comparisons. Even if all algorithms were truly identical in performance, random variation would produce some "significant" differences by chance.

This is the **multiple comparison problem**. With enough comparisons, you will find spurious differences.

### Bonferroni Correction

The simplest correction is the Bonferroni method: divide your significance threshold by the number of comparisons. If you normally accept p < 0.05 as significant, with 210 comparisons you should require p < 0.05 / 210 = 0.00024.

We do not perform formal hypothesis testing on our benchmarks. Instead, we use a simpler heuristic: **flag differences greater than 10%**. This is conservative enough to avoid false positives while still catching meaningful performance gaps.

### Tiered Reporting

Rather than ranking all 21 algorithms in a single list (which implies false precision), we group them into performance tiers:

| Tier       | Range    | Algorithms                                       |
| ---------- | -------- | ------------------------------------------------ |
| Ultra-fast | < 5ms    | DFG (~3.0ms), Process Skeleton (~2.7ms)          |
| Fast       | 5-30ms   | Heuristic Miner (~14ms), Inductive Miner (~25ms) |
| Medium     | 30-150ms | A\* (~77ms), ILP (~87ms), Hill Climbing (~135ms) |
| Slow       | > 150ms  | (none at default parameters on BPI 2020)         |

Within a tier, differences are usually not actionable. Between tiers, the choice is driven by your quality requirements, not speed.

---

## Practical Significance: When Does 10% Matter?

The answer depends on your use case:

### Interactive CLI Use (pictl run)

When a human runs `pictl run log.xes` from the command line, they are waiting for the result. A 10% difference between 3.0ms and 3.3ms is imperceptible. Even a 10x difference (3ms vs 30ms) is imperceptible -- both complete in the blink of an eye.

In this context, **speed differences within the same tier do not matter**. Choose based on output quality (petri net vs DFG vs process tree), not speed.

### Batch Processing (1000 logs overnight)

If you are processing 1,000 logs in a batch job, a 10% difference starts to add up:

- Algorithm A: 3.0ms \* 1,000 = 3.0 seconds total
- Algorithm B: 3.3ms \* 1,000 = 3.3 seconds total

The 0.3-second difference is still not significant. But if the difference is 10x:

- Algorithm A: 3.0ms \* 1,000 = 3.0 seconds
- Algorithm B: 30ms \* 1,000 = 30 seconds

Now the difference matters. Over a year of daily batch jobs, it compounds.

### Streaming (continuous processing)

In streaming mode, algorithms run continuously on event streams. A 10% per-event difference compounds over millions of events:

- Algorithm A: 3.0ms/event \* 1M events = 50 minutes total processing time
- Algorithm B: 3.3ms/event \* 1M events = 55 minutes total processing time

The 5-minute difference may or may not matter depending on your latency requirements. If you need sub-second latency per event, both are fine. If you are processing at the limit of real-time (event arrival rate approaches processing rate), 10% is the difference between keeping up and falling behind.

### Embedded / IoT Devices

On memory-constrained or CPU-constrained devices (IoT sensors, edge gateways), every millisecond counts. A 10% reduction in per-event processing time extends battery life and reduces thermal throttling. In this context, DFG (3.0ms) vs Process Skeleton (2.7ms) is worth considering.

---

## Recommended Approach

When comparing benchmark results, follow this process:

1. **Run 7 times, take the median.** This is what we report. If you are reproducing our results, do the same.

2. **Compare medians within the same tier.** If two algorithms are both "fast" (5-30ms), the speed difference is probably not the deciding factor. Look at output quality instead.

3. **Flag differences greater than 10%.** If Algorithm A is more than 10% faster than Algorithm B and produces equivalent quality output, prefer A for performance-sensitive use cases.

4. **Verify with your own data.** BPI 2020 is our reference dataset, but your data may have different characteristics (trace length, variant count, noise level) that change the relative performance of algorithms. Always benchmark on your own data before making optimization decisions.

5. **Consider the full picture.** Speed is one dimension. Memory usage, output quality, conformance checking accuracy, and explainability are equally important. The fastest algorithm is not always the best choice.

---

## Example Analysis: DFG vs Process Skeleton

Let us walk through a real example:

| Algorithm        | Median | Min   | Max   | Range |
| ---------------- | ------ | ----- | ----- | ----- |
| DFG              | 3.0ms  | 2.8ms | 3.5ms | 0.7ms |
| Process Skeleton | 2.7ms  | 2.5ms | 3.1ms | 0.6ms |

**Difference**: 0.3ms (10% faster for Process Skeleton)

**Interpretation**:

- The difference is larger than the within-algorithm range (0.6-0.7ms), suggesting it is real and not just noise.
- Both algorithms are in the "ultra-fast" tier. For interactive CLI use, the difference is imperceptible.
- DFG produces a direct-follows graph. Process Skeleton produces a simplified DFG with skeleton edges. These are different outputs -- the choice should be based on which output format you need, not on the 0.3ms speed difference.
- For streaming on an IoT device processing millions of events, the 10% advantage could matter. But for typical pictl usage, it does not.

**Conclusion**: Process Skeleton is measurably faster, but the speed difference is not a meaningful differentiator. Choose based on output format requirements.

---

## When Numbers Lie

Be wary of these common misinterpretations:

### "Algorithm X is 2x faster than Algorithm Y"

If Algorithm X takes 3ms and Algorithm Y takes 6ms, X is indeed 2x faster. But both complete in under 10ms. The absolute difference (3ms) is irrelevant for human-interactive use. The ratio (2x) sounds impressive but is practically meaningless.

### "Algorithm X scaled linearly"

Linear scaling on a log-log plot looks like a straight line. But many non-linear functions look approximately linear over a narrow range (e.g., 1K to 10K traces). Always check the scaling exponent, not just the visual appearance of the plot.

### "These results prove Algorithm X is better"

Benchmarks measure performance on one dataset (BPI 2020). They do not prove general superiority. An algorithm that is slow on BPI 2020 might be fast on a different dataset with different characteristics. Our benchmarks provide evidence, not proof.
