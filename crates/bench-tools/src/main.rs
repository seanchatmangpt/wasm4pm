//! bench-tools — `cargo`-native benchmark governance for wasm4pm.
//!
//! One binary, the full Fortune-grade measurement pipeline (replacing the former
//! `scripts/bench_*.py`):
//!
//!   report   — walk Criterion output → docs/benchmarks/REPORT.md + report.csv
//!   index    — enumerate bench targets via `cargo metadata` → docs/benchmarks/
//!              index.json + the COVERAGE.md per-bench inventory table
//!   regress  — gate current medians vs the committed baseline; a regression must
//!              clear the threshold AND be statistically distinguishable (95% CI
//!              non-overlap), so noisy benches don't trip false positives
//!   receipt  — emit a BLAKE3 performance receipt (environment + results + lineage),
//!              refresh the CI baseline, and append to the chained ledger
//!   verify   — recompute a receipt's BLAKE3 to detect tampering; refuse a
//!              dirty-tree baseline
//!   ledger   — verify the append-only receipt chain's integrity and print a
//!              per-bench median trend over all recorded runs
//!   attest   — correctness × performance: run the paper-grounded + falsification
//!              gates, join each breed's correctness with its latency, and FAIL on
//!              any FAST-BUT-WRONG breed (a benchmark must not bless wrong code)
//!
//! Why Rust, not Python: the toolchain stays inside `cargo` (no interpreter
//! dependency for CI), and the receipt uses *real* BLAKE3 — the same algorithm the
//! execution receipts use — so a benchmark receipt chains exactly like any other
//! Wasm4pm receipt. The decision logic (regression, chain integrity, hashing) is
//! unit-tested: a gate that can't fail proves nothing.
//!
//! Exit codes: 0 ok · 1 nothing to measure / regression / tamper / attestation
//! failure / unusable baseline · 2 bad arguments · 3 budget skipped (no
//! calibration anchor — CI can distinguish skip from pass).

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

const RECEIPT_TYPE: &str = "Wasm4pmBenchmarkReceipt";
const RECEIPT_SCHEMA: &str = "Wasm4pmBenchmarkReceipt.v1";

// --------------------------------------------------------------------------- paths
fn repo_root() -> PathBuf {
    // crates/bench-tools/ → repo root is two levels up from CARGO_MANIFEST_DIR.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or(manifest)
}

fn default_criterion_dir() -> PathBuf {
    // The workspace shares one target dir at the repo root; Criterion writes
    // every bench (cognition + wasm4pm) under <root>/target/criterion. Honor
    // CARGO_TARGET_DIR when set.
    if let Ok(t) = std::env::var("CARGO_TARGET_DIR") {
        return PathBuf::from(t).join("criterion");
    }
    repo_root().join("target").join("criterion")
}

fn baseline_path() -> PathBuf {
    repo_root()
        .join(".wasm4pm")
        .join("benchmarks")
        .join("baselines")
        .join("main-latest.json")
}

/// Append-only chained history of benchmark receipts (one JSON object per line).
/// Each line links to the prior via `previous_receipt_hash`, giving a tamper-
/// evident longitudinal record for trend analysis across many runs.
fn ledger_path() -> PathBuf {
    repo_root()
        .join(".wasm4pm")
        .join("benchmarks")
        .join("ledger.jsonl")
}

/// Parse the append-only ledger into its valid entries (lines that are JSON
/// objects carrying a `receipt_hash`). Missing or corrupt file → empty vec.
fn read_ledger_entries() -> Vec<Value> {
    fs::read_to_string(ledger_path())
        .map(|t| {
            t.lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str::<Value>(l).ok())
                .filter(|v| v.get("receipt_hash").and_then(Value::as_str).is_some())
                .collect()
        })
        .unwrap_or_default()
}

// --------------------------------------------------------------------------- estimates
#[derive(Clone)]
struct Estimate {
    bench: String,
    median_ns: f64,
    ci_lower_ns: Option<f64>,
    ci_upper_ns: Option<f64>,
    std_dev_ns: Option<f64>,
}

/// Recursively find every `new/estimates.json` under `dir` and reduce each to a
/// median + 95% CI + std-dev. The bench id is the path from `root` down to the
/// directory containing `new/` (Criterion's per-benchmark folder).
fn collect(dir: &Path) -> Vec<Estimate> {
    let mut out = Vec::new();
    walk_estimates(dir, dir, &mut out);
    out.sort_by(|a, b| a.bench.cmp(&b.bench));
    out
}

fn walk_estimates(root: &Path, cur: &Path, out: &mut Vec<Estimate>) {
    let entries = match fs::read_dir(cur) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_estimates(root, &path, out);
        } else if path.file_name().and_then(|n| n.to_str()) == Some("estimates.json")
            && path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                == Some("new")
        {
            if let Some(est) = parse_estimate(root, &path) {
                out.push(est);
            }
        }
    }
}

fn parse_estimate(root: &Path, path: &Path) -> Option<Estimate> {
    let data: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let median = data.get("median")?;
    let pe = median.get("point_estimate")?.as_f64()?;
    let ci = median.get("confidence_interval");
    let lo = ci
        .and_then(|c| c.get("lower_bound"))
        .and_then(Value::as_f64);
    let hi = ci
        .and_then(|c| c.get("upper_bound"))
        .and_then(Value::as_f64);
    let std_dev = data
        .get("std_dev")
        .and_then(|s| s.get("point_estimate"))
        .and_then(Value::as_f64);
    // bench id = <new-dir>.parent relative to root
    let bench_dir = path.parent()?.parent()?;
    let bench = bench_dir
        .strip_prefix(root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    Some(Estimate {
        bench,
        median_ns: pe,
        ci_lower_ns: lo,
        ci_upper_ns: hi,
        std_dev_ns: std_dev,
    })
}

fn fmt_time(ns: f64) -> String {
    for (unit, scale) in [("s", 1e9), ("ms", 1e6), ("µs", 1e3), ("ns", 1.0)] {
        if ns >= scale {
            return format!("{:.3} {}", ns / scale, unit);
        }
    }
    format!("{ns:.3} ns")
}

// --------------------------------------------------------------------------- canonical hash
/// Recursively sort object keys and emit compact JSON — a deterministic
/// serialization so the receipt hash is stable across runs and machines.
fn canonicalize(v: &Value) -> String {
    match v {
        Value::Object(map) => {
            let sorted: BTreeMap<&String, &Value> = map.iter().collect();
            let parts: Vec<String> = sorted
                .iter()
                .map(|(k, val)| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonicalize(val)
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(canonicalize).collect();
            format!("[{}]", parts.join(","))
        }
        other => serde_json::to_string(other).unwrap(),
    }
}

fn blake3_hex(s: &str) -> String {
    blake3::hash(s.as_bytes()).to_hex().to_string()
}

// --------------------------------------------------------------------------- decision logic (pure, tested)
/// Decide whether a current measurement is a regression against a baseline.
///
/// A regression requires BOTH:
///   (a) the median exceeds the baseline median by more than `threshold_pct`, AND
///   (b) the change is statistically distinguishable — the current 95% CI lower
///       bound clears the baseline 95% CI upper bound (intervals disjoint).
/// When CI data is missing on either side, fall back to a one-std-dev jitter
/// guard. Pure and total so the gate logic can be unit-tested directly.
fn is_regression(
    cur_median: f64,
    cur_ci_lower: Option<f64>,
    cur_std_dev: Option<f64>,
    base_median: f64,
    base_ci_upper: Option<f64>,
    threshold_pct: f64,
) -> bool {
    if base_median <= 0.0 {
        return false;
    }
    let delta_pct = (cur_median - base_median) / base_median * 100.0;
    if delta_pct <= threshold_pct {
        return false;
    }
    match (cur_ci_lower, base_ci_upper) {
        (Some(lo), Some(hi)) => lo > hi,
        _ => {
            let noise_pct = cur_std_dev.map(|s| s / base_median * 100.0).unwrap_or(0.0);
            delta_pct > noise_pct
        }
    }
}

/// Cross-machine normalization factor. The calibration anchor (a fixed workload)
/// measures each host's raw speed; scaling the current run's latencies by
/// `baseline_calibration / current_calibration` re-expresses them in the baseline
/// machine's time units, cancelling out hardware differences between CI runners.
/// Returns 1.0 (no-op) when either calibration is missing or non-positive, so the
/// gate degrades gracefully to absolute comparison.
fn normalize_factor(baseline_cal: Option<f64>, current_cal: Option<f64>) -> f64 {
    match (baseline_cal, current_cal) {
        (Some(b), Some(c)) if b > 0.0 && c > 0.0 => b / c,
        _ => 1.0,
    }
}

/// True if a Criterion bench id denotes the machine-speed calibration anchor
/// rather than a real workload (it must be excluded from regression reporting).
/// Exact match: a substring test would silently exclude any bench whose id
/// merely mentions "calibration" (e.g. `breed_latency/calibration_overhead`),
/// unsanctioning real workloads.
fn is_calibration_id(bench: &str) -> bool {
    bench == "calibration/anchor"
}

/// Path-boundary match: `key` matches `bench` iff the bench id IS the key or
/// lives under it (`key + "/"`). Substring matching (`bench.contains(key)`)
/// let an override for `breed_latency` silently capture `breed_latency_v2/x`.
fn scope_matches(key: &str, bench: &str) -> bool {
    bench == key || bench.starts_with(&format!("{key}/"))
}

/// Resolve a benchmark's budget (max allowed median/calibration ratio). The most
/// specific matching override wins (longest matching key, path-boundary match —
/// see [`scope_matches`]). If no override matches, `default_ratio` applies ONLY
/// when the bench id falls in `default_ratio_scope` (default "breed_latency" —
/// the family the default was calibrated against); benches outside the scope with
/// no explicit override are NOT budgeted (returns None) rather than mass-breached.
/// Empty override keys match nothing (the caller rejects them outright). Pure so
/// the precedence and scoping rules can be unit-tested.
fn budget_for_scoped(
    bench: &str,
    default_ratio: f64,
    overrides: &BTreeMap<String, f64>,
    scope: &str,
) -> Option<f64> {
    overrides
        .iter()
        .filter(|(k, _)| !k.is_empty() && scope_matches(k, bench))
        .max_by_key(|(k, _)| k.len())
        .map(|(_, &v)| v)
        .or_else(|| {
            if !scope.is_empty() && scope_matches(scope, bench) {
                Some(default_ratio)
            } else {
                None
            }
        })
}

/// Count breaks in a receipt-chain ledger: each entry's `previous_receipt_hash`
/// must equal the prior entry's `receipt_hash`. Pure over parsed entries so the
/// chain-integrity logic can be unit-tested without touching the filesystem.
fn chain_breaks(entries: &[Value]) -> usize {
    let mut breaks = 0;
    for i in 1..entries.len() {
        let prev_hash = entries[i - 1].get("receipt_hash").and_then(Value::as_str);
        let claimed = entries[i]
            .get("previous_receipt_hash")
            .and_then(Value::as_str);
        if claimed != prev_hash {
            breaks += 1;
        }
    }
    breaks
}

// --------------------------------------------------------------------------- environment
fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        None
    }
}

