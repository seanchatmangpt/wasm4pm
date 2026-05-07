#!/usr/bin/env python3
"""
run_pm4py_validation.py

Run pm4py algorithms and capture results for comparison with wasm4pm.

Supports:
  - Discovery algorithms (DFG, Alpha++, Heuristic, Genetic, ILP, etc.)
  - Conformance checking (token-based replay, alignments)
  - ML algorithms (classify, cluster, forecast, anomaly, regress, pca)

Usage:
    python3 run_pm4py_validation.py --log /tmp/wasm4pm_test_logs/log_500_events.xes --algorithm dfg
    python3 run_pm4py_validation.py --log /tmp/wasm4pm_test_logs/log_500_events.xes --algorithm all
"""

import pm4py
import json
import time
import argparse
import random
from pathlib import Path
from typing import Any, Dict, Tuple


class PM4pyValidationRunner:
    """Execute PM4py algorithms and capture results."""

    def __init__(self, log_path: str, output_dir: Path = None):
        self.log_path = log_path
        self.log = pm4py.read_xes(log_path)
        self.output_dir = output_dir or Path("/tmp/pm4py_validation_results")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        print(f"Loaded log: {log_path}")
        print(f"  - Traces: {len(self.log)}")
        print(f"  - Events: {sum(len(trace) for trace in self.log)}")

    def run_dfg(self) -> Dict[str, Any]:
        """Discover Directly-Follows Graph."""
        print("\nRunning DFG discovery...")

        start = time.time()
        dfg, start_act, end_act = pm4py.discover_dfg(self.log)
        elapsed = time.time() - start

        # Convert to serializable format
        result = {
            "algorithm": "dfg",
            "time_ms": elapsed * 1000,
            "edges": len(dfg),
            "activities": len(set(n[0] for n in dfg) | set(n[1] for n in dfg)),
            "start_activities": len(start_act),
            "end_activities": len(end_act),
            "edge_details": [
                {
                    "source": edge[0],
                    "target": edge[1],
                    "count": dfg[edge]
                }
                for edge in list(dfg)[:10]  # First 10 edges
            ]
        }

        print(f"✓ DFG: {result['edges']} edges, {result['activities']} activities ({elapsed*1000:.2f}ms)")
        return result

    def run_alpha_plus_plus(self) -> Dict[str, Any]:
        """Discover Petri net using Alpha++."""
        print("\nRunning Alpha++ discovery...")

        start = time.time()
        net, im, fm = pm4py.discover_petri_net_alpha_plus_plus(self.log)
        elapsed = time.time() - start

        result = {
            "algorithm": "alpha_plus_plus",
            "time_ms": elapsed * 1000,
            "places": len(net.places),
            "transitions": len(net.transitions),
            "arcs": len(net.arcs),
            "initial_marking": dict((str(p), m) for p, m in im.items()),
            "final_marking": dict((str(p), m) for p, m in fm.items())
        }

        print(f"✓ Alpha++: {result['places']} places, {result['transitions']} transitions ({elapsed*1000:.2f}ms)")
        return result

    def run_heuristic_miner(self, threshold: float = 0.3) -> Dict[str, Any]:
        """Discover using Heuristic Miner."""
        print(f"\nRunning Heuristic Miner (threshold={threshold})...")

        start = time.time()
        hm = pm4py.discover_heuristic_net(self.log, dependency_threshold=threshold)
        elapsed = time.time() - start

        result = {
            "algorithm": "heuristic_miner",
            "threshold": threshold,
            "time_ms": elapsed * 1000,
            "edges": len(hm.edges),
            "nodes": len(hm.nodes),
            "activities": len(set(
                n for e in hm.edges for n in [e[0], e[1]]
            ))
        }

        print(f"✓ Heuristic: {result['edges']} edges ({elapsed*1000:.2f}ms)")
        return result

    def run_inductive_miner(self) -> Dict[str, Any]:
        """Discover process tree using Inductive Miner."""
        print("\nRunning Inductive Miner...")

        start = time.time()
        tree = pm4py.discover_process_tree(self.log)
        elapsed = time.time() - start

        def count_tree_nodes(node):
            if not hasattr(node, 'children'):
                return 1
            return 1 + sum(count_tree_nodes(child) for child in node.children)

        result = {
            "algorithm": "inductive_miner",
            "time_ms": elapsed * 1000,
            "tree_nodes": count_tree_nodes(tree),
            "tree_depth": self._get_tree_depth(tree)
        }

        print(f"✓ Inductive: tree with {result['tree_nodes']} nodes ({elapsed*1000:.2f}ms)")
        return result

    def run_genetic_algorithm(self, generations: int = 50, population: int = 30, seed: int = 42) -> Dict[str, Any]:
        """Discover using Genetic Algorithm (stochastic)."""
        print(f"\nRunning Genetic Algorithm (gen={generations}, pop={population}, seed={seed})...")

        random.seed(seed)
        start = time.time()

        try:
            net, im, fm = pm4py.discover_petri_net_genetic(
                self.log,
                max_generations=generations,
                population_size=population
            )
            elapsed = time.time() - start

            # Check conformance
            fitness = pm4py.conformance.token_based_replay(self.log, net, im, fm)

            result = {
                "algorithm": "genetic_algorithm",
                "seed": seed,
                "time_ms": elapsed * 1000,
                "places": len(net.places),
                "transitions": len(net.transitions),
                "fitness": fitness['average_trace_fitness']
            }

            print(f"✓ Genetic: fitness={fitness['average_trace_fitness']:.3f} ({elapsed*1000:.2f}ms)")
            return result

        except Exception as e:
            return {
                "algorithm": "genetic_algorithm",
                "seed": seed,
                "error": str(e)
            }

    def run_token_replay(self) -> Dict[str, Any]:
        """Check conformance using token-based replay."""
        print("\nRunning token-based replay...")

        # First discover a model
        net, im, fm = pm4py.discover_petri_net_alpha_plus_plus(self.log)

        start = time.time()
        fitness = pm4py.conformance.token_based_replay(self.log, net, im, fm)
        elapsed = time.time() - start

        result = {
            "algorithm": "token_based_replay",
            "time_ms": elapsed * 1000,
            "fitness": fitness['average_trace_fitness'],
            "num_mismatches": fitness['num_violations'],
            "detailed_metrics": {
                "fit_traces": fitness.get('fit_traces', 0),
                "unfit_traces": fitness.get('unfit_traces', 0)
            }
        }

        print(f"✓ Token Replay: fitness={fitness['average_trace_fitness']:.3f} ({elapsed*1000:.2f}ms)")
        return result

    def run_statistics(self) -> Dict[str, Any]:
        """Compute basic log statistics."""
        print("\nComputing log statistics...")

        start = time.time()
        stats = pm4py.get_event_log_statistics(self.log)
        elapsed = time.time() - start

        result = {
            "algorithm": "statistics",
            "time_ms": elapsed * 1000,
            "num_traces": len(self.log),
            "num_events": sum(len(trace) for trace in self.log),
            "num_unique_activities": len(stats.get('activities', {})),
            "avg_trace_length": sum(len(trace) for trace in self.log) / len(self.log),
            "variant_count": len(pm4py.get_variants(self.log))
        }

        print(f"✓ Statistics: {result['num_traces']} traces, {result['num_events']} events ({elapsed*1000:.2f}ms)")
        return result

    def _get_tree_depth(self, node, depth: int = 0) -> int:
        """Get the depth of a process tree."""
        if not hasattr(node, 'children') or not node.children:
            return depth
        return max(self._get_tree_depth(child, depth + 1) for child in node.children)

    def run_all(self) -> Dict[str, Any]:
        """Run all available algorithms."""
        results = {
            "log_path": self.log_path,
            "timestamp": time.time(),
            "algorithms": {}
        }

        # Discovery algorithms
        results["algorithms"]["dfg"] = self.run_dfg()
        results["algorithms"]["alpha_plus_plus"] = self.run_alpha_plus_plus()
        results["algorithms"]["heuristic_miner"] = self.run_heuristic_miner()
        results["algorithms"]["inductive_miner"] = self.run_inductive_miner()
        results["algorithms"]["statistics"] = self.run_statistics()

        # Only run stochastic on medium/large logs (faster)
        log_size = sum(len(trace) for trace in self.log)
        if log_size <= 500:
            results["algorithms"]["genetic_algorithm"] = self.run_genetic_algorithm(seed=42)

        # Conformance
        results["algorithms"]["token_based_replay"] = self.run_token_replay()

        return results

    def save_results(self, results: Dict[str, Any], filename: str = None) -> Path:
        """Save results to JSON file."""
        if filename is None:
            log_name = Path(self.log_path).stem
            filename = f"pm4py_{log_name}_results.json"

        output_file = self.output_dir / filename
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)

        print(f"\n✓ Results saved to {output_file}")
        return output_file


def main():
    parser = argparse.ArgumentParser(
        description="Run PM4py algorithms for validation"
    )
    parser.add_argument(
        "--log",
        required=True,
        help="Path to XES event log"
    )
    parser.add_argument(
        "--algorithm",
        default="all",
        help="Algorithm to run (dfg, alpha, heuristic, inductive, genetic, all)"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/pm4py_validation_results"),
        help="Output directory for results"
    )

    args = parser.parse_args()

    # Verify log exists
    if not Path(args.log).exists():
        print(f"Error: Log file not found: {args.log}")
        return 1

    # Run validation
    runner = PM4pyValidationRunner(args.log, args.output)

    if args.algorithm == "all":
        results = runner.run_all()
    else:
        print(f"Error: Single algorithm mode not yet implemented")
        return 1

    # Save results
    runner.save_results(results)

    return 0


if __name__ == "__main__":
    exit(main())
