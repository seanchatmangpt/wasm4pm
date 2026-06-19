//! bench-tools — `cargo`-native benchmark governance for wasm4pm.
//!
//! One binary, the full Fortune-grade measurement pipeline (replacing the former
//! `scripts/bench_*.py`):
//!
//!   report   — walk Criterion output → docs/benchmarks/REPORT.md + report.csv
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
//! failure · 2 bad arguments.

use std::collections::BTreeMap;
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
            && path.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()) == Some("new")
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
    let lo = ci.and_then(|c| c.get("lower_bound")).and_then(Value::as_f64);
    let hi = ci.and_then(|c| c.get("upper_bound")).and_then(Value::as_f64);
    let std_dev = data
        .get("std_dev")
        .and_then(|s| s.get("point_estimate"))
        .and_then(Value::as_f64);
    // bench id = <new-dir>.parent relative to root
    let bench_dir = path.parent()?.parent()?;
    let bench = bench_dir.strip_prefix(root).ok()?.to_string_lossy().replace('\\', "/");
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
                .map(|(k, val)| format!("{}:{}", serde_json::to_string(k).unwrap(), canonicalize(val)))
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

/// Count breaks in a receipt-chain ledger: each entry's `previous_receipt_hash`
/// must equal the prior entry's `receipt_hash`. Pure over parsed entries so the
/// chain-integrity logic can be unit-tested without touching the filesystem.
fn chain_breaks(entries: &[Value]) -> usize {
    let mut breaks = 0;
    for i in 1..entries.len() {
        let prev_hash = entries[i - 1].get("receipt_hash").and_then(Value::as_str);
        let claimed = entries[i].get("previous_receipt_hash").and_then(Value::as_str);
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
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(0);
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
    md.push_str(&format!(
        "Generated by `bench-tools report` from `{}`.\n\n",
        criterion_dir.display()
    ));
    md.push_str("| Benchmark | Median | 95% CI |\n|---|---:|---:|\n");
    for r in &rows {
        let ci = match (r.ci_lower_ns, r.ci_upper_ns) {
            (Some(lo), Some(hi)) => format!("[{}, {}]", fmt_time(lo), fmt_time(hi)),
            _ => "—".to_string(),
        };
        md.push_str(&format!("| `{}` | {} | {} |\n", r.bench, fmt_time(r.median_ns), ci));
    }
    let report_md = out_dir.join("REPORT.md");
    if let Err(e) = fs::write(&report_md, md) {
        eprintln!("cannot write {}: {e}", report_md.display());
        return 1;
    }

    // CSV
    let mut csv = String::from("bench,median_ns,ci_lower_ns,ci_upper_ns,std_dev_ns\n");
    for r in &rows {
        csv.push_str(&format!(
            "{},{},{},{},{}\n",
            r.bench,
            r.median_ns,
            r.ci_lower_ns.map(|v| v.to_string()).unwrap_or_default(),
            r.ci_upper_ns.map(|v| v.to_string()).unwrap_or_default(),
            r.std_dev_ns.map(|v| v.to_string()).unwrap_or_default(),
        ));
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
fn cmd_regress(criterion_dir: &Path, baseline: &Path, threshold_pct: f64) -> i32 {
    let current = collect(criterion_dir);
    if current.is_empty() {
        eprintln!("no current estimates under {}", criterion_dir.display());
        return 1;
    }
    let base_json: Value = match fs::read_to_string(baseline).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        Some(v) => v,
        None => {
            eprintln!("no readable baseline at {} — run `bench-tools receipt` first", baseline.display());
            return 1;
        }
    };
    // Baseline keyed by bench id → (median, ci_lower, ci_upper). Carrying the
    // confidence interval lets the gate distinguish a real shift from noise.
    let base: BTreeMap<String, (f64, Option<f64>, Option<f64>)> = base_json
        .get("benchmarks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|b| {
                    Some((
                        b.get("bench")?.as_str()?.to_string(),
                        (
                            b.get("median_ns")?.as_f64()?,
                            b.get("ci_lower_ns").and_then(Value::as_f64),
                            b.get("ci_upper_ns").and_then(Value::as_f64),
                        ),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();

    let mut regressions = Vec::new();
    let mut compared = 0;
    for r in &current {
        if let Some(&(base_median, _base_ci_lo, base_ci_hi)) = base.get(&r.bench) {
            compared += 1;
            if is_regression(
                r.median_ns,
                r.ci_lower_ns,
                r.std_dev_ns,
                base_median,
                base_ci_hi,
                threshold_pct,
            ) {
                let delta_pct = (r.median_ns - base_median) / base_median * 100.0;
                regressions.push((r.bench.clone(), base_median, r.median_ns, delta_pct));
            }
        }
    }

    println!(
        "regress: compared {compared}/{} benches against baseline \
         (threshold {threshold_pct:.1}%, 95% CI non-overlap required)",
        current.len()
    );
    if regressions.is_empty() {
        println!("no statistically-distinguishable regressions beyond threshold");
        return 0;
    }
    eprintln!("REGRESSIONS ({}):", regressions.len());
    for (bench, base, now, pct) in &regressions {
        eprintln!("  {bench}: {} → {} (+{pct:.1}%, CIs disjoint)", fmt_time(*base), fmt_time(*now));
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
        fs::read_to_string(baseline_path())
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v.get("receipt_hash").and_then(Value::as_str).map(str::to_string))
    } else {
        None
    };

    let dirty = git_field(&["status", "--porcelain"]).map(|s| !s.is_empty());
    let created_at = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    // Body WITHOUT the hash fields (the hash cannot reference itself).
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
        "benchmark_count": rows.len(),
        "benchmarks": estimates_to_json(&rows),
        "previous_receipt_hash": previous_hash,
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
            eprintln!("receipt has no receipt_hash field: {}", receipt_path.display());
            return 1;
        }
    };

    // Rebuild the hashed body: strip the two fields that the hash cannot cover.
    let mut body = receipt.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.remove("receipt_hash");
        obj.remove("hash_algorithm");
    }
    let recomputed = blake3_hex(&canonicalize(&body));

    let count = receipt.get("benchmark_count").and_then(Value::as_u64).unwrap_or(0);
    let commit = receipt
        .get("commit")
        .and_then(Value::as_str)
        .map(|c| &c[..8.min(c.len())])
        .unwrap_or("?");
    let dirty = receipt.get("tree_dirty").and_then(Value::as_bool).unwrap_or(false);

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
            eprintln!("no ledger at {} — run `bench-tools receipt` to seed it", lp.display());
            return 1;
        }
    };
    let entries: Vec<Value> = text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    if entries.is_empty() {
        eprintln!("ledger {} has no parseable entries", lp.display());
        return 1;
    }

    // 1. Chain integrity: entry[i].previous_receipt_hash must link to entry[i-1].
    let breaks = chain_breaks(&entries);
    for i in 1..entries.len() {
        let prev_hash = entries[i - 1].get("receipt_hash").and_then(Value::as_str);
        let claimed = entries[i].get("previous_receipt_hash").and_then(Value::as_str);
        if claimed != prev_hash {
            eprintln!(
                "  chain break at entry {i}: previous_receipt_hash {:?} != prior receipt_hash {:?}",
                claimed.map(|s| &s[..8.min(s.len())]),
                prev_hash.map(|s| &s[..8.min(s.len())]),
            );
        }
    }

    // 2. Per-bench trend: first vs last recorded median.
    let first = &entries[0]["medians_ns"];
    let last = &entries[entries.len() - 1]["medians_ns"];
    let mut bench_names: Vec<&String> = last.as_object().map(|o| o.keys().collect()).unwrap_or_default();
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
                let pct = if fv != 0.0 { (lv - fv) / fv * 100.0 } else { 0.0 };
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
        &["test", "-p", "wasm4pm-cognition", "--test", "paper_grounded"],
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
                if rest.contains("_paper_grounded") && (rest.contains(" ... ok") || rest.contains(" ... FAILED")) {
                    grounded.insert(name.to_string(), rest.contains(" ... ok"));
                }
            }
        }
    }

    // 2. Falsification gate — a single aggregate suite over all fixtures.
    println!("running falsification gate (cargo test --test paper_falsification)…");
    let fals_out = run_capture(
        "cargo",
        &["test", "-p", "wasm4pm-cognition", "--test", "paper_falsification"],
    );
    let falsification_pass = fals_out
        .as_deref()
        .map(|o| o.contains("test result: ok"))
        .unwrap_or(false);

    // 3. Benchmark latency per breed (strip the "breed_latency/" group prefix).
    let medians: BTreeMap<String, f64> = collect(criterion_dir)
        .into_iter()
        .filter_map(|e| {
            e.bench
                .rsplit('/')
                .next()
                .map(|b| (b.to_string(), e.median_ns))
        })
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
    md.push_str(&format!(
        "Falsification suite (confirm + reject mutants): **{}**\n\n",
        if falsification_pass { "PASS" } else { "FAIL" }
    ));
    md.push_str("| Breed | Paper-grounded | Latency | Verdict |\n|---|:--:|---:|---|\n");
    for (breed, &ok) in &grounded {
        let lat = medians.get(breed).copied();
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
        md.push_str(&format!(
            "| `{breed}` | {} | {lat_str} | {verdict} |\n",
            if ok { "✓" } else { "✗" }
        ));
    }
    md.push_str(&format!(
        "\n**{} trusted · {} fast-but-wrong · {} correct-unbenched · {} broken** \
         (of {} breeds).\n\nA *trusted* latency is one whose breed provably reproduces \
         its source paper. A *fast-but-wrong* breed is the one a latency benchmark \
         alone would silently bless.\n",
        trusted, fast_but_wrong, correct_unbenched, broken, grounded.len()
    ));

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