fn cpu_model() -> Option<String> {
    match std::env::consts::OS {
        "macos" => run("sysctl", &["-n", "machdep.cpu.brand_string"]),
        "linux" => fs::read_to_string("/proc/cpuinfo").ok().and_then(|c| {
            c.lines()
                .find(|l| l.starts_with("model name"))
                .and_then(|l| l.split_once(':'))
                .map(|(_, v)| v.trim().to_string())
        }),
        _ => None,
    }
}

fn cpu_governor() -> Option<String> {
    fs::read_to_string("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")
        .ok()
        .map(|s| s.trim().to_string())
}

fn environment() -> Value {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(0);
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "cpu_model": cpu_model(),
        "logical_cores": cores,
        "cpu_governor": cpu_governor(),
        "rustc": run("rustc", &["--version"]),
    })
}

fn git_field(args: &[&str]) -> Option<String> {
    let root = repo_root();
    let mut a = vec!["-C", root.to_str()?];
    a.extend_from_slice(args);
    run("git", &a)
}

// --------------------------------------------------------------------------- schema guard
/// Validate that `v` is a bench-tools benchmark receipt (the schema `cmd_receipt`
/// itself writes) rather than some other JSON that happens to be lying in
/// `.wasm4pm/benchmarks/` — e.g. the determinism-suite reports (`schema_version`,
/// `overall_status`, per-vector results) misfiled there, which have no
/// `receipt_schema`, no BLAKE3 `receipt_hash`, and no per-bench medians. Pure so
/// the rejection rule is unit-testable.
fn validate_receipt_schema(v: &Value) -> Result<(), String> {
    let schema = v.get("receipt_schema").and_then(Value::as_str);
    if schema != Some(RECEIPT_SCHEMA) {
        return Err(format!(
            "expected receipt_schema {RECEIPT_SCHEMA:?}, found {} — not a bench-tools receipt \
             (determinism-suite reports carry `schema_version`/`overall_status` instead)",
            schema
                .map(|s| format!("{s:?}"))
                .unwrap_or_else(|| "no receipt_schema field".to_string())
        ));
    }
    let benches = v.get("benchmarks").and_then(Value::as_array);
    match benches {
        Some(a) if !a.is_empty() => Ok(()),
        Some(_) => Err("benchmarks array is present but empty".to_string()),
        None => Err("no `benchmarks` array (required per-bench medians)".to_string()),
    }
}

// --------------------------------------------------------------------------- estimates → json
fn estimates_to_json(rows: &[Estimate]) -> Value {
    Value::Array(
        rows.iter()
            .map(|r| {
                serde_json::json!({
                    "bench": r.bench,
                    "median_ns": r.median_ns,
                    "ci_lower_ns": r.ci_lower_ns,
                    "ci_upper_ns": r.ci_upper_ns,
                    "std_dev_ns": r.std_dev_ns,
                })
            })
            .collect(),
    )
}

/// RFC4180 CSV field escaping: quote a field containing comma, quote, CR or LF,
/// doubling embedded quotes. Bench ids are filesystem paths today, but a stray
/// comma in one silently shifts every later CSV column.
fn csv_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

// --------------------------------------------------------------------------- report
fn cmd_report(criterion_dir: &Path, out_dir: &Path) -> i32 {
    let rows = collect(criterion_dir);
    if rows.is_empty() {
        eprintln!("no estimates found under {}", criterion_dir.display());
        return 1;
    }
    if let Err(e) = fs::create_dir_all(out_dir) {
        eprintln!("cannot create {}: {e}", out_dir.display());
        return 1;
    }

    // Markdown
    let mut md = String::from("# Benchmark Report\n\n");
    let _ = write!(
        md,
        "Generated by `bench-tools report` from `{}`.\n\n",
        criterion_dir.display()
    );
    md.push_str("| Benchmark | Median | 95% CI |\n|---|---:|---:|\n");
    for r in &rows {
        let ci = match (r.ci_lower_ns, r.ci_upper_ns) {
            (Some(lo), Some(hi)) => format!("[{}, {}]", fmt_time(lo), fmt_time(hi)),
            _ => "—".to_string(),
        };
        let _ = write!(
            md,
            "| `{}` | {} | {} |\n",
            r.bench,
            fmt_time(r.median_ns),
            ci
        );
    }
    let report_md = out_dir.join("REPORT.md");
    if let Err(e) = fs::write(&report_md, md) {
        eprintln!("cannot write {}: {e}", report_md.display());
        return 1;
    }

    // CSV
    let mut csv = String::from("bench,median_ns,ci_lower_ns,ci_upper_ns,std_dev_ns\n");
    for r in &rows {
        let _ = write!(
            csv,
            "{},{},{},{},{}\n",
            csv_field(&r.bench),
            r.median_ns,
            r.ci_lower_ns.map(|v| v.to_string()).unwrap_or_default(),
            r.ci_upper_ns.map(|v| v.to_string()).unwrap_or_default(),
            r.std_dev_ns.map(|v| v.to_string()).unwrap_or_default(),
        );
    }
    let report_csv = out_dir.join("report.csv");
    if let Err(e) = fs::write(&report_csv, csv) {
        eprintln!("cannot write {}: {e}", report_csv.display());
        return 1;
    }

    println!(
        "report: {} benches → {} + {}",
        rows.len(),
        report_md.display(),
        report_csv.display()
    );
    0
}

// --------------------------------------------------------------------------- regress
fn cmd_regress(criterion_dir: &Path, baseline: &Path, threshold_pct: f64, min_coverage: f64) -> i32 {
    let current = collect(criterion_dir);
    if current.is_empty() {
        eprintln!("no current estimates under {}", criterion_dir.display());
        return 1;
    }
    let base_json: Value = match fs::read_to_string(baseline)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(v) => v,
        None => {
            eprintln!(
                "no readable baseline at {} — run `bench-tools receipt` first",
                baseline.display()
            );
            return 1;
        }
    };
    // D4: reject wrong-schema baselines outright. A determinism-suite report
    // (or any non-receipt JSON) previously parsed to an EMPTY bench map and
    // produced a vacuous "compared 0/24, exit 0" pass.
    if let Err(reason) = validate_receipt_schema(&base_json) {
        eprintln!(
            "UNUSABLE BASELINE: {} — {reason}. \
             Run `bench-tools receipt` (or `just bench-bootstrap`) to write a real baseline.",
            baseline.display()
        );
        return 1;
    }
    // E2: the baseline is a signed receipt — verify its hash before gating on
    // it. A tampered baseline (median edited after signing) would otherwise
    // bless whatever the forger wrote. Also rejects hash-less baselines that
    // predate signed receipts (or were hand-fabricated).
    let base_stored = base_json.get("receipt_hash").and_then(Value::as_str);
    match base_stored {
        Some(stored) => {
            match recompute_receipt_hash(&base_json) {
                Some(r) if r == stored => {}
                Some(r) => {
                    eprintln!(
                        "UNUSABLE BASELINE: {} — TAMPERED (stored hash {} != recomputed {}); \
                         regenerate with `bench-tools receipt`",
                        baseline.display(),
                        &stored[..16.min(stored.len())],
                        &r[..16.min(r.len())]
                    );
                    return 1;
                }
                None => {
                    eprintln!(
                        "UNUSABLE BASELINE: {} — receipt_hash field vanished mid-verify",
                        baseline.display()
                    );
                    return 1;
                }
            }
        }
        None => {
            eprintln!(
                "UNUSABLE BASELINE: {} — no receipt_hash (baseline predates signed \
                 receipts or was hand-fabricated); regenerate with `bench-tools receipt`",
                baseline.display()
            );
            return 1;
        }
    }
    // Baseline keyed by bench id → (median, ci_lower, ci_upper). Carrying the
    // confidence interval lets the gate distinguish a real shift from noise.
    // E9: non-positive or non-finite medians are excluded (they poison the
    // percentage math and can hide or invent regressions) and counted loudly.
    let mut base: BTreeMap<String, (f64, Option<f64>, Option<f64>)> = BTreeMap::new();
    let mut excluded_bad_median = 0usize;
    if let Some(arr) = base_json.get("benchmarks").and_then(Value::as_array) {
        for b in arr {
            let Some(bench) = b.get("bench").and_then(Value::as_str) else {
                continue;
            };
            let Some(median) = b.get("median_ns").and_then(Value::as_f64) else {
                continue;
            };
            if !median.is_finite() || median <= 0.0 {
                excluded_bad_median += 1;
                continue;
            }
            base.insert(
                bench.to_string(),
                (
                    median,
                    b.get("ci_lower_ns").and_then(Value::as_f64),
                    b.get("ci_upper_ns").and_then(Value::as_f64),
                ),
            );
        }
    }
    if excluded_bad_median > 0 {
        eprintln!(
            "warning: excluded {excluded_bad_median} baseline entr(y/ies) with \
             non-positive or non-finite median_ns"
        );
    }

    // Cross-machine normalization: scale this run's latencies into the baseline
    // host's time units via the calibration anchor, so a baseline captured on a
    // different (faster/slower) machine does not produce phantom regressions.
    let base_cal = base_json.get("calibration_ns").and_then(Value::as_f64);
    let cur_cal = current
        .iter()
        .find(|r| is_calibration_id(&r.bench))
        .map(|r| r.median_ns);
    let factor = normalize_factor(base_cal, cur_cal);
    let normalized = (factor - 1.0).abs() > f64::EPSILON;

    let mut regressions = Vec::new();
    let mut compared = 0;
    for r in &current {
        // The calibration anchor itself is not a workload — never gate on it.
        if is_calibration_id(&r.bench) {
            continue;
        }
        if let Some(&(base_median, _base_ci_lo, base_ci_hi)) = base.get(&r.bench) {
            compared += 1;
            let med = r.median_ns * factor;
            let lo = r.ci_lower_ns.map(|v| v * factor);
            let std = r.std_dev_ns.map(|v| v * factor);
            if is_regression(med, lo, std, base_median, base_ci_hi, threshold_pct) {
                let delta_pct = (med - base_median) / base_median * 100.0;
                regressions.push((r.bench.clone(), base_median, med, delta_pct));
            }
        }
    }

    if compared == 0 {
        // D4: the baseline matches none of the current benches — a vacuous pass.
        eprintln!(
            "UNUSABLE BASELINE: {} benches measured but 0 overlap the baseline's {} entries \
             (wrong schema or no common bench ids) — refusing to pass vacuously",
            current.len(),
            base.len()
        );
        return 1;
    }
    // E1: coverage floor — a gate that compares 2 of 30 benches and passes is
    // not a gate. Default floor 0.5 (via --min-coverage).
    let comparable = current.iter().filter(|r| !is_calibration_id(&r.bench)).count();
    if comparable > 0 {
        let coverage = compared as f64 / comparable as f64;
        if coverage < min_coverage {
            eprintln!(
                "INSUFFICIENT COVERAGE: only {compared}/{comparable} current benches overlap \
                 the baseline ({:.1}% < {:.1}% --min-coverage floor) — refusing to pass \
                 on a partial comparison",
                coverage * 100.0,
                min_coverage * 100.0
            );
            return 1;
        }
    }
    println!(
        "regress: compared {compared}/{} benches against baseline \
         (threshold {threshold_pct:.1}%, 95% CI non-overlap required{})",
        current.len(),
        if normalized {
            format!(", calibration-normalized ×{factor:.3}")
        } else {
            String::new()
        }
    );
    if regressions.is_empty() {
        println!("no statistically-distinguishable regressions beyond threshold");
        return 0;
    }
    eprintln!("REGRESSIONS ({}):", regressions.len());
    for (bench, base, now, pct) in &regressions {
        eprintln!(
            "  {bench}: {} → {} (+{pct:.1}%, CIs disjoint)",
            fmt_time(*base),
            fmt_time(*now)
        );
    }
    1
}

