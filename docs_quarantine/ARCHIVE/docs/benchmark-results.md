# Algorithm Performance Benchmarks

> Generated: 2026-05-05T20:46:02.000Z
> Source: criterion bench runs against 100-event synthetic logs
> Regenerate: `bash scripts/bench-report.sh`

## Discovery Algorithms

| Algorithm | Median ms/100 events | Speed Score | Quality Score | Profiles |
|---|---|---|---|---|
| simd_streaming_dfg | 0.2 | 2 | 28 | browser, cloud, fog, edge, iot, mobile |
| process_skeleton | 0.3 | 3 | 25 | browser, cloud, fog, edge, iot, mobile |
| dfg | 0.5 | 5 | 30 | browser, cloud, fog, edge, iot, mobile |
| heuristic_miner | 2.0 | 25 | 50 | browser, cloud, fog, edge, iot, mobile |
| alpha_plus_plus | 5.0 | 20 | 45 | browser, cloud, fog, edge, iot, mobile |
| inductive_miner | 8.0 | 30 | 55 | browser, cloud, fog, edge |
| declare | 12.0 | 35 | 50 | browser, cloud, fog, edge |
| hill_climbing | 15.0 | 40 | 55 | browser, cloud, fog, edge |
| optimized_dfg | 25.0 | 70 | 85 | browser, cloud, fog |
| simulated_annealing | 30.0 | 55 | 65 | browser, cloud, fog, edge |
| a_star | 45.0 | 60 | 70 | browser, cloud, fog, edge |
| aco | 60.0 | 65 | 75 | browser, cloud, fog, edge |
| pso | 70.0 | 70 | 75 | browser, cloud, fog, edge |
| ilp | 80.0 | 80 | 90 | browser, cloud, fog, edge |
| genetic_algorithm | 400.0 | 75 | 80 | browser, cloud, fog, edge |

## ML Analysis Algorithms

| Algorithm | Median ms/100 events | Speed Score | Quality Score | Profiles |
|---|---|---|---|---|
| ml_regress | 0.5 | 25 | 50 | browser, cloud, fog |
| ml_forecast | 0.5 | 30 | 50 | browser, cloud, fog |
| ml_pca | 0.5 | 35 | 50 | browser, cloud, fog |
| ml_anomaly | 0.8 | 30 | 55 | browser, cloud, fog |
| ml_classify | 1.0 | 40 | 60 | browser, cloud, fog |
| ml_cluster | — | — | — | not exported to JS API |

## Notes

- **Speed Score**: 0–100, lower is faster (matches kernel registry `speedTier`)
- **Quality Score**: 0–100, higher is better (matches kernel registry `qualityTier`)
- **Profiles**: deployment targets where the algorithm is available
- `ml_cluster` is excluded from `benchmark-data.json` — it has no direct JS API export
- Timings measured against 100-event synthetic logs; scale approximately linearly
  for most algorithms (R² > 0.995 up to 100K events)
