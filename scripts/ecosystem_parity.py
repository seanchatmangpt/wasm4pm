#!/usr/bin/env python3
import json
import os
import time
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
BENCH_DATA = REPO_ROOT / "bench_data"
RESULTS_FILE = REPO_ROOT / "docs" / "REAL-BENCHMARK-RESULTS.md"

def run_wasm4pm_bench(log_path):
    print(f"Benchmarking wasm4pm on {log_path.name}...")
    # Use wasm4pm (wpm) run for a real-world benchmark
    cmd = [
        "node", str(REPO_ROOT / "apps/wasm4pm/dist/bin/wpm.js"),
        "run", str(log_path),
        "--no-save", "--format", "json", "--algorithm", "heuristic"
    ]
    
    start = time.perf_counter()
    result = subprocess.run(cmd, capture_output=True, text=True)
    end = time.perf_counter()
    
    if result.returncode != 0:
        print(f"Error running wasm4pm: {result.stderr}")
        return None
    
    data = json.loads(result.stdout)
    return {
        "duration_sec": end - start,
        "nodes": data.get("model", {}).get("nodes", 0),
        "edges": data.get("model", {}).get("edges", 0)
    }

def run_pm4py_bench(log_path):
    try:
        import pm4py
        from pm4py.algo.discovery.heuristics import algorithm as heuristics_miner
        print(f"Benchmarking pm4py on {log_path.name}...")
        
        start = time.perf_counter()
        log = pm4py.read_xes(str(log_path))
        heuristics_miner.apply(log)
        end = time.perf_counter()
        
        return {
            "duration_sec": end - start
        }
    except ImportError:
        print("pm4py not available, skipping.")
        return None

def main():
    # Ensure wasm4pm is built
    subprocess.run(["cd apps/wasm4pm && pnpm run build"], shell=True, capture_output=True)
    
    # Try to find a large log (BPI 2012 or 2017)
    logs = list(BENCH_DATA.glob("*.xes"))
    if not logs:
        print("No XES logs found in bench_data. Run scripts/download_datasets.sh first.")
        return

    # Filter for large logs or just use the largest available
    logs.sort(key=lambda p: p.stat().st_size, reverse=True)
    target_log = logs[0]
    
    wasm_res = run_wasm4pm_bench(target_log)
    pm4py_res = run_pm4py_bench(target_log)
    
    report = f"""# Ecosystem Parity & Scale Results

| Metric | wasm4pm (Node/WASM) | pm4py (Python) |
|--------|---------------------|----------------|
| **Log** | {target_log.name} | {target_log.name} |
| **Heuristic Discovery** | {wasm_res['duration_sec']:.2f}s | {pm4py_res['duration_sec']:.2f}s if pm4py_res else "N/A" |
| **Nodes** | {wasm_res['nodes']} | N/A |
| **Edges** | {wasm_res['edges']} | N/A |

*Benchmark generated on {time.strftime('%Y-%m-%d %H:%M:%S')}*
"""
    with open(RESULTS_FILE, "w") as f:
        f.write(report)
    print(f"Report written to {RESULTS_FILE}")

if __name__ == "__main__":
    main()