// --------------------------------------------------------------------------- receipt
fn cmd_receipt(criterion_dir: &Path, write_baseline: bool, out: Option<&Path>, echo: bool) -> i32 {
    let rows = collect(criterion_dir);
    if rows.is_empty() {
        eprintln!("no estimates found under {}", criterion_dir.display());
        return 1;
    }

    let previous_hash = if write_baseline {
        let bp = baseline_path();
        match fs::read_to_string(&bp)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        {
            // Existing baseline must be a real receipt — chaining a new receipt
            // onto a wrong-schema file (e.g. a determinism-suite report) would
            // silently launder it into the provenance chain.
            Some(v) => match validate_receipt_schema(&v) {
                Ok(()) => v
                    .get("receipt_hash")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                Err(reason) => {
                    eprintln!(
                        "existing baseline {} is not a valid receipt ({reason}) — \
                         remove or replace it before writing a new one",
                        bp.display()
                    );
                    return 1;
                }
            },
            None => None,
        }
    } else {
        None
    };

    let dirty = git_field(&["status", "--porcelain"]).map(|s| !s.is_empty());
    let created_at = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    // Body WITHOUT the hash fields (the hash cannot reference itself).
    // Calibration anchor median for this machine (if the calibration bench ran),
    // recorded so the regression gate can normalize across heterogeneous runners.
    let calibration_ns = rows
        .iter()
        .find(|r| is_calibration_id(&r.bench))
        .map(|r| r.median_ns);

    // E7: ledger anchor — where in the append-only ledger this receipt sits.
    // ledger_entry_count = number of entries the ledger will hold after this
    // receipt appends (1-based position); ledger_previous_head = the receipt
    // hash at the prior position (null for the first entry / absent ledger).
    // Both go INSIDE the hashed body, so editing the ledger's early entries or
    // truncating it is detectable against any receipt that anchored there.
    let ledger_entries_before = read_ledger_entries();
    let ledger_entry_count = ledger_entries_before.len() + 1;
    let ledger_previous_head: Option<String> = ledger_entries_before.last().and_then(|v| {
        v.get("receipt_hash")
            .and_then(Value::as_str)
            .map(str::to_string)
    });

    let body = serde_json::json!({
        "receipt_type": RECEIPT_TYPE,
        "receipt_schema": RECEIPT_SCHEMA,
        "package": "wasm4pm",
        "commit": git_field(&["rev-parse", "HEAD"]),
        "branch": git_field(&["rev-parse", "--abbrev-ref", "HEAD"]),
        "tree_dirty": dirty,
        "canonicalization": "sorted-compact-json",
        "time_basis": "WallClockUTC",
        "created_at": created_at,
        "environment": environment(),
        "calibration_ns": calibration_ns,
        "benchmark_count": rows.len(),
        "benchmarks": estimates_to_json(&rows),
        "previous_receipt_hash": previous_hash,
        "ledger_entry_count": ledger_entry_count,
        "ledger_previous_head": ledger_previous_head,
    });

    let receipt_hash = blake3_hex(&canonicalize(&body));
    let mut receipt = body;
    receipt["hash_algorithm"] = Value::String("BLAKE3".to_string());
    receipt["receipt_hash"] = Value::String(receipt_hash.clone());

    let payload = serde_json::to_string_pretty(&receipt).unwrap();

    if write_baseline {
        let bp = baseline_path();
        if let Some(parent) = bp.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(e) = fs::write(&bp, format!("{payload}\n")) {
            eprintln!("cannot write baseline {}: {e}", bp.display());
            return 1;
        }
        println!("baseline updated: {}", bp.display());

        // Append a compact entry to the chained ledger. We store per-bench
        // medians (not the full CI/environment block) so the longitudinal file
        // stays small while still supporting trend analysis; the chain link
        // (previous_receipt_hash → receipt_hash) makes the history tamper-evident.
        let medians: BTreeMap<&String, f64> =
            rows.iter().map(|r| (&r.bench, r.median_ns)).collect();
        let entry = serde_json::json!({
            "created_at": receipt["created_at"],
            "commit": receipt["commit"],
            "branch": receipt["branch"],
            "tree_dirty": receipt["tree_dirty"],
            "receipt_hash": receipt_hash,
            "previous_receipt_hash": receipt["previous_receipt_hash"],
            "benchmark_count": rows.len(),
            "medians_ns": medians,
        });
        let lp = ledger_path();
        let line = serde_json::to_string(&entry).unwrap();
        let appended = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&lp)
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(f, "{line}")
            });
        match appended {
            Ok(()) => println!("ledger appended: {}", lp.display()),
            Err(e) => eprintln!("warning: could not append ledger {}: {e}", lp.display()),
        }
    }
    if let Some(out_path) = out {
        if let Some(parent) = out_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(out_path, format!("{payload}\n"));
        println!("receipt written: {}", out_path.display());
    }
    if echo {
        println!("{payload}");
    }
    println!(
        "benchmark receipt: {} benches · BLAKE3 {} · commit {}{}",
        rows.len(),
        &receipt_hash[..16.min(receipt_hash.len())],
        git_field(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "?".into()),
        if dirty == Some(true) { " (DIRTY)" } else { "" }
    );
    0
}

// --------------------------------------------------------------------------- verify
/// Verify a benchmark receipt's integrity: recompute the BLAKE3 over the
/// canonical body (everything except the two hash fields) and confirm it matches
/// the stored `receipt_hash`. A mismatch means the receipt — or the result set it
/// vouches for — was altered after signing. Also rejects a `tree_dirty` receipt
/// as a baseline (it corresponds to no committed state) unless `--allow-dirty`.
///
/// This is what makes a receipt more than decorative JSON: an unverifiable
/// receipt cannot be trusted as a regression baseline or a provenance record.
/// Recompute the BLAKE3 receipt hash of a receipt-shaped JSON value: rebuild the
/// hashed body (everything except the two hash fields) and hash it canonically.
/// Shared by `verify` and `regress` so a baseline can never be tampered without
/// the regression gate noticing. Returns None if `receipt_hash` is absent.
fn recompute_receipt_hash(receipt: &Value) -> Option<String> {
    receipt.get("receipt_hash").and_then(Value::as_str)?;
    let mut body = receipt.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.remove("receipt_hash");
        obj.remove("hash_algorithm");
    }
    Some(blake3_hex(&canonicalize(&body)))
}

