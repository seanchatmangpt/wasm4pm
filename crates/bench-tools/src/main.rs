//! bench-tools — `cargo`-native benchmark governance for wasm4pm.
//!
//! One binary, three subcommands, replacing the former `scripts/bench_*.py`:
//!
//!   bench-tools report   — walk Criterion output → docs/benchmarks/REPORT.md + report.csv
//!   bench-tools regress  — compare current Criterion medians against a saved baseline,
//!                          exit 1 on any regression beyond a threshold
//!   bench-tools receipt  — emit a BLAKE3 performance receipt (environment + results +
//!                          lineage), and update the CI baseline at
//!                          .wasm4pm/benchmarks/baselines/main-latest.json
//!
//! Why Rust, not Python: the bench toolchain stays inside `cargo` (no interpreter
//! dependency for CI), and the receipt uses *real* BLAKE3 — the same algorithm the
//! execution receipts use — so a benchmark receipt chains exactly like any other
//! Wasm4pm receipt instead of falling back to a different hash.
//!
//! Exit codes: 0 ok · 1 nothing to measure / regression detected · 2 bad arguments.

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
    let base: BTreeMap<String, f64> = base_json
        .get("benchmarks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|b| {
                    Some((b.get("bench")?.as_str()?.to_string(), b.get("median_ns")?.as_f64()?))
                })
                .collect()
        })
        .unwrap_or_default();

    let mut regressions = Vec::new();
    let mut compared = 0;
    for r in &current {
        if let Some(&base_median) = base.get(&r.bench) {
            compared += 1;
            let delta_pct = (r.median_ns - base_median) / base_median * 100.0;
            // Only count a regression if it also exceeds measurement noise
            // (std_dev): a change within one std-dev is indistinguishable from jitter.
            let noise_pct = r.std_dev_ns.map(|s| s / base_median * 100.0).unwrap_or(0.0);
            if delta_pct > threshold_pct && delta_pct > noise_pct {
                regressions.push((r.bench.clone(), base_median, r.median_ns, delta_pct));
            }
        }
    }

    println!(
        "regress: compared {compared}/{} benches against baseline (threshold {threshold_pct:.1}%)",
        current.len()
    );
    if regressions.is_empty() {
        println!("no regressions beyond threshold");
        return 0;
    }
    eprintln!("REGRESSIONS ({}):", regressions.len());
    for (bench, base, now, pct) in &regressions {
        eprintln!("  {bench}: {} → {} (+{pct:.1}%)", fmt_time(*base), fmt_time(*now));
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

// --------------------------------------------------------------------------- arg parsing
fn flag_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
}

fn usage() -> i32 {
    eprintln!(
        "usage: bench-tools <report|regress|receipt> [flags]\n\
         \n\
         report   --criterion-dir DIR  --out-dir DIR\n\
         regress  --criterion-dir DIR  --baseline FILE  --threshold PCT(=10)\n\
         receipt  --criterion-dir DIR  --out FILE  --no-baseline  --print"
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
        "-h" | "--help" | "help" => usage(),
        other => {
            eprintln!("unknown subcommand: {other}");
            usage()
        }
    };
    std::process::exit(code);
}
