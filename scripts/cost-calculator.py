#!/usr/bin/env python3
"""
cost-calculator.py — GPU cost/energy breakdown calculator for pictl GPU+RL compiler.

Ingests the partial JSON produced by profile-energy-cost.sh (or runs standalone with
synthetic measurements) and produces a complete energy-cost report covering:

  - Energy per operation (pJ) for the Marking4 batch (2048 states × 8 stages)
  - Cost per million operations ($/M ops) for A100, H100, RTX 4090
  - PCIe transfer overhead (% of total energy)
  - Thermal impact on throughput (if throttling was detected)
  - CPU-only discovery baseline comparison

Usage:
  python3 scripts/cost-calculator.py [--input <partial.json>] [--output <report.json>]
  python3 scripts/cost-calculator.py                          # standalone with synthetic data

GPU pricing (Vast.ai / Lambda Labs spot market, 2026-Q1):
  A100 SXM4 80 GB  — $2.00/hr  (Lambda Labs on-demand)
  H100 SXM5 80 GB  — $4.00/hr  (Lambda Labs on-demand)
  RTX 4090 24 GB   — $1.00/hr  (Vast.ai community cloud)
  CPU (96-core)    — $0.10/hr  (GCP n2-standard-96 spot estimate)
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# ── GPU hardware profiles ─────────────────────────────────────────────────────

@dataclass
class GpuProfile:
    name: str
    slug: str
    tdp_w: float
    sustained_w: float           # realistic sustained power under compute load (W)
    utilization_assumed: float   # fraction of TDP used by planning kernel
    price_per_hour: float        # USD/hour cloud
    peak_tflops_fp32: float      # peak FP32 throughput (TFLOPS)
    memory_bandwidth_gbs: float
    pcie_gen: int
    note: str = ""


GPU_PROFILES: dict[str, GpuProfile] = {
    "a100": GpuProfile(
        name="NVIDIA A100 SXM4 80GB",
        slug="a100",
        tdp_w=400.0,
        sustained_w=312.0,
        utilization_assumed=0.65,
        price_per_hour=2.00,
        peak_tflops_fp32=19.5,
        memory_bandwidth_gbs=2000.0,
        pcie_gen=4,
        note="Lambda Labs on-demand 2026-Q1",
    ),
    "h100": GpuProfile(
        name="NVIDIA H100 SXM5 80GB",
        slug="h100",
        tdp_w=700.0,
        sustained_w=480.0,
        utilization_assumed=0.65,
        price_per_hour=4.00,
        peak_tflops_fp32=67.0,
        memory_bandwidth_gbs=3350.0,
        pcie_gen=5,
        note="Lambda Labs on-demand 2026-Q1",
    ),
    "rtx4090": GpuProfile(
        name="NVIDIA RTX 4090 24GB",
        slug="rtx4090",
        tdp_w=450.0,
        sustained_w=350.0,
        utilization_assumed=0.70,
        price_per_hour=1.00,
        peak_tflops_fp32=82.6,   # with sparsity; dense ~42 TFLOPS
        memory_bandwidth_gbs=1008.0,
        pcie_gen=4,
        note="Vast.ai community cloud",
    ),
}


@dataclass
class CpuProfile:
    name: str = "CPU (96-core Xeon)"
    tdp_w: float = 200.0
    price_per_hour: float = 0.10
    discovery_ops_per_sec: float = 5e6   # empirical WASM DFG on process-mining load
    note: str = "GCP n2-standard-96 spot estimate"


CPU_BASELINE = CpuProfile()

# Batch constants
_DEFAULT_BATCH_SIZE = 2048
_DEFAULT_STAGES = 8
_FLOPS_PER_STATE = 640.0          # 8 features × 40 actions × LinUCB matmul
_MARKING4_ACTIONS = 40
_BYTES_PER_FLOAT32 = 4
_PCIE_CONTROLLER_POWER_W = 0.1   # PCIe controller draw during burst transfer


# ── Computation helpers ────────────────────────────────────────────────────────

def marking4_transfer_bytes(batch_size: int) -> int:
    return batch_size * _MARKING4_ACTIONS * _BYTES_PER_FLOAT32


def total_flops(batch_size: int) -> float:
    return _FLOPS_PER_STATE * batch_size


def pcie_roundtrip(batch_size: int, pcie_gen: int) -> tuple[float, float]:
    """Return (roundtrip_us, energy_j) for a Marking4 host-device transfer."""
    bw_map = {3: 16.0, 4: 32.0, 5: 64.0}
    bw_effective_gbs = bw_map.get(pcie_gen, 16.0) * 0.60
    bw_bps = bw_effective_gbs * 1e9
    nbytes = marking4_transfer_bytes(batch_size)
    one_way_s = nbytes / bw_bps
    roundtrip_s = 2.0 * one_way_s
    energy_j = _PCIE_CONTROLLER_POWER_W * roundtrip_s
    return roundtrip_s * 1e6, energy_j


def estimate_kernel_time_ms(gpu: GpuProfile, batch_size: int) -> float:
    eff_tflops = gpu.peak_tflops_fp32 * gpu.utilization_assumed
    flops = total_flops(batch_size)
    return (flops / (eff_tflops * 1e12)) * 1000.0


def joules_to_dollar(energy_j: float, gpu: GpuProfile) -> float:
    seconds = energy_j / gpu.sustained_w
    return seconds * (gpu.price_per_hour / 3600.0)


def cost_per_joule(gpu: GpuProfile) -> float:
    return (gpu.price_per_hour / 3600.0) / gpu.sustained_w


def cpu_baseline_cost(batch_size: int, stages: int) -> dict:
    cpu = CPU_BASELINE
    total_ops = batch_size * stages
    cpu_time_s = total_ops / cpu.discovery_ops_per_sec
    cpu_energy_j = cpu.tdp_w * cpu_time_s
    cpu_cost = cpu_time_s * (cpu.price_per_hour / 3600.0)
    return {
        "name": cpu.name,
        "time_ms": round(cpu_time_s * 1000, 6),
        "power_w": cpu.tdp_w,
        "energy_j": cpu_energy_j,
        "energy_per_op_pj": round((cpu_energy_j / total_ops) * 1e12, 6),
        "cost_usd": cpu_cost,
        "cost_per_million_ops_usd": round((cpu_cost / total_ops) * 1e6, 10),
        "note": cpu.note,
    }


def gpu_cost_entry(
    gpu: GpuProfile,
    batch_size: int,
    stages: int,
    cpu_kernel_time_ms: Optional[float],   # measured WASM time on CPU (used for speedup calc)
    pcie_rt_us: float,
    pcie_energy_j: float,
    thermal: dict,
) -> dict:
    total_ops = batch_size * stages
    cpu = CPU_BASELINE

    # CPU reference time: use measured WASM time if available, else model from ops/sec
    if cpu_kernel_time_ms is not None:
        cpu_time_s = cpu_kernel_time_ms / 1000.0
    else:
        cpu_time_s = total_ops / cpu.discovery_ops_per_sec

    # GPU kernel timing is always estimated from GPU TFLOPS (we are on CPU-only hardware)
    # For a real GPU measurement, replace this with cudaEvent_t timing.
    kt_ms = estimate_kernel_time_ms(gpu, batch_size)
    kt_src = "estimated_flops"

    # Thermal degradation
    throttle_pct = 0.0
    if thermal.get("throttling_detected") and thermal.get("freq_reduction_pct") is not None:
        try:
            throttle_pct = float(thermal["freq_reduction_pct"]) / 100.0
        except (TypeError, ValueError):
            pass
    kt_ms_degraded = kt_ms * (1.0 + throttle_pct)

    # Energy
    kernel_energy_j = gpu.sustained_w * (kt_ms_degraded / 1000.0)
    total_energy_j = kernel_energy_j + pcie_energy_j
    energy_per_op_pj = (total_energy_j / total_ops) * 1e12 if total_ops > 0 else 0.0
    pcie_overhead_pct = (pcie_energy_j / total_energy_j) * 100.0 if total_energy_j > 0 else 0.0

    # Cost
    total_cost_usd = joules_to_dollar(total_energy_j, gpu)
    kernel_cost_usd = joules_to_dollar(kernel_energy_j, gpu)
    pcie_cost_usd = joules_to_dollar(pcie_energy_j, gpu)
    cost_per_mops_usd = (total_cost_usd / total_ops) * 1e6 if total_ops > 0 else 0.0

    # Throughput
    throughput = total_ops / (kt_ms_degraded / 1000.0) if kt_ms_degraded > 0 else 0.0
    gpu_speedup = cpu_time_s / (kt_ms_degraded / 1000.0) if kt_ms_degraded > 0 else 0.0

    return {
        "gpu": gpu.name,
        "slug": gpu.slug,
        "hardware": {
            "tdp_w": gpu.tdp_w,
            "sustained_w": gpu.sustained_w,
            "utilization_assumed": gpu.utilization_assumed,
            "peak_tflops_fp32": gpu.peak_tflops_fp32,
            "memory_bandwidth_gbs": gpu.memory_bandwidth_gbs,
            "price_per_hour_usd": gpu.price_per_hour,
            "note": gpu.note,
        },
        "kernel": {
            "time_ms": round(kt_ms_degraded, 6),
            "time_ms_undegraded": round(kt_ms, 6),
            "time_source": kt_src,
            "total_flops": total_flops(batch_size),
            "effective_tflops": round(gpu.peak_tflops_fp32 * gpu.utilization_assumed, 2),
            "throughput_ops_per_sec": round(throughput, 2),
            "thermal_degradation_pct": round(throttle_pct * 100.0, 2),
        },
        "energy": {
            "kernel_energy_j": round(kernel_energy_j, 12),
            "pcie_energy_j": round(pcie_energy_j, 12),
            "total_energy_j": round(total_energy_j, 12),
            "energy_per_op_pj": round(energy_per_op_pj, 6),
            "pcie_overhead_pct": round(pcie_overhead_pct, 6),
        },
        "cost": {
            "kernel_cost_usd": kernel_cost_usd,
            "pcie_cost_usd": pcie_cost_usd,
            "total_cost_usd": total_cost_usd,
            "cost_per_million_ops_usd": round(cost_per_mops_usd, 10),
            "cost_per_joule_usd": round(cost_per_joule(gpu), 12),
        },
        "vs_cpu": {
            "gpu_speedup_x": round(gpu_speedup, 4),
            "cpu_time_ms": round(cpu_time_s * 1000, 6),
            "time_saved_ms": round(cpu_time_s * 1000 - kt_ms_degraded, 6),
            "cost_ratio_gpu_to_cpu": None,  # filled after cpu_baseline known
        },
    }


# ── Report assembly ────────────────────────────────────────────────────────────

def build_report(
    partial: Optional[dict] = None,
    batch_size: int = _DEFAULT_BATCH_SIZE,
    stages: int = _DEFAULT_STAGES,
) -> dict:
    total_ops = batch_size * stages

    # Extract measurements from partial if available
    kernel_time_ms: Optional[float] = None
    measured_power_w: Optional[float] = None
    thermal: dict = {
        "throttling_detected": False,
        "peak_temp_c": None,
        "freq_reduction_pct": None,
        "test_duration_s": 10,
    }
    gpu_vendor = "none"
    gpu_name = "unknown (no GPU detected)"
    measured_pcie_rt_us: Optional[float] = None
    measured_pcie_energy_j: Optional[float] = None

    if partial is not None:
        def _pf(v):
            if v is None: return None
            try: return float(v)
            except (TypeError, ValueError): return None

        kernel_time_ms = _pf(partial.get("kernel_timing", {}).get("kernel_time_ms"))
        measured_power_w = _pf(partial.get("gpu_info", {}).get("power_draw_w"))
        thermal = partial.get("thermal", thermal)
        gpu_vendor = partial.get("gpu_info", {}).get("vendor", "none")
        gpu_name = partial.get("gpu_info", {}).get("name", gpu_name)
        measured_pcie_rt_us = _pf(partial.get("pcie", {}).get("roundtrip_latency_us"))
        measured_pcie_energy_j = _pf(partial.get("pcie", {}).get("roundtrip_energy_j"))

    # Build per-GPU breakdown
    gpu_entries: dict[str, dict] = {}
    for slug, gpu in GPU_PROFILES.items():
        if measured_pcie_rt_us is not None and measured_pcie_energy_j is not None:
            rt_us = measured_pcie_rt_us
            pe_j = measured_pcie_energy_j
        else:
            rt_us, pe_j = pcie_roundtrip(batch_size, gpu.pcie_gen)

        entry = gpu_cost_entry(gpu, batch_size, stages, kernel_time_ms, rt_us, pe_j, thermal)
        gpu_entries[slug] = entry

    # CPU baseline
    cpu_base = cpu_baseline_cost(batch_size, stages)
    cpu_cost = cpu_base["cost_usd"]

    # Fill in cost ratio vs CPU
    for entry in gpu_entries.values():
        gc = entry["cost"]["total_cost_usd"]
        entry["vs_cpu"]["cost_ratio_gpu_to_cpu"] = round(gc / cpu_cost, 6) if cpu_cost > 0 else None

    # Summary
    costs_mops = {s: e["cost"]["cost_per_million_ops_usd"] for s, e in gpu_entries.items()}
    energy_pj  = {s: e["energy"]["energy_per_op_pj"] for s, e in gpu_entries.items()}
    speedups   = {s: e["vs_cpu"]["gpu_speedup_x"] for s, e in gpu_entries.items()}

    best_cost   = min(costs_mops, key=costs_mops.get)
    best_energy = min(energy_pj,  key=energy_pj.get)
    best_speed  = max(speedups,   key=speedups.get)

    pcie_overheads = [e["energy"]["pcie_overhead_pct"] for e in gpu_entries.values()]

    throttle_str = "YES" if thermal.get("throttling_detected") else "NO"
    drop_pct = thermal.get("freq_reduction_pct")
    peak_t = thermal.get("peak_temp_c")
    if thermal.get("throttling_detected"):
        thermal_note = (
            f"Throttling detected: clock reduced by {drop_pct}%, peak {peak_t}°C. "
            f"Sustained throughput degraded by approximately {drop_pct:.1f}%."
        )
    else:
        thermal_note = (
            f"Thermal profile stable. Peak temp: {peak_t}°C. "
            "No frequency scaling detected during 10s sustained load."
        )

    return {
        "schema_version": "1.0",
        "tool": "pictl cost-calculator",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "batch_profile": {
            "name": "Marking4",
            "batch_size": batch_size,
            "stages": stages,
            "total_ops": total_ops,
            "transfer_bytes": marking4_transfer_bytes(batch_size),
            "flops_per_batch": total_flops(batch_size),
            "description": (
                f"{batch_size} Marking4 states × {stages} pipeline stages "
                f"(LinUCB+UCB1 RL action selection, 40-bit admissible mask)"
            ),
        },
        "measured_gpu": {
            "vendor": gpu_vendor,
            "name": gpu_name,
            "actual_power_w": measured_power_w,
        },
        "cloud_pricing_reference": {
            "date": "2026-Q1",
            "source": "Lambda Labs on-demand + Vast.ai community cloud",
            "a100_per_hour": "$2.00",
            "h100_per_hour": "$4.00",
            "rtx4090_per_hour": "$1.00 (Vast.ai)",
            "cpu_96core_per_hour": "$0.10 (GCP n2-standard-96 spot)",
        },
        "gpu_cost_breakdown": gpu_entries,
        "cpu_baseline": cpu_base,
        "thermal": {
            **thermal,
            "interpretation": thermal_note,
        },
        "summary": {
            "best_cost_efficiency": {
                "gpu": best_cost,
                "cost_per_million_ops_usd": round(costs_mops[best_cost], 10),
            },
            "best_energy_efficiency": {
                "gpu": best_energy,
                "energy_per_op_pj": round(energy_pj[best_energy], 6),
            },
            "highest_throughput": {
                "gpu": best_speed,
                "speedup_vs_cpu": round(speedups[best_speed], 4),
            },
            "thermal_stability": throttle_str,
            "pcie_overhead_range": {
                "min_pct": round(min(pcie_overheads), 6),
                "max_pct": round(max(pcie_overheads), 6),
                "interpretation": (
                    "PCIe overhead is negligible for batch_size >= 2048. "
                    "For single-state inference, PCIe round-trip dominates — always batch."
                ),
            },
            "cost_benefit_vs_cpu": {
                "a100_speedup_x": round(speedups.get("a100", 0), 4),
                "h100_speedup_x": round(speedups.get("h100", 0), 4),
                "rtx4090_speedup_x": round(speedups.get("rtx4090", 0), 4),
                "recommendation": (
                    "Interactive discovery (<100 ms target): RTX 4090 at $1.00/hr. "
                    "Throughput at scale (>10 K batches/min): H100 at $4.00/hr. "
                    "Balanced quality-profile mining pipelines: A100 at $2.00/hr."
                ),
            },
        },
    }


# ── Human-readable summary ────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    bp = report["batch_profile"]
    s  = report["summary"]
    th = report["thermal"]

    ruler = "=" * 72

    print()
    print(ruler)
    print("  pictl GPU+RL Compiler — Energy & Cost Profiler Report")
    print(ruler)
    print(f"  Generated  : {report['generated_at']}")
    print(f"  Batch      : {bp['name']} — {bp['batch_size']} states × {bp['stages']} stages = {bp['total_ops']:,} ops")
    print(f"  Transfer   : {bp['transfer_bytes']:,} bytes (Marking4 GPU-CPU round-trip)")
    print(f"  FLOPs      : {bp['flops_per_batch']:,.0f} (LinUCB 8-dim, 40 actions per state)")
    print()

    print("  GPU POWER AND ENERGY")
    print("  " + "-" * 68)
    header = f"  {'GPU':<26} {'Power(W)':<10} {'Kern(ms)':<12} {'E/op(pJ)':<14} {'PCIe%'}"
    print(header)
    print("  " + "-" * 68)
    for e in report["gpu_cost_breakdown"].values():
        print(
            f"  {e['gpu']:<26} "
            f"{e['hardware']['sustained_w']:<10.1f} "
            f"{e['kernel']['time_ms']:<12.6f} "
            f"{e['energy']['energy_per_op_pj']:<14.6f} "
            f"{e['energy']['pcie_overhead_pct']:.6f}%"
        )
    print()

    print("  COST PER MILLION OPERATIONS")
    print("  " + "-" * 68)
    print(f"  {'GPU':<26} {'$/M ops':<22} {'GPU speedup':<14} {'Cost vs CPU'}")
    print("  " + "-" * 68)
    for e in report["gpu_cost_breakdown"].values():
        ratio = e["vs_cpu"]["cost_ratio_gpu_to_cpu"]
        ratio_str = f"{ratio:.4f}x" if ratio is not None else "N/A"
        print(
            f"  {e['gpu']:<26} "
            f"${e['cost']['cost_per_million_ops_usd']:<21.8f} "
            f"{e['vs_cpu']['gpu_speedup_x']:<14.4f}x "
            f"{ratio_str}"
        )
    cpu = report["cpu_baseline"]
    print(
        f"  {'CPU (96-core baseline)':<26} "
        f"${cpu['cost_per_million_ops_usd']:<21.8f} "
        f"{'1.0000':<14}x "
        f"{'1.0000x (baseline)'}"
    )
    print()

    print("  THERMAL PROFILE")
    print("  " + "-" * 68)
    print(f"  Throttling detected  : {th.get('throttling_detected', False)}")
    print(f"  Peak temperature     : {th.get('peak_temp_c')}°C")
    print(f"  Frequency reduction  : {th.get('freq_reduction_pct')}%")
    print(f"  Interpretation       : {th.get('interpretation', 'N/A')}")
    print()

    print("  SUMMARY & RECOMMENDATIONS")
    print("  " + "-" * 68)
    bce = s["best_cost_efficiency"]
    bee = s["best_energy_efficiency"]
    bsp = s["highest_throughput"]
    pcie = s["pcie_overhead_range"]
    print(f"  Best cost/M ops      : {bce['gpu'].upper()} @ ${bce['cost_per_million_ops_usd']:.8f}")
    print(f"  Best energy/op       : {bee['gpu'].upper()} @ {bee['energy_per_op_pj']:.6f} pJ/op")
    print(f"  Fastest GPU          : {bsp['gpu'].upper()} @ {bsp['speedup_vs_cpu']:.4f}x CPU speed")
    print(f"  PCIe overhead range  : {pcie['min_pct']:.6f}% – {pcie['max_pct']:.6f}%")
    print(f"  Thermal stability    : {s['thermal_stability']}")
    print()
    print(f"  {s['cost_benefit_vs_cpu']['recommendation']}")
    print()
    print(ruler)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="pictl GPU cost/energy calculator for Marking4 RL kernel",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--input",  "-i", metavar="FILE",
                        help="Partial JSON from profile-energy-cost.sh")
    parser.add_argument("--output", "-o", metavar="FILE",
                        help="Output JSON file path")
    parser.add_argument("--quiet",  "-q", action="store_true",
                        help="Suppress human-readable output")
    parser.add_argument("--batch-size", type=int, default=_DEFAULT_BATCH_SIZE,
                        help=f"Marking4 batch size (default: {_DEFAULT_BATCH_SIZE})")
    parser.add_argument("--stages", type=int, default=_DEFAULT_STAGES,
                        help=f"Pipeline stages (default: {_DEFAULT_STAGES})")
    args = parser.parse_args()

    batch_size = args.batch_size
    stages = args.stages

    # Load partial profile
    partial: Optional[dict] = None
    if args.input:
        inp = Path(args.input)
        if not inp.exists():
            print(f"ERROR: input file not found: {inp}", file=sys.stderr)
            sys.exit(1)
        with inp.open() as f:
            partial = json.load(f)
        print(f"[cost-calculator] Loaded partial profile: {inp}", file=sys.stderr)

    # Build report
    report = build_report(partial, batch_size=batch_size, stages=stages)

    # Determine output path
    if args.output:
        out_path = Path(args.output)
    else:
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")
        out_dir = Path(".pictl/benchmarks")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"energy-cost-{ts}.json"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(report, f, indent=2)
    print(f"[cost-calculator] Full report written to: {out_path}", file=sys.stderr)

    if not args.quiet:
        print_report(report)

    # Echo path for pipeline chaining
    print(str(out_path))


if __name__ == "__main__":
    main()