fn cmd_verify(receipt_path: &Path, allow_dirty: bool) -> i32 {
    let receipt: Value = match fs::read_to_string(receipt_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(v) => v,
        None => {
            eprintln!("no readable receipt at {}", receipt_path.display());
            return 1;
        }
    };

    let stored = match receipt.get("receipt_hash").and_then(Value::as_str) {
        Some(h) => h.to_string(),
        None => {
            eprintln!(
                "receipt has no receipt_hash field: {}",
                receipt_path.display()
            );
            return 1;
        }
    };
    let Some(recomputed) = recompute_receipt_hash(&receipt) else {
        eprintln!(
            "receipt has no receipt_hash field: {}",
            receipt_path.display()
        );
        return 1;
    };

    let count = receipt
        .get("benchmark_count")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let commit = receipt
        .get("commit")
        .and_then(Value::as_str)
        .map(|c| &c[..8.min(c.len())])
        .unwrap_or("?");
    let dirty = receipt
        .get("tree_dirty")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if recomputed != stored {
        eprintln!(
            "TAMPERED: {} — stored hash {} != recomputed {}",
            receipt_path.display(),
            &stored[..16.min(stored.len())],
            &recomputed[..16.min(recomputed.len())],
        );
        return 1;
    }

    if dirty && !allow_dirty {
        eprintln!(
            "UNTRUSTWORTHY: receipt {} was produced from a DIRTY tree (commit {commit}) — \
             it corresponds to no committed state. Re-run on a clean tree, or pass --allow-dirty.",
            receipt_path.display()
        );
        return 1;
    }

    println!(
        "verified: {} · BLAKE3 {} · {count} benches · commit {commit}{}",
        receipt_path.display(),
        &stored[..16.min(stored.len())],
        if dirty { " (DIRTY, allowed)" } else { "" }
    );
    0
}

/// E7 anchor rule (pure): does the ledger still hold, at 1-based position
/// `count`, an entry whose `receipt_hash` is `head`? A baseline receipt pins
/// exactly this; any disagreement means the ledger's history moved after the
/// baseline was signed.
fn ledger_anchor_matches(entries: &[Value], count: u64, head: &str) -> bool {
    if count == 0 {
        return true;
    }
    entries
        .get((count - 1) as usize)
        .and_then(|e| e.get("receipt_hash").and_then(Value::as_str))
        == Some(head)
}

// --------------------------------------------------------------------------- ledger
/// Walk the append-only receipt ledger: verify chain integrity (each entry's
/// `previous_receipt_hash` must equal the prior entry's `receipt_hash`) and emit
/// a per-bench trend (first → last median, % change, direction). This is the
/// longitudinal governance view — performance over many runs, not just PR-to-PR.
fn cmd_ledger(bench_filter: Option<&str>) -> i32 {
    let lp = ledger_path();
    let text = match fs::read_to_string(&lp) {
        Ok(t) => t,
        Err(_) => {
            eprintln!(
                "no ledger at {} — run `bench-tools receipt` to seed it",
                lp.display()
            );
            return 1;
        }
    };
    let mut entries: Vec<Value> = Vec::new();
    let mut rejected = Vec::new();
    for (i, l) in text.lines().enumerate() {
        if l.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(l) {
            Ok(v) if v.get("receipt_hash").and_then(Value::as_str).is_some() => {
                entries.push(v)
            }
            Ok(_) => rejected.push(format!(
                "line {}: valid JSON but no receipt_hash (not a ledger entry)",
                i + 1
            )),
            Err(e) => rejected.push(format!("line {}: unparseable ({e})", i + 1)),
        }
    }
    if !rejected.is_empty() {
        eprintln!(
            "ledger {} rejected {} non-entry line(s):",
            lp.display(),
            rejected.len()
        );
        for r in &rejected {
            eprintln!("  {r}");
        }
    }
    if entries.is_empty() {
        eprintln!("ledger {} has no parseable entries", lp.display());
        return 1;
    }

    // 1. Chain integrity: entry[i].previous_receipt_hash must link to entry[i-1].
    let breaks = chain_breaks(&entries);
    for i in 1..entries.len() {
        let prev_hash = entries[i - 1].get("receipt_hash").and_then(Value::as_str);
        let claimed = entries[i]
            .get("previous_receipt_hash")
            .and_then(Value::as_str);
        if claimed != prev_hash {
            eprintln!(
                "  chain break at entry {i}: previous_receipt_hash {:?} != prior receipt_hash {:?}",
                claimed.map(|s| &s[..8.min(s.len())]),
                prev_hash.map(|s| &s[..8.min(s.len())]),
            );
        }
    }

    // 1b. Ledger anchor: the current baseline receipt records the ledger
    // position (entry count + head hash) it was minted against — both inside
    // its hashed body. Verify the live ledger still agrees; a disagreement
    // means the ledger's early history was edited or truncated after the
    // baseline was signed. A baseline without the fields predates anchoring —
    // warn once, do not fail (backwards compatibility).
    let bp = baseline_path();
    if let Ok(text) = fs::read_to_string(&bp) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            let count = v.get("ledger_entry_count").and_then(Value::as_u64);
            let head = v
                .get("ledger_previous_head")
                .and_then(Value::as_str);
            match (count, head) {
                (Some(c), Some(h)) if c > 0 => {
                    let idx = (c - 1) as usize;
                    if !ledger_anchor_matches(&entries, c, h) {
                        eprintln!(
                            "LEDGER ANCHOR BROKEN: baseline {} was minted at ledger entry \
                             {c} with head {}…, but the ledger {}",
                            bp.display(),
                            &h[..16.min(h.len())],
                            if entries.len() <= idx {
                                format!("has only {} entries (truncated?)", entries.len())
                            } else {
                                format!(
                                    "has {} there",
                                    entries[idx]
                                        .get("receipt_hash")
                                        .and_then(Value::as_str)
                                        .map(|s| &s[..16.min(s.len())])
                                        .unwrap_or("?")
                                )
                            }
                        );
                        return 1;
                    }
                }
                (Some(_), Some(_)) => {} // anchored at position 0 — nothing to check
                (None, None) => {
                    // Warn-once: single call site, fires at most one line per run.
                    eprintln!(
                        "warning: baseline {} predates ledger anchoring \
                         (no ledger_entry_count/ledger_previous_head) — anchor not verified",
                        bp.display()
                    );
                }
                _ => {
                    eprintln!(
                        "warning: baseline {} ledger anchor fields incomplete — anchor not verified",
                        bp.display()
                    );
                }
            }
        }
    }

    // 2. Per-bench trend: first vs last recorded median.
    let first = &entries[0]["medians_ns"];
    let last = &entries[entries.len() - 1]["medians_ns"];
    let mut bench_names: Vec<&String> = last
        .as_object()
        .map(|o| o.keys().collect())
        .unwrap_or_default();
    bench_names.sort();

    println!(
        "ledger: {} entries · {} chain break(s)",
        entries.len(),
        breaks
    );
    println!("trend (first → last median):");
    for name in bench_names {
        if let Some(f) = bench_filter {
            if !name.contains(f) {
                continue;
            }
        }
        let last_v = last.get(name).and_then(Value::as_f64);
        let first_v = first.get(name).and_then(Value::as_f64);
        match (first_v, last_v) {
            (Some(fv), Some(lv)) => {
                let pct = if fv != 0.0 {
                    (lv - fv) / fv * 100.0
                } else {
                    0.0
                };
                let dir = if pct > 1.0 {
                    "▲ slower"
                } else if pct < -1.0 {
                    "▼ faster"
                } else {
                    "≈ flat"
                };
                println!(
                    "  {name}: {} → {} ({pct:+.1}% {dir})",
                    fmt_time(fv),
                    fmt_time(lv)
                );
            }
            (None, Some(lv)) => println!("  {name}: (new) → {}", fmt_time(lv)),
            _ => {}
        }
    }

    if breaks > 0 {
        eprintln!("ledger chain INTEGRITY FAILED: {breaks} break(s)");
        return 1;
    }
    0
}

