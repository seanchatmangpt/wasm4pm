#!/usr/bin/env python3
import json
import os
import sys
import glob
from datetime import datetime
from pathlib import Path

# Paths
REPO_ROOT = Path(__file__).parent.parent.parent
CRITERION_DIR = REPO_ROOT / "target" / "criterion"
WASM_RESULTS_DIR = REPO_ROOT / "results"
TRENDS_FILE = REPO_ROOT / ".wasm4pm" / "benchmarks" / "trends.json"
BASELINES_DIR = REPO_ROOT / ".wasm4pm" / "benchmarks" / "baselines"

def get_latest_wasm_results():
    files = glob.glob(str(WASM_RESULTS_DIR / "wasm_bench_*.json"))
    # Filter out profiles.json
    files = [f for f in files if "profiles" not in f]
    if not files:
        return None
    latest_file = max(files, key=os.path.getmtime)
    with open(latest_file) as f:
        return json.load(f)

def get_criterion_results():
    results = []
    if not CRITERION_DIR.exists():
        return results
    
    for estimates_path in CRITERION_DIR.glob("**/new/estimates.json"):
        rel_path = estimates_path.relative_to(CRITERION_DIR)
        rel_parts = rel_path.parts
        
        if len(rel_parts) >= 4:
            group = rel_parts[0]
            name = rel_parts[1]
            size = rel_parts[2]
            
            with open(estimates_path) as f:
                data = json.load(f)
                median_ns = data.get("median", {}).get("point_estimate", 0)
                results.append({
                    "backend": "native",
                    "group": group,
                    "algorithm": f"{group}/{name}",
                    "size": int(size) if size.isdigit() else size,
                    "median_ms": median_ns / 1_000_000.0,
                    "p95_ms": data.get("std_dev", {}).get("point_estimate", 0) * 1.96 / 1_000_000.0 + (median_ns / 1_000_000.0)
                })
    return results

def get_merged_results():
    native = get_criterion_results()
    wasm_raw = get_latest_wasm_results()
    wasm = []
    
    if wasm_raw and "results" in wasm_raw:
        for r in wasm_raw["results"]:
            wasm.append({
                "backend": "wasm",
                "group": "wasm_pool",
                "algorithm": r["algorithm"],
                "size": r["size"],
                "median_ms": r["medianMs"],
                "p95_ms": r["p95Ms"]
            })
            
    return native + wasm

def update_trends(results):
    if not TRENDS_FILE.exists():
        trends = {"metadata": {"version": "1.0.0"}, "data_points": []}
    else:
        with open(TRENDS_FILE) as f:
            trends = json.load(f)
            
    timestamp = datetime.utcnow().isoformat() + "Z"
    git_hash = os.popen("git rev-parse --short HEAD").read().strip()
    
    for r in results:
        trends["data_points"].append({
            "timestamp": timestamp,
            "git_commit": git_hash,
            "backend": r["backend"],
            "algorithm": r["algorithm"],
            "size": r["size"],
            "metrics": {
                "median_ms": r["median_ms"],
                "p95_ms": r["p95_ms"]
            }
        })
        
    trends["data_points"] = trends["data_points"][-2000:]
    with open(TRENDS_FILE, "w") as f:
        json.dump(trends, f, indent=2)

def load_latest_baseline():
    latest_link = BASELINES_DIR / "main-latest.json"
    if not latest_link.exists():
        return None
    with open(latest_link) as f:
        return json.load(f)

def generate_sparkline(history):
    if not history: return ""
    chars = " ▂▃▄▅▆▇█"
    min_val = min(history)
    max_val = max(history)
    if min_val == max_val: return chars[4] * len(history)
    
    line = ""
    for v in history:
        idx = int((v - min_val) / (max_val - min_val) * (len(chars) - 1))
        line += chars[idx]
    return line

