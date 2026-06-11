# Algorithm Review: monte_carlo_simulation

## Algorithm ID & Domain
- **Algorithm ID**: `monte_carlo_simulation`
- **Domain**: Process Mining / Simulation (Monte Carlo Discrete Event Process Performance Simulation)

## Correctness Audit
- **Early Exit / Bounds**:
  - completed cases: `log.traces.len().min(_config.num_cases)` (line 155), preventing out-of-bounds in traces loop.
  - If a trace has empty activities, it is skipped: `if trace.is_empty() { continue; }` (lines 193-195).
- **Percentile Calculation**:
  - `percentile_sorted` uses linear interpolation to calculate percentiles (lines 133-145). It guards against empty slices (returns `0.0`) and single-element slices (returns the element), preventing crashes and division-by-zero.
- **Division-by-Zero Protection**:
  - In `run_monte_carlo_simulation`, percentiles are calculated over sorted sojourn times. Averages like `avg_sojourn_time_ms` and `avg_trace_length` check if `n > 0` (lines 297-306).
  - Standard deviation `sojourn_time_std_ms` checks `n > 1` (lines 308-317) before dividing by `n - 1`, protecting against division-by-zero when there is only one case.
  - Resource utilization divides by `capacity as f64 * total_time_ms` if `total_time_ms > 0.0` (lines 122-128).
- **Critical Correctness Bug 1: Lognormal Parameter Sampling Crash**:
  - In `sample_log_normal` (lines 349-359), the code converts lognormal mean/std to underlying normal parameters:
    `let sigma2 = (variance / (mean * mean) + 1.0).ln();` and `let mu = mean.ln() - sigma2 / 2.0;`.
    If the user configures an activity with `mean = 0.0` (e.g. instant task) or negative values, `mean * mean` becomes `0.0`, resulting in division by zero, and `mean.ln()` will attempt to calculate the log of `0.0` or a negative number. This returns `NaN` or `-Infinity`, which causes the simulation to produce `NaN` results or panic. There are no input validation guards for positive mean/std values.
- **Critical Correctness Bug 2: Resource Constraint Logic Bypass**:
  - In `run_monte_carlo_simulation`, resource contention is simulated inside a trace-by-trace visitor loop (lines 192-280).
  - During simulation of an activity, the resource is acquired: `pool.acquire()` (line 234). If busy, a delay is added.
  - However, the resource is released **immediately** after the activity ends: `pool.release()` (line 245-247).
  - Because cases are processed strictly sequentially (`for (case_idx, trace) in ...` at line 192) and activities within a trace are processed sequentially, there is **zero concurrency** in this simulation.
  - No resource is ever held when starting another task. Thus, `pool.acquire()` will **always succeed** (unless capacity is 0), and resource constraint waiting times will never be triggered.
  - This defeats the purpose of the resource capacity simulation (since capacity limits have no effect on sojourn times or utilization). A real discrete-event simulator must use a global event queue or simulation scheduler to handle parallel case execution and queue tasks when resources are busy.
- **Simulation Time Ignored**:
  - `simulation_time_ms` is parsed from the configuration (line 21) but is completely ignored in the simulation loop. The simulation runs until `num_cases` are completed, regardless of whether `current_time_ms` exceeds `simulation_time_ms`.

## Improvement Areas
- **Implement Discrete Event Scheduling**:
  - Rewrite the simulation engine to use a priority queue of events (StartCase, StartActivity, EndActivity) to support concurrent case execution and capture resource contention delays.
- **Input Validation**:
  - Add validation guards to reject negative or zero service time mean/std before calling `sample_log_normal`.

## Code References
- **Rust Implementation**: `wasm4pm/src/montecarlo.rs` (method: `monte_carlo_simulation` / `run_monte_carlo_simulation`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `monte_carlo_simulation`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