// --------------------------------------------------------------------------- attest
/// Correctness × performance attestation — the synthesis gate.
///
/// For a *reasoning* engine, a benchmark number is meaningless if the breed is
/// wrong: a fast wrong answer is worse than a slow correct one. This runs the
/// paper-grounded gate (per-breed: does the breed reproduce its paper's published
/// value?) and the falsification gate (does the suite confirm AND reject mutants?),
/// joins each breed's correctness with its measured latency, and assigns a verdict
/// that flags the dangerous FAST-BUT-WRONG case a latency benchmark alone hides.
fn cmd_attest(criterion_dir: &Path, out_dir: &Path) -> i32 {
    // 1. Per-breed correctness from the paper-grounded test names.
    println!("running paper-grounded gate (cargo test --test paper_grounded)…");
    let grounded_out = run_capture(
        "cargo",
        &[
            "test",
            "-p",
            "wasm4pm-cognition",
            "--test",
            "paper_grounded",
        ],
    );
    let Some(grounded_out) = grounded_out else {
        eprintln!("could not run the paper_grounded test (cargo unavailable or compile error)");
        return 1;
    };
    let mut grounded: BTreeMap<String, bool> = BTreeMap::new();
    for line in grounded_out.lines() {
        // "test <breed>_paper_grounded ... ok" | "... FAILED"
        let l = line.trim_start();
        if let Some(rest) = l.strip_prefix("test ") {
            if let Some(name) = rest.split("_paper_grounded").next() {
                if rest.contains("_paper_grounded")
                    && (rest.contains(" ... ok") || rest.contains(" ... FAILED"))
                {
                    grounded.insert(name.to_string(), rest.contains(" ... ok"));
                }
            }
        }
    }

    // 2. Falsification gate — a single aggregate suite over all fixtures.
    println!("running falsification gate (cargo test --test paper_falsification)…");
    let fals_out = run_capture(
        "cargo",
        &[
            "test",
            "-p",
            "wasm4pm-cognition",
            "--test",
            "paper_falsification",
        ],
    );
    let falsification_pass = fals_out
        .as_deref()
        .map(|o| {
            // A suite passes only if it RAN something and nothing failed —
            // "test result: ok" alone also matches "0 tests" runs.
            let (passed, failed) = parse_test_result(o);
            failed == 0 && passed > 0
        })
        .unwrap_or(false);

    // 3. Benchmark latency per breed, keyed by the FULL Criterion bench id
    // (e.g. "breed_latency/mycin"). The former rsplit('/') strip collapsed
    // same-named benches from different families onto one key.
    let medians: BTreeMap<String, f64> = collect(criterion_dir)
        .into_iter()
        .map(|e| (e.bench, e.median_ns))
        .collect();

    if grounded.is_empty() {
        eprintln!("no paper_grounded results parsed — aborting attestation");
        return 1;
    }

    // 4. Join → verdict per breed.
    let mut trusted = 0;
    let mut fast_but_wrong = 0;
    let mut correct_unbenched = 0;
    let mut broken = 0;
    let mut md = String::from("# Benchmark Attestation — correctness × performance\n\n");
    let _ = write!(
        md,
        "Falsification suite (confirm + reject mutants): **{}**\n\n",
        if falsification_pass { "PASS" } else { "FAIL" }
    );
    md.push_str("| Breed | Paper-grounded | Latency | Verdict |\n|---|:--:|---:|---|\n");
    for (breed, &ok) in &grounded {
        let lat = medians.get(&format!("breed_latency/{breed}")).copied();
        let (verdict, lat_str) = match (ok, lat) {
            (true, Some(ns)) => {
                trusted += 1;
                ("✅ TRUSTED", fmt_time(ns))
            }
            (true, None) => {
                correct_unbenched += 1;
                ("☐ CORRECT (unbenched)", "—".to_string())
            }
            (false, Some(ns)) => {
                fast_but_wrong += 1;
                ("⚠️ FAST-BUT-WRONG", fmt_time(ns))
            }
            (false, None) => {
                broken += 1;
                ("❌ BROKEN", "—".to_string())
            }
        };
        let _ = write!(
            md,
            "| `{breed}` | {} | {lat_str} | {verdict} |\n",
            if ok { "✓" } else { "✗" }
        );
    }
    let _ = write!(
        md,
        "\n**{} trusted · {} fast-but-wrong · {} correct-unbenched · {} broken** \
         (of {} breeds).\n\nA *trusted* latency is one whose breed provably reproduces \
         its source paper. A *fast-but-wrong* breed is the one a latency benchmark \
         alone would silently bless.\n",
        trusted,
        fast_but_wrong,
        correct_unbenched,
        broken,
        grounded.len()
    );

    if let Err(e) = fs::create_dir_all(out_dir) {
        eprintln!("cannot create {}: {e}", out_dir.display());
        return 1;
    }
    let att = out_dir.join("ATTESTATION.md");
    if let Err(e) = fs::write(&att, &md) {
        eprintln!("cannot write {}: {e}", att.display());
        return 1;
    }

    println!(
        "attestation: {trusted} trusted · {fast_but_wrong} fast-but-wrong · \
         {correct_unbenched} correct-unbenched · {broken} broken → {}",
        att.display()
    );
    println!(
        "falsification suite: {}",
        if falsification_pass { "PASS" } else { "FAIL" }
    );
    // E6: a correct-but-unbenched breed carries NO latency evidence — say so
    // loudly on stderr instead of burying the count in the report file.
    if correct_unbenched > 0 {
        eprintln!(
            "WARNING: {correct_unbenched} breed(s) are CORRECT but UNBENCHED — \
             no latency evidence exists for them; this attestation covers their \
             correctness only. Run `cargo bench` to close the gap."
        );
    }

    // A fast-but-wrong breed, a broken breed, or a failed falsification suite is
    // an attestation failure: the benchmark vouches for code that is not correct.
    if fast_but_wrong > 0 || broken > 0 || !falsification_pass {
        eprintln!(
            "ATTESTATION FAILED: {fast_but_wrong} fast-but-wrong, {broken} broken, \
             falsification {}",
            if falsification_pass { "ok" } else { "FAILED" }
        );
        return 1;
    }
    0
}

/// Run a command and return combined stdout+stderr (cargo prints test lines to
/// stdout, compile errors to stderr). Returns None only if the process could not
/// be spawned — a non-zero exit (e.g. a failing test) still yields its output.
fn run_capture(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    Some(s)
}

/// Sum cargo's `test result: <status>. N passed; M failed; …` summary lines
/// into (passed, failed). Pure so the pass rule (failed == 0 AND passed > 0)
/// is unit-testable — a "0 tests" run must not read as a pass.
fn parse_test_result(output: &str) -> (usize, usize) {
    let mut passed = 0usize;
    let mut failed = 0usize;
    for line in output.lines() {
        let l = line.trim();
        let Some(rest) = l.strip_prefix("test result: ") else {
            continue;
        };
        let Some(counts) = rest.split_once('.').map(|(_, c)| c) else {
            continue;
        };
        for part in counts.split(';') {
            let p = part.trim();
            if let Some(n) = p.strip_suffix(" passed") {
                passed += n.trim().parse().unwrap_or(0);
            } else if let Some(n) = p.strip_suffix(" failed") {
                failed += n.trim().parse().unwrap_or(0);
            }
        }
    }
    (passed, failed)
}

// --------------------------------------------------------------------------- budget
/// Performance budgets as code: enforce machine-independent latency SLOs.
///
/// A budget is the maximum allowed ratio of a benchmark's median to the
/// calibration anchor's median. Because both are measured on the same host the
/// ratio cancels machine speed, so a budget holds on any runner. This is distinct
/// from `regress` (don't get worse than last time) — a budget is an absolute
/// ceiling the code must never cross, however the baseline drifts.
fn cmd_budget(criterion_dir: &Path, budgets_file: &Path) -> i32 {
    let rows = collect(criterion_dir);
    if rows.is_empty() {
        eprintln!("no estimates found under {}", criterion_dir.display());
        return 1;
    }
    let cfg: Value = match fs::read_to_string(budgets_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(v) => v,
        None => {
            eprintln!("no readable budgets file at {}", budgets_file.display());
            return 1;
        }
    };
    let default_ratio = cfg
        .get("default_ratio")
        .and_then(Value::as_f64)
        .unwrap_or(f64::INFINITY);
    // D5: the default ratio was calibrated for the breed_latency family only —
    // applying it to every bench (wasm4pm crate benches, calibration, etc.)
    // mass-breached unrelated suites. `default_ratio_scope` names the bench-id
    // substring the default applies to; other benches need explicit overrides.
    let scope = cfg
        .get("default_ratio_scope")
        .and_then(Value::as_str)
        .unwrap_or("breed_latency");
    let overrides: BTreeMap<String, f64> = cfg
        .get("overrides")
        .and_then(Value::as_object)
        .map(|o| {
            o.iter()
                .filter_map(|(k, v)| v.as_f64().map(|f| (k.clone(), f)))
                .collect()
        })
        .unwrap_or_default();
    // E5: an empty override key is a config error — under substring matching it
    // silently matched EVERY bench; under path-boundary matching it can match
    // nothing. Either way the operator's intent is not what the file says.
    if overrides.keys().any(|k| k.is_empty()) {
        eprintln!(
            "BUDGETS INVALID: empty override key in {} — override keys must be \
             non-empty bench-id path prefixes (e.g. \"breed_latency/mycin\")",
            budgets_file.display()
        );
        return 2;
    }

    // Budgets are ratios against the calibration anchor — without it they cannot
    // be enforced machine-independently. D5: this skip is now LOUD (stderr) and
    // carries a distinct exit code (3) so CI can distinguish skip from pass.
    let calibration = rows
        .iter()
        .find(|r| is_calibration_id(&r.bench))
        .map(|r| r.median_ns);
    let Some(cal) = calibration.filter(|&c| c > 0.0) else {
        eprintln!(
            "budget: SKIPPED — no calibration anchor in {} \
             (run the `calibration/anchor` bench to enforce ratio budgets; exit 3)",
            criterion_dir.display()
        );
        return 3;
    };

    let mut breaches = Vec::new();
    let mut checked = 0;
    let mut skipped_no_override = 0;
    for r in &rows {
        if is_calibration_id(&r.bench) {
            continue;
        }
        let Some(budget) = budget_for_scoped(&r.bench, default_ratio, &overrides, scope) else {
            skipped_no_override += 1;
            continue;
        };
        checked += 1;
        let ratio = r.median_ns / cal;
        if ratio > budget {
            breaches.push((r.bench.clone(), ratio, budget));
        }
    }

    println!(
        "budget: checked {checked} benches against ratio SLOs in scope `{scope}` \
         (calibration {} ns; {skipped_no_override} outside scope without override skipped)",
        cal as u64
    );
    if breaches.is_empty() {
        println!("all benches within budget");
        return 0;
    }
    eprintln!("BUDGET BREACHES ({}):", breaches.len());
    for (bench, ratio, budget) in &breaches {
        eprintln!("  {bench}: {ratio:.2}× calibration exceeds budget {budget:.2}×");
    }
    1
}

// --------------------------------------------------------------------------- index
/// Schema id for the emitted benchmark inventory (`index.json`).
const INDEX_SCHEMA: &str = "wasm4pm.benchmark-index.v1";

/// Dataset-grounding literals: a bench source mentioning one of these is
/// grounded on real published data rather than synthetic generated logs.
const DATASET_LITERALS: [&str; 2] = ["bench_data/", "tests/fixtures/papers/"];

/// Parse the `[[bench]]` sections of a Cargo.toml text and return the explicitly
/// registered bench target names. Pure so registration detection is testable;
/// cargo metadata alone cannot distinguish a registered target from cargo's
/// auto-discovery of a stray `benches/*.rs` (both appear in the target list).
fn parse_registered_benches(manifest_text: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut in_bench = false;
    for line in manifest_text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("[[bench]]") {
            in_bench = true;
            continue;
        }
        if trimmed.starts_with('[') {
            in_bench = false;
            continue;
        }
        if !in_bench {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("name") {
            if let Some(val) = rest.trim_start().strip_prefix('=') {
                let val = val.trim();
                if let Some(v) = val.strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
                    names.push(v.to_string());
                }
            }
        }
    }
    names
}