def get_algorithm_history(backend, algorithm, size):
    if not TRENDS_FILE.exists(): return []
    with open(TRENDS_FILE) as f:
        trends = json.load(f)
    
    history = []
    for p in trends.get("data_points", []):
        if p["backend"] == backend and p["algorithm"] == algorithm and p["size"] == size:
            history.append(p["metrics"]["median_ms"])
    return history

# Performance Budgets (Max median ms allowed per size)
PERFORMANCE_BUDGETS = {
    "native": {
        "100": 1.0,
        "1000": 5.0,
        "10000": 50.0,
        "50000": 500.0
    },
    "wasm": {
        "100": 5.0,
        "1000": 20.0,
        "10000": 100.0,
        "50000": 1000.0
    }
}

def check_budget(backend, size, median_ms):
    budget = PERFORMANCE_BUDGETS.get(backend, {}).get(str(size))
    if not budget: return True, None
    return median_ms <= budget, budget

def generate_report(results, baseline_data=None):
    print("# Unified Performance Report")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    baseline_map = {}
    if baseline_data:
        for b in baseline_data.get("benchmarks", []):
            key = (b["backend"], b["algorithm"], b["size"])
            baseline_map[key] = b["median_ms"]

    print("\n## Results Summary")
    print("| Backend | Algorithm | Size | Median ms | Delta % | Budget | Trend | Status |")
    print("|---------|-----------|------|-----------|---------|--------|-------|--------|")
    
    sorted_results = sorted(results, key=lambda x: (x["backend"], x["algorithm"], str(x["size"])))
    
    regressions = 0
    budget_violations = 0
    
    for r in sorted_results:
        key = (r["backend"], r["algorithm"], r["size"])
        baseline_median = baseline_map.get(key)
        
        delta_str = "N/A"
        status = "✅"
        
        # Regression check
        if baseline_median:
            delta = (r["median_ms"] - baseline_median) / baseline_median * 100
            delta_str = f"{delta:+.1f}%"
            if delta > 5.0:
                status = "❌"
                regressions += 1
            elif delta > 2.0:
                status = "⚠️"
        
        # Budget check
        within_budget, budget_val = check_budget(r["backend"], r["size"], r["median_ms"])
        budget_str = f"{budget_val:.1f}ms" if budget_val else "N/A"
        if not within_budget:
            status = "🚨"
            budget_violations += 1
        
        history = get_algorithm_history(r["backend"], r["algorithm"], r["size"])
        sparkline = generate_sparkline(history[-10:])
        
        print(f"| {r['backend']} | {r['algorithm']} | {r['size']} | {r['median_ms']:.3f} | {delta_str} | {budget_str} | `{sparkline}` | {status} |")

    if regressions > 0 or budget_violations > 0:
        print(f"\n**ATTENTION**: {regressions} regressions, {budget_violations} budget violations!")
        return False
    return True

def save_baseline(results):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    git_hash = os.popen("git rev-parse --short HEAD").read().strip()
    
    baseline = {
        "baseline_info": {
            "timestamp": timestamp,
            "git_hash": git_hash,
            "generated_at": datetime.utcnow().isoformat() + "Z"
        },
        "benchmarks": results
    }
    
    filename = f"main-{timestamp}.json"
    filepath = BASELINES_DIR / filename
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, "w") as f:
        json.dump(baseline, f, indent=2)
        
    latest_link = BASELINES_DIR / "main-latest.json"
    if latest_link.exists():
        latest_link.unlink()
    os.symlink(filename, latest_link)
    print(f"\nBaseline saved to {filepath}")

def main():
    results = get_merged_results()
    if not results:
        print("No results found. Run benchmarks first.")
        sys.exit(1)
        
    update_trends(results)
    
    baseline = None
    if "--compare" in sys.argv:
        baseline = load_latest_baseline()
        
    success = generate_report(results, baseline)
    
    if "--update-baseline" in sys.argv:
        save_baseline(results)
        
    if not success and "--compare" in sys.argv:
        sys.exit(1)

if __name__ == "__main__":
    main()