// --------------------------------------------------------------------------- arg parsing
fn flag_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
}

fn usage() -> i32 {
    eprintln!(
        "usage: bench-tools <report|regress|receipt|verify|ledger|attest> [flags]\n\
         \n\
         report   --criterion-dir DIR  --out-dir DIR\n\
         regress  --criterion-dir DIR  --baseline FILE  --threshold PCT(=10)\n\
         receipt  --criterion-dir DIR  --out FILE  --no-baseline  --print\n\
         verify   --receipt FILE       --allow-dirty\n\
         ledger   --bench SUBSTR        (chain integrity + per-bench trend)\n\
         attest   --criterion-dir DIR  --out-dir DIR  (correctness × performance)"
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
            let baseline = flag_value(rest, "--baseline").map(PathBuf::from).unwrap_or_else(baseline_path);
            let threshold = flag_value(rest, "--threshold")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(10.0);
            cmd_regress(&criterion_dir, &baseline, threshold)
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
            let receipt = flag_value(rest, "--receipt").map(PathBuf::from).unwrap_or_else(baseline_path);
            cmd_verify(&receipt, has_flag(rest, "--allow-dirty"))
        }
        "ledger" => cmd_ledger(flag_value(rest, "--bench").as_deref()),
        "attest" => {
            let out_dir = flag_value(rest, "--out-dir")
                .map(PathBuf::from)
                .unwrap_or_else(|| repo_root().join("docs").join("benchmarks"));
            cmd_attest(&criterion_dir, &out_dir)
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
        assert!(!is_regression(105.0, Some(104.0), None, 100.0, Some(101.0), 10.0));
    }

    #[test]
    fn regression_requires_ci_non_overlap() {
        // +20% median (clears 10% threshold) but CIs overlap → NOT flagged.
        // cur_ci_lower 90 is below base_ci_upper 130 → overlap.
        assert!(!is_regression(120.0, Some(90.0), None, 100.0, Some(130.0), 10.0));
        // Same median shift but disjoint CIs (cur_lo 115 > base_hi 105) → flagged.
        assert!(is_regression(120.0, Some(115.0), None, 100.0, Some(105.0), 10.0));
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
        assert!(!is_regression(100.0, Some(99.0), None, 0.0, Some(0.0), 10.0));
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
}