/// Metric greps: (uses Throughput, uses black_box). A bench with neither is
/// latency-only wall-clock; TP without BB may be partially elided by the
/// optimizer (the COVERAGE.md "gap" classes). Pure, so unit-testable.
fn detect_metrics(src: &str) -> (bool, bool) {
    (src.contains("Throughput"), src.contains("black_box"))
}

/// Which dataset-grounding literals the bench source mentions, in canonical
/// (declaration) order. Pure, so unit-testable.
fn detect_datasets(src: &str) -> Vec<&'static str> {
    DATASET_LITERALS
        .iter()
        .copied()
        .filter(|l| src.contains(l))
        .collect()
}

/// Enumerate every bench target of the workspace rooted at `manifest` via
/// `cargo metadata --no-deps`, grep each source for throughput/black_box/dataset
/// grounding, and emit `docs/benchmarks/index.json` (schema
/// `wasm4pm.benchmark-index.v1`). Auto-discovered module-only files (no `fn main`,
/// not registered — e.g. `benches/helpers.rs`) are excluded. Also regenerates the
/// per-bench inventory table in `COVERAGE.md` under its existing heading.
fn cmd_index(manifest: &Path, out_dir: &Path) -> i32 {
    let out = Command::new("cargo")
        .args([
            "metadata",
            "--format-version",
            "1",
            "--no-deps",
            "--manifest-path",
            &manifest.to_string_lossy(),
        ])
        .output();
    let out = match out {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            eprintln!(
                "cargo metadata failed ({}): {}",
                o.status,
                String::from_utf8_lossy(&o.stderr)
            );
            return 1;
        }
        Err(e) => {
            eprintln!("cannot spawn cargo metadata: {e}");
            return 1;
        }
    };
    let meta: Value = match serde_json::from_slice(&out.stdout) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("unparseable cargo metadata output: {e}");
            return 1;
        }
    };

    // Per-package registered bench names (from the Cargo.toml text) + manifest dir.
    let mut registered_by_pkg: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut manifest_dir_by_pkg: BTreeMap<String, PathBuf> = BTreeMap::new();
    if let Some(packages) = meta.get("packages").and_then(Value::as_array) {
        for pkg in packages {
            let Some(name) = pkg.get("name").and_then(Value::as_str) else {
                continue;
            };
            if let Some(mp) = pkg.get("manifest_path").and_then(Value::as_str) {
                let mp = PathBuf::from(mp);
                if let Some(text) = fs::read_to_string(&mp).ok().or(None) {
                    registered_by_pkg.insert(name.to_string(), parse_registered_benches(&text));
                }
                if let Some(dir) = mp.parent() {
                    manifest_dir_by_pkg.insert(name.to_string(), dir.to_path_buf());
                }
            }
        }
    }

    let mut benches: Vec<Value> = Vec::new();
    if let Some(packages) = meta.get("packages").and_then(Value::as_array) {
        for pkg in packages {
            let Some(pkg_name) = pkg.get("name").and_then(Value::as_str) else {
                continue;
            };
            let Some(targets) = pkg.get("targets").and_then(Value::as_array) else {
                continue;
            };
            for t in targets {
                let is_bench = t
                    .get("kind")
                    .and_then(Value::as_array)
                    .map(|k| k.iter().any(|k| k.as_str() == Some("bench")))
                    .unwrap_or(false);
                if !is_bench {
                    continue;
                }
                let Some(name) = t.get("name").and_then(Value::as_str) else {
                    continue;
                };
                let registered = registered_by_pkg
                    .get(pkg_name)
                    .map(|r| r.iter().any(|n| n == name))
                    .unwrap_or(false);
                let src_path = t
                    .get("src_path")
                    .and_then(Value::as_str)
                    .map(PathBuf::from);
                let src = src_path
                    .as_ref()
                    .and_then(|p| fs::read_to_string(p).ok())
                    .unwrap_or_default();
                // Auto-discovered shared modules (no `fn main`) — e.g.
                // benches/helpers.rs — are not runnable benches; exclude them.
                if !registered && !src.contains("fn main") {
                    continue;
                }
                // harness=false shows up in metadata as test:false for bench targets.
                let harness = t.get("test").and_then(Value::as_bool).unwrap_or(true);
                let (throughput, black_box) = detect_metrics(&src);
                let path = match (&src_path, manifest_dir_by_pkg.get(pkg_name)) {
                    (Some(p), Some(dir)) => p
                        .strip_prefix(dir)
                        .map(|r| r.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| p.to_string_lossy().into_owned()),
                    (Some(p), None) => p.to_string_lossy().into_owned(),
                    _ => String::new(),
                };
                benches.push(serde_json::json!({
                    "name": name,
                    "crate": pkg_name,
                    "registered": registered,
                    "path": path,
                    "harness": harness,
                    "uses_throughput": throughput,
                    "uses_black_box": black_box,
                    "datasets": detect_datasets(&src),
                }));
            }
        }
    }
    benches.sort_by(|a, b| {
        let key = |v: &Value| {
            (
                v.get("crate").and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                v.get("name").and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            )
        };
        key(a).cmp(&key(b))
    });

    let index = serde_json::json!({
        "schema": INDEX_SCHEMA,
        "generated_at": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        "manifest": manifest.to_string_lossy(),
        "bench_count": benches.len(),
        "benches": benches,
    });

    if let Err(e) = fs::create_dir_all(out_dir) {
        eprintln!("cannot create {}: {e}", out_dir.display());
        return 1;
    }
    let out_path = out_dir.join("index.json");
    if let Err(e) = fs::write(
        &out_path,
        serde_json::to_string_pretty(&index).unwrap() + "\n",
    ) {
        eprintln!("cannot write {}: {e}", out_path.display());
        return 1;
    }

    let coverage_updated = regenerate_coverage(out_dir, &index);
    println!(
        "index: {} benches → {}{}",
        benches.len(),
        out_path.display(),
        if coverage_updated {
            format!(" + {}", out_dir.join("COVERAGE.md").display())
        } else {
            String::new()
        }
    );
    0
}

/// Metric column for the COVERAGE.md inventory: TP = uses Throughput, BB = uses
/// black_box, latency-only = neither.
fn metric_label(throughput: bool, black_box: bool) -> &'static str {
    match (throughput, black_box) {
        (true, true) => "TP + BB",
        (true, false) => "TP",
        (false, true) => "BB",
        (false, false) => "latency-only",
    }
}

/// Regenerate the per-bench inventory table in `<out_dir>/COVERAGE.md`: replace
/// everything from the `## Per-bench inventory` heading up to (not including)
/// `## Remaining gaps` with a generated table over the index's benches, and mark
/// the doc-status header as index-generated. Returns false (no change) when the
/// heading is absent — never fabricates a COVERAGE.md that does not exist.
fn regenerate_coverage(out_dir: &Path, index: &Value) -> bool {
    let cov_path = out_dir.join("COVERAGE.md");
    let Ok(existing) = fs::read_to_string(&cov_path) else {
        return false;
    };
    const HEADING: &str = "## Per-bench inventory";
    const NEXT: &str = "## Remaining gaps";
    let Some(hpos) = existing.find(HEADING) else {
        eprintln!("warning: {} has no \"{HEADING}\" heading — table not regenerated", cov_path.display());
        return false;
    };
    let tail_start = existing[hpos..]
        .find(NEXT)
        .map(|p| hpos + p)
        .unwrap_or(existing.len());

    let mut section = String::from(HEADING);
    section.push_str("\n\n<!-- GENERATED by `bench-tools index` — edit benches, not this table. -->\n\n");
    section.push_str(
        "Metric legend: **TP** = uses `criterion::Throughput`; **BB** = uses `black_box`;\n\
         **latency-only** = neither. Real data = grounds on `bench_data/` XES/OCEL fixtures\n\
         or `tests/fixtures/papers/*.json`.\n\n",
    );
    section.push_str("| Bench | Metric | Real data | Notes |\n|-------|--------|-----------|-------|\n");
    if let Some(rows) = index.get("benches").and_then(Value::as_array) {
        for b in rows {
            let name = b.get("name").and_then(Value::as_str).unwrap_or("?");
            let krate = b.get("crate").and_then(Value::as_str).unwrap_or("?");
            let throughput = b.get("uses_throughput").and_then(Value::as_bool).unwrap_or(false);
            let black_box = b.get("uses_black_box").and_then(Value::as_bool).unwrap_or(false);
            let registered = b.get("registered").and_then(Value::as_bool).unwrap_or(false);
            let datasets = b.get("datasets").and_then(Value::as_array);
            let real = match datasets {
                Some(d) if !d.is_empty() => "**yes**",
                _ => "synthetic",
            };
            let mut notes = vec![format!("generated (crate: {krate})")];
            if !registered {
                notes.push("auto-discovered".to_string());
            }
            if throughput && !black_box {
                notes.push("lacks `black_box` (gap)".to_string());
            }
            if !throughput && !black_box {
                notes.push("no TP/BB (gap)".to_string());
            }
            let _ = writeln!(
                section,
                "| {name} | {} | {real} | {} |",
                metric_label(throughput, black_box),
                notes.join("; ")
            );
        }
    }
    section.push('\n');

    let mut updated = String::with_capacity(existing.len() + section.len());
    updated.push_str(&existing[..hpos]);
    updated.push_str(&section);
    updated.push_str(&existing[tail_start..]);

    // Doc-status header: mark the file as index-generated (honest provenance).
    if let Some(rest) = updated.strip_prefix("<!--") {
        if let Some(end) = rest.find("-->") {
            let inner = &rest[..end];
            if !inner.contains("regenerated-by") {
                updated = format!("<!--{} regenerated-by: bench-tools index -->{}", inner.trim_end(), &rest[end + 3..]);
            }
        }
    }

    if let Err(e) = fs::write(&cov_path, updated) {
        eprintln!("warning: cannot write {}: {e}", cov_path.display());
        return false;
    }
    true
}

// --------------------------------------------------------------------------- arg parsing
fn flag_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
}

fn usage() -> i32 {
    eprintln!(
        "usage: bench-tools <report|regress|receipt|verify|ledger|attest|budget> [flags]\n\
         \n\
         report   --criterion-dir DIR  --out-dir DIR\n\
         regress  --criterion-dir DIR  --baseline FILE  --threshold PCT(=10)\n\
                  --min-coverage FRAC(=0.5, floor on compared/measured)\n\
         receipt  --criterion-dir DIR  --out FILE  --no-baseline  --print\n\
         verify   --receipt FILE       --allow-dirty\n\
         ledger   --bench SUBSTR        (chain integrity + per-bench trend)\n\
         attest   --criterion-dir DIR  --out-dir DIR  (correctness × performance)\n\
         index    --manifest FILE      --out-dir DIR (benchmark inventory: index.json\n\
                  + COVERAGE.md inventory table; auto-discovered module-only\n\
                  benches without `fn main` are excluded)\n\
         budget   --criterion-dir DIR  --budgets FILE (machine-independent SLOs;
                  exit 3 = skipped, no calibration anchor)"
    );
    2
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(sub) = args.first().cloned() else {
        std::process::exit(usage());
    };
    let rest = &args[1..];
    let criterion_dir = flag_value(rest, "--criterion-dir")
        .map(PathBuf::from)
        .unwrap_or_else(default_criterion_dir);

    let code = match sub.as_str() {
        "report" => {
            let out_dir = flag_value(rest, "--out-dir")
                .map(PathBuf::from)
                .unwrap_or_else(|| repo_root().join("docs").join("benchmarks"));
            cmd_report(&criterion_dir, &out_dir)
        }
        "regress" => {
            let baseline = flag_value(rest, "--baseline")
                .map(PathBuf::from)
                .unwrap_or_else(baseline_path);
            // E3: a threshold that failed to parse silently fell back to 10%,
            // so `--threshold 1O` (typo) gated at the default. Demand a real,
            // finite threshold in (0, 1000].
            let threshold = match flag_value(rest, "--threshold") {
                Some(s) => match s.parse::<f64>() {
                    Ok(t) if t.is_finite() && t > 0.0 && t <= 1000.0 => t,
                    _ => {
                        eprintln!(
                            "invalid --threshold {s:?}: must be a finite number in (0, 1000]"
                        );
                        std::process::exit(2);
                    }
                },
                None => 10.0,
            };
            let min_coverage = match flag_value(rest, "--min-coverage") {
                Some(s) => match s.parse::<f64>() {
                    Ok(c) if c.is_finite() && (0.0..=1.0).contains(&c) => c,
                    _ => {
                        eprintln!(
                            "invalid --min-coverage {s:?}: must be a finite fraction in [0, 1]"
                        );
                        std::process::exit(2);
                    }
                },
                None => 0.5,
            };
            cmd_regress(&criterion_dir, &baseline, threshold, min_coverage)
        }
        "receipt" => {
            let out = flag_value(rest, "--out").map(PathBuf::from);
            cmd_receipt(
                &criterion_dir,
                !has_flag(rest, "--no-baseline"),
                out.as_deref(),
                has_flag(rest, "--print"),
            )
        }
        "verify" => {
            let receipt = flag_value(rest, "--receipt")
                .map(PathBuf::from)
                .unwrap_or_else(baseline_path);
            cmd_verify(&receipt, has_flag(rest, "--allow-dirty"))
        }
        "ledger" => cmd_ledger(flag_value(rest, "--bench").as_deref()),
        "budget" => {
            let budgets = flag_value(rest, "--budgets")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    repo_root()
                        .join("docs")
                        .join("benchmarks")
                        .join("budgets.json")
                });
            cmd_budget(&criterion_dir, &budgets)
        }
        "attest" => {
            let out_dir = flag_value(rest, "--out-dir")
                .map(PathBuf::from)
                .unwrap_or_else(|| repo_root().join("docs").join("benchmarks"));
            cmd_attest(&criterion_dir, &out_dir)
        }
        "index" => {
            let manifest = flag_value(rest, "--manifest")
                .map(PathBuf::from)
                .unwrap_or_else(|| repo_root().join("Cargo.toml"));
            let out_dir = flag_value(rest, "--out-dir")
                .map(PathBuf::from)
                .unwrap_or_else(|| repo_root().join("docs").join("benchmarks"));
            cmd_index(&manifest, &out_dir)
        }
        "-h" | "--help" | "help" => usage(),
        other => {
            eprintln!("unknown subcommand: {other}");
            usage()
        }
    };
    std::process::exit(code);
}

// --------------------------------------------------------------------------- tests
// The benchmark governance tool gates the whole repo's performance — so its own
// decision logic is unit-tested. A gate that can't fail proves nothing.
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- canonicalization & hashing -------------------------------------
    #[test]
    fn canonicalize_sorts_object_keys() {
        let a = json!({"b": 1, "a": 2, "c": {"z": 1, "y": 2}});
        let b = json!({"c": {"y": 2, "z": 1}, "a": 2, "b": 1});
        // Different key order, same canonical form → same hash.
        assert_eq!(canonicalize(&a), canonicalize(&b));
        assert_eq!(blake3_hex(&canonicalize(&a)), blake3_hex(&canonicalize(&b)));
    }

    #[test]
    fn canonicalize_is_deterministic_and_order_sensitive_in_arrays() {
        let v = json!({"benchmarks": [{"bench": "x", "median_ns": 10.0}]});
        assert_eq!(canonicalize(&v), canonicalize(&v.clone()));
        // Array order is significant (it carries meaning); reordering changes the hash.
        let reordered = json!([2, 1]);
        let original = json!([1, 2]);
        assert_ne!(canonicalize(&reordered), canonicalize(&original));
    }

    #[test]
    fn receipt_hash_detects_tamper() {
        let body = json!({"benchmark_count": 2, "commit": "abc",
            "benchmarks": [{"bench": "a", "median_ns": 10.0}]});
        let h1 = blake3_hex(&canonicalize(&body));
        let mut tampered = body.clone();
        tampered["benchmarks"][0]["median_ns"] = json!(999.0);
        let h2 = blake3_hex(&canonicalize(&tampered));
        assert_ne!(h1, h2, "altering a median must change the receipt hash");
    }

    // ---- regression gate -------------------------------------------------
    #[test]
    fn regression_requires_threshold_crossing() {
        // +5% median, threshold 10% → not a regression even with disjoint CIs.
        assert!(!is_regression(
            105.0,
            Some(104.0),
            None,
            100.0,
            Some(101.0),
            10.0
        ));
    }

    #[test]
    fn regression_requires_ci_non_overlap() {
        // +20% median (clears 10% threshold) but CIs overlap → NOT flagged.
        // cur_ci_lower 90 is below base_ci_upper 130 → overlap.
        assert!(!is_regression(
            120.0,
            Some(90.0),
            None,
            100.0,
            Some(130.0),
            10.0
        ));
        // Same median shift but disjoint CIs (cur_lo 115 > base_hi 105) → flagged.
        assert!(is_regression(
            120.0,
            Some(115.0),
            None,
            100.0,
            Some(105.0),
            10.0
        ));
    }

    #[test]
    fn regression_falls_back_to_std_dev_without_ci() {
        // No CI data: +20% median, std_dev 2ns (2% noise) → distinguishable → flagged.
        assert!(is_regression(120.0, None, Some(2.0), 100.0, None, 10.0));
        // +20% median but std_dev 30ns (30% noise) > delta → within jitter → not flagged.
        assert!(!is_regression(120.0, None, Some(30.0), 100.0, None, 10.0));
    }

    #[test]
    fn regression_handles_degenerate_baseline() {
        assert!(!is_regression(
            100.0,
            Some(99.0),
            None,
            0.0,
            Some(0.0),
            10.0
        ));
    }

    // ---- cross-machine normalization ------------------------------------
    #[test]
    fn normalize_factor_cancels_machine_speed() {
        // Baseline machine's anchor 200ns, current machine 100ns → current is 2×
        // faster, so its latencies must be scaled UP by 2.0 to compare fairly.
        assert!((normalize_factor(Some(200.0), Some(100.0)) - 2.0).abs() < 1e-9);
        // Same speed → no-op.
        assert!((normalize_factor(Some(100.0), Some(100.0)) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn normalize_factor_degrades_to_identity() {
        assert_eq!(normalize_factor(None, Some(100.0)), 1.0);
        assert_eq!(normalize_factor(Some(100.0), None), 1.0);
        assert_eq!(normalize_factor(Some(0.0), Some(100.0)), 1.0);
        assert_eq!(normalize_factor(Some(100.0), Some(0.0)), 1.0);
    }

    #[test]
    fn normalization_prevents_phantom_regression() {
        // Current machine is 2× slower (anchor 200 vs baseline 100): a breed at
        // 2000ns here equals 1000ns on the baseline machine. Un-normalized that
        // looks like a +100% regression; normalized (×0.5) it is flat.
        let factor = normalize_factor(Some(100.0), Some(200.0)); // 0.5
        let normalized_median = 2000.0 * factor; // 1000
        assert!(!is_regression(
            normalized_median,
            Some(990.0 * factor),
            None,
            1000.0,
            Some(1010.0),
            10.0
        ));
        // Without normalization it would be flagged.
        assert!(is_regression(
            2000.0,
            Some(1980.0),
            None,
            1000.0,
            Some(1010.0),
            10.0
        ));
    }

    #[test]
    fn calibration_id_recognized() {
        assert!(is_calibration_id("calibration/anchor"));
        assert!(!is_calibration_id("breed_latency/mycin"));
        // E4: exact match — substrings and neighbors are real workloads.
        assert!(!is_calibration_id("calibration/anchor_v2"));
        assert!(!is_calibration_id("bench_calibration/anchor"));
        assert!(!is_calibration_id("xcalibration/anchor"));
        assert!(!is_calibration_id("calibration"));
    }

    #[test]
    fn scope_matches_on_path_boundary() {
        // E5: == or starts_with(key + "/").
        assert!(scope_matches("breed_latency", "breed_latency"));
        assert!(scope_matches("breed_latency", "breed_latency/mycin"));
        assert!(!scope_matches("breed_latency", "breed_latency_v2/mycin"));
        assert!(!scope_matches("latency", "breed_latency/mycin"));
    }

    #[test]
    fn budget_lookup_path_boundary_and_empty_key() {
        let mut ov = BTreeMap::new();
        ov.insert("breed_latency".to_string(), 100.0);
        // An override for `breed_latency` must NOT capture a sibling family
        // whose id merely contains it as a substring.
        assert_eq!(
            budget_for_scoped("breed_latency_v2/wat", 1000.0, &ov, ""),
            None
        );
        // An empty override key matches nothing (cmd_budget rejects it outright).
        ov.insert(String::new(), 5.0);
        assert_eq!(budget_for_scoped("anything/here", 1000.0, &ov, ""), None);
    }

    // ---- E8: RFC4180 CSV escaping ---------------------------------------
    #[test]
    fn csv_field_escapes_specials() {
        assert_eq!(csv_field("plain/bench"), "plain/bench");
        assert_eq!(csv_field("a,b"), "\"a,b\"");
        assert_eq!(csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
        assert_eq!(csv_field("line\nbreak"), "\"line\nbreak\"");
    }

    // ---- E2: shared receipt hash recompute ------------------------------
    #[test]
    fn recompute_receipt_hash_matches_blake3_body() {
        let mut receipt = json!({
            "receipt_schema": RECEIPT_SCHEMA,
            "benchmarks": [{"bench": "a", "median_ns": 10.0}],
        });
        let body = receipt.clone();
        receipt["hash_algorithm"] = json!("BLAKE3");
        receipt["receipt_hash"] = json!(blake3_hex(&canonicalize(&body)));
        assert_eq!(
            recompute_receipt_hash(&receipt).as_deref(),
            receipt.get("receipt_hash").and_then(Value::as_str)
        );
        // Tampered median no longer matches.
        let mut bad = receipt.clone();
        bad["benchmarks"][0]["median_ns"] = json!(11.0);
        assert_ne!(
            recompute_receipt_hash(&bad).as_deref(),
            receipt.get("receipt_hash").and_then(Value::as_str)
        );
        // Missing hash field → None.
        assert_eq!(recompute_receipt_hash(&json!({"a": 1})), None);
    }

    // ---- E7: ledger anchor rule -----------------------------------------
    #[test]
    fn ledger_anchor_matches_position_and_head() {
        let entries = vec![
            json!({"receipt_hash": "h1"}),
            json!({"receipt_hash": "h2"}),
        ];
        assert!(ledger_anchor_matches(&entries, 2, "h2"));
        assert!(ledger_anchor_matches(&entries, 1, "h1"));
        assert!(ledger_anchor_matches(&entries, 0, "anything"));
        // Wrong head at the anchored position.
        assert!(!ledger_anchor_matches(&entries, 2, "h1"));
        // Truncated ledger (position gone).
        assert!(!ledger_anchor_matches(&entries, 3, "h1"));
        assert!(ledger_anchor_matches(&[], 1, "h1") == false);
    }

    // ---- E6: cargo test result parsing ----------------------------------
    #[test]
    fn parse_test_result_sums_pass_and_fail() {
        let out = "running 3 tests\n\
                   test a ... ok\n\
                   test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured\n\n\
                   running 1 test\n\
                   test result: FAILED. 0 passed; 1 failed; 0 ignored\n";
        assert_eq!(parse_test_result(out), (2, 1));
    }

    #[test]
    fn parse_test_result_zero_tests_is_not_a_pass() {
        // The exact lie the old `contains("test result: ok")` accepted.
        let out = "running 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored\n";
        let (passed, failed) = parse_test_result(out);
        assert_eq!((passed, failed), (0, 0));
        assert!(
            !(failed == 0 && passed > 0),
            "a 0-test run must not read as a passing suite"
        );
    }

    #[test]
    fn budget_lookup_prefers_most_specific_override() {
        let mut ov = BTreeMap::new();
        ov.insert("breed_latency".to_string(), 100.0);
        ov.insert("breed_latency/mycin".to_string(), 50.0);
        // Longest matching key wins.
        assert_eq!(
            budget_for_scoped("breed_latency/mycin", 1000.0, &ov, "breed_latency"),
            Some(50.0)
        );
        // Shorter prefix match for a different breed.
        assert_eq!(
            budget_for_scoped("breed_latency/soar", 1000.0, &ov, "breed_latency"),
            Some(100.0)
        );
        // In scope, no override → default.
        assert_eq!(
            budget_for_scoped("breed_latency/unlisted", 1000.0, &BTreeMap::new(), "breed_latency"),
            Some(1000.0)
        );
        // In scope but a partial override key matches → override wins over default.
        assert_eq!(
            budget_for_scoped("breed_latency/other", 1000.0, &ov, "breed_latency"),
            Some(100.0)
        );
        // Out of scope, no override → not budgeted (D5).
        assert_eq!(
            budget_for_scoped("conformance/parse", 1000.0, &ov, "breed_latency"),
            None
        );
        // Empty scope → default never applies (explicit override still wins).
        assert_eq!(
            budget_for_scoped("breed_latency/other", 1000.0, &ov, ""),
            Some(100.0)
        );
        assert_eq!(
            budget_for_scoped("breed_latency/unlisted", 1000.0, &BTreeMap::new(), ""),
            None
        );
    }

    // ---- schema guard (D4/D6/D7) ----------------------------------------
    #[test]
    fn schema_guard_accepts_bench_tools_receipt() {
        let v = json!({
            "receipt_schema": RECEIPT_SCHEMA,
            "receipt_hash": "ab",
            "benchmarks": [{"bench": "breed_latency/mycin", "median_ns": 1.0}],
        });
        assert!(validate_receipt_schema(&v).is_ok());
    }

    #[test]
    fn schema_guard_rejects_determinism_suite_report() {
        // The exact shape found in .wasm4pm/benchmarks/regression-*.json.
        let v = json!({
            "schema_version": "1.0",
            "timestamp_unix": 1786130575,
            "overall_status": "PASS",
            "vectors": [{"id": "guard-01", "pass": true}],
        });
        assert!(validate_receipt_schema(&v).is_err());
    }

    #[test]
    fn schema_guard_rejects_missing_or_empty_benchmarks() {
        assert!(validate_receipt_schema(&json!({ "receipt_schema": RECEIPT_SCHEMA })).is_err());
        assert!(validate_receipt_schema(&json!({
            "receipt_schema": RECEIPT_SCHEMA, "benchmarks": []
        }))
        .is_err());
    }

    // ---- ledger chain integrity -----------------------------------------
    #[test]
    fn chain_breaks_zero_for_valid_chain() {
        let entries = vec![
            json!({"receipt_hash": "h1", "previous_receipt_hash": null}),
            json!({"receipt_hash": "h2", "previous_receipt_hash": "h1"}),
            json!({"receipt_hash": "h3", "previous_receipt_hash": "h2"}),
        ];
        assert_eq!(chain_breaks(&entries), 0);
    }

    #[test]
    fn chain_breaks_detects_altered_link() {
        let entries = vec![
            json!({"receipt_hash": "h1", "previous_receipt_hash": null}),
            json!({"receipt_hash": "h2", "previous_receipt_hash": "WRONG"}),
            json!({"receipt_hash": "h3", "previous_receipt_hash": "h2"}),
        ];
        assert_eq!(chain_breaks(&entries), 1);
    }

    #[test]
    fn chain_breaks_empty_and_single() {
        assert_eq!(chain_breaks(&[]), 0);
        assert_eq!(chain_breaks(&[json!({"receipt_hash": "h1"})]), 0);
    }

    // ---- time formatting -------------------------------------------------
    #[test]
    fn fmt_time_scales_units() {
        assert!(fmt_time(1_500_000_000.0).ends_with(" s"));
        assert!(fmt_time(1_500_000.0).ends_with(" ms"));
        assert!(fmt_time(1_500.0).ends_with(" µs"));
        assert!(fmt_time(500.0).ends_with(" ns"));
    }

    // ---- index: registration / metric / dataset detection ---------------
    #[test]
    fn registered_benches_parsed_from_manifest_text() {
        let toml = "\
[package]\nname = \"x\"\n\
[[bench]]\nname = \"alpha\"\nharness = false\n\n\
[[bench]]\nname = \"beta\"\nharness = false\n\n\
[dev-dependencies]\ncriterion = \"0.5\"\n";
        let names = parse_registered_benches(toml);
        assert!(names.contains(&"alpha".to_string()));
        assert!(names.contains(&"beta".to_string()));
        assert_eq!(names.len(), 2, "non-bench sections must not leak in");
    }

    #[test]
    fn registered_benches_empty_without_bench_sections() {
        assert!(parse_registered_benches("[package]\nname = \"x\"\n").is_empty());
    }

    #[test]
    fn metrics_and_datasets_detected() {
        let grounded = "use criterion::{criterion_group, Throughput, black_box};\
                        let p = Path::new(\"bench_data/sepsis.xes\");";
        assert_eq!(detect_metrics(grounded), (true, true));
        assert_eq!(detect_datasets(grounded), vec!["bench_data/"]);
        let bare = "fn main() { println!(\"latency\"); }";
        assert_eq!(detect_metrics(bare), (false, false));
        assert!(detect_datasets(bare).is_empty());
    }

    #[test]
    fn metric_label_combinations() {
        assert_eq!(metric_label(true, true), "TP + BB");
        assert_eq!(metric_label(true, false), "TP");
        assert_eq!(metric_label(false, true), "BB");
        assert_eq!(metric_label(false, false), "latency-only");
    }
}
