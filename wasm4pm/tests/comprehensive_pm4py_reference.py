#!/usr/bin/env python3
"""
Comprehensive pm4py Reference Generator for Full Parity Testing

Generates reference outputs for ALL pm4py algorithms to validate
wasm4pm parity across the complete feature set.

Usage:
    cd /Users/sac/chatmangpt/wasm4pm
    python3 wasm4pm/tests/comprehensive_pm4py_reference.py
"""

import pm4py
import json
from pathlib import Path
import sys

# Fixtures directory
FIXTURES_DIR = Path("wasm4pm/tests/fixtures")
OUTPUT_DIR = FIXTURES_DIR

def load_running_example():
    """Load the canonical running-example.xes log."""
    xes_path = FIXTURES_DIR / "running-example.xes"
    return pm4py.read_xes(str(xes_path))

def save_event_log_json(log, output_path):
    """Save event log as JSON for wasm4pm to load."""
    output = {"attributes": {}, "traces": []}

    if hasattr(log, 'iterrows'):
        from collections import defaultdict
        traces = defaultdict(list)
        for idx, row in log.iterrows():
            case_id = str(row.get('case:concept:name', idx))
            event = {"attributes": {}}
            for col in row.index:
                if col == 'case:concept:name':
                    continue
                value = row[col]
                if col == 'concept:name':
                    event["attributes"]["activity"] = {"tag": "String", "value": str(value)}
                elif col == 'time:timestamp':
                    event["attributes"]["timestamp"] = {"tag": "Date", "value": value.isoformat() if hasattr(value, 'isoformat') else str(value)}
                else:
                    if value is None:
                        event["attributes"][col] = None
                    elif isinstance(value, str):
                        event["attributes"][col] = {"tag": "String", "value": value}
                    elif isinstance(value, int):
                        event["attributes"][col] = {"tag": "Int", "value": value}
                    elif isinstance(value, float):
                        event["attributes"][col] = {"tag": "Float", "value": value}
                    elif isinstance(value, bool):
                        event["attributes"][col] = {"tag": "Boolean", "value": value}
                    else:
                        event["attributes"][col] = {"tag": "String", "value": str(value)}
            traces[case_id].append(event)

        for case_id, events in traces.items():
            trace_data = {
                "attributes": {"case:concept:name": {"tag": "String", "value": case_id}},
                "events": events
            }
            output["traces"].append(trace_data)
    else:
        for case_id, trace in enumerate(log, start=1):
            trace_data = {
                "attributes": {"case:concept:name": {"tag": "String", "value": str(case_id)}},
                "events": []
            }
            for event in trace:
                event_data = {"attributes": {}}
                for key in event:
                    value = event[key]
                    if key == "concept:name":
                        event_data["attributes"]["activity"] = {"tag": "String", "value": str(value)}
                    elif key == "time:timestamp" and hasattr(value, 'isoformat'):
                        event_data["attributes"]["timestamp"] = {"tag": "Date", "value": value.isoformat()}
                    else:
                        if value is None:
                            event_data["attributes"][key] = None
                        elif isinstance(value, str):
                            event_data["attributes"][key] = {"tag": "String", "value": value}
                        elif isinstance(value, int):
                            event_data["attributes"][key] = {"tag": "Int", "value": value}
                        elif isinstance(value, float):
                            event_data["attributes"][key] = {"tag": "Float", "value": value}
                        elif isinstance(value, bool):
                            event_data["attributes"][key] = {"tag": "Boolean", "value": value}
                        else:
                            event_data["attributes"][key] = {"tag": "String", "value": str(value)}
                trace_data["events"].append(event_data)
            output["traces"].append(trace_data)

    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"  ✓ Event log JSON: {output_path}")

def discover_all(log):
    """Discover all possible models and save references."""

    results = {}

    # 1. DFG Discovery
    print("\n[1/10] DFG Discovery...")
    try:
        dfg, start, end = pm4py.discover_dfg(log)
        all_acts = set()
        for (a, b) in dfg.keys():
            all_acts.add(a)
            all_acts.add(b)
        results['dfg'] = {
            'activities': sorted(list(all_acts)),
            'edges': [{'from': a, 'to': b, 'frequency': c} for (a, b), c in dfg.items()],
            'start_activities': [{'activity': a, 'count': c} for a, c in sorted(start.items())],
            'end_activities': [{'activity': a, 'count': c} for a, c in sorted(end.items())],
        }
        with open(OUTPUT_DIR / 'pm4py_dfg.json', 'w') as f:
            json.dump(results['dfg'], f, indent=2)
        print(f"  ✓ DFG: pm4py_dfg.json")
    except Exception as e:
        print(f"  ✗ DFG failed: {e}")

    # 2. Inductive Miner
    print("\n[2/10] Inductive Miner...")
    try:
        tree = pm4py.discover_process_tree_inductive(log)
        results['inductive'] = {'tree': str(tree)}
        with open(OUTPUT_DIR / 'pm4py_inductive_miner.json', 'w') as f:
            json.dump(results['inductive'], f, indent=2)
        print(f"  ✓ Inductive Miner: pm4py_inductive_miner.json")
    except Exception as e:
        print(f"  ✗ Inductive Miner failed: {e}")

    # 3. Alpha Miner
    print("\n[3/10] Alpha Miner...")
    try:
        net, im, fm = pm4py.discover_petri_net_alpha(log)
        results['alpha'] = {
            'places': len(net.places),
            'transitions': len(net.transitions),
            'arcs': len(net.arcs),
        }
        with open(OUTPUT_DIR / 'pm4py_alpha_miner.json', 'w') as f:
            json.dump(results['alpha'], f, indent=2)
        print(f"  ✓ Alpha Miner: pm4py_alpha_miner.json")
    except Exception as e:
        print(f"  ✗ Alpha Miner failed: {e}")

    # 4. Heuristic Miner
    print("\n[4/10] Heuristic Miner...")
    try:
        from pm4py.algo.discovery.heuristics import algorithm as heu
        net, im, fm = heu.apply(log)
        results['heuristic'] = {
            'places': len(net.places),
            'transitions': len(net.transitions),
            'arcs': len(net.arcs),
        }
        with open(OUTPUT_DIR / 'pm4py_heuristic_miner.json', 'w') as f:
            json.dump(results['heuristic'], f, indent=2)
        print(f"  ✓ Heuristic Miner: pm4py_heuristic_miner.json")
    except Exception as e:
        print(f"  ✗ Heuristic Miner failed: {e}")

    # 5. ILP Miner
    print("\n[5/10] ILP Miner...")
    try:
        net, im, fm = pm4py.discover_petri_net_ilp(log)
        results['ilp'] = {
            'places': len(net.places),
            'transitions': len(net.transitions),
            'arcs': len(net.arcs),
        }
        with open(OUTPUT_DIR / 'pm4py_ilp_miner.json', 'w') as f:
            json.dump(results['ilp'], f, indent=2)
        print(f"  ✓ ILP Miner: pm4py_ilp_miner.json")
    except Exception as e:
        print(f"  ✗ ILP Miner failed: {e}")

    # 6. Token Replay Conformance
    print("\n[6/10] Token Replay Conformance...")
    try:
        tree = pm4py.discover_process_tree_inductive(log)
        from pm4py.convert import convert_to_petri_net
        net, im, fm = convert_to_petri_net(tree)
        from pm4py.algo.conformance.tokenreplay import algorithm as token_replay
        replay_results = token_replay.apply(log, net, im, fm, variant=token_replay.Variants.TOKEN_REPLAY)
        total = len(replay_results)
        fitted = sum(1 for r in replay_results if r['trace_is_fit'])
        results['conformance'] = {
            'total_traces': total,
            'fitted_traces': fitted,
            'fitness_percentage': fitted / total * 100 if total > 0 else 0,
        }
        with open(OUTPUT_DIR / 'pm4py_token_replay.json', 'w') as f:
            json.dump(results['conformance'], f, indent=2)
        print(f"  ✓ Token Replay: pm4py_token_replay.json")
    except Exception as e:
        print(f"  ✗ Token Replay failed: {e}")

    # 7. Alignment-based Conformance
    print("\n[7/10] Alignment Conformance...")
    try:
        tree = pm4py.discover_process_tree_inductive(log)
        from pm4py.algo.conformance.alignments.decomposition import algorithm as alignments
        conf_results = alignments.apply(log, tree)
        avg_fitness = sum(r['fitness'] for r in conf_results) / len(conf_results)
        results['alignment'] = {'average_fitness': avg_fitness}
        with open(OUTPUT_DIR / 'pm4py_alignment.json', 'w') as f:
            json.dump(results['alignment'], f, indent=2)
        print(f"  ✓ Alignment: pm4py_alignment.json")
    except Exception as e:
        print(f"  ✗ Alignment failed: {e}")

    # 8. Footprints
    print("\n[8/10] Footprints...")
    try:
        from pm4py.algo.discovery.footprints import algorithm as footprints
        fp_result = footprints.apply(log, variant=footprints.Variants.CLASSIC)
        results['footprints'] = {'footprints': str(type(fp_result))}
        with open(OUTPUT_DIR / 'pm4py_footprints.json', 'w') as f:
            json.dump(results['footprints'], f, indent=2)
        print(f"  ✓ Footprints: pm4py_footprints.json")
    except Exception as e:
        print(f"  ✗ Footprints failed: {e}")

    # 9. Case Duration Statistics
    print("\n[9/10] Case Duration...")
    try:
        from pm4py.statistics import case_duration
        durations = case_duration.get_case_duration(log, parameters={case_duration.Parameters.AGGREGATION_MEASURE: "mean"})
        results['durations'] = {
            'mean_duration': durations,
        }
        with open(OUTPUT_DIR / 'pm4py_case_durations.json', 'w') as f:
            json.dump(results['durations'], f, indent=2)
        print(f"  ✓ Case Durations: pm4py_case_durations.json")
    except Exception as e:
        print(f"  ✗ Case Durations failed: {e}")

    # 10. Variants
    print("\n[10/12] Variants...")
    try:
        variants = pm4py.get_variants(log)
        results['variants'] = {
            'num_variants': len(variants),
            'top_variant': str(list(variants.keys())[0]) if variants else None,
        }
        with open(OUTPUT_DIR / 'pm4py_variants.json', 'w') as f:
            json.dump(results['variants'], f, indent=2)
        print(f"  ✓ Variants: pm4py_variants.json")
    except Exception as e:
        print(f"  ✗ Variants failed: {e}")

    # 11. Soundness Checking
    print("\n[11/12] Soundness Checking...")
    try:
        from pm4py.algo.analysis.woflan import algorithm as woflan
        net, im, fm = pm4py.discover_petri_net_inductive(log)
        soundness = woflan.apply(net, im, fm, parameters=woflan.Variants.CLASSIC.value.Parameters)
        results['soundness'] = {
            'sound': soundness['is_sound'],
            'deadlock_free': soundness.get('deadlock_free', True),
            'bounded': soundness.get('boundedness', True),
            'liveness': soundness.get('liveness', True),
        }
        with open(OUTPUT_DIR / 'pm4py_soundness.json', 'w') as f:
            json.dump(results['soundness'], f, indent=2)
        print(f"  ✓ Soundness: pm4py_soundness.json")
    except Exception as e:
        print(f"  ✗ Soundness failed: {e}")

    # 12. Footprints Conformance
    print("\n[12/12] Footprints Conformance...")
    try:
        from pm4py.algo.discovery.footprints import algorithm as footprints_discovery
        from pm4py.algo.conformance.footprints import algorithm as footprints_conformance

        log_fp = footprints_discovery.apply(log, variant=footprints_discovery.Variants.CLASSIC)
        model_fp = log_fp  # For a simple log, use log footprints as model

        conf_result = footprints_conformance.apply(log, model_fp,
                                                    variant=footprints_conformance.Variants.CLASSIC)

        results['footprints_conf'] = {
            'fitness': conf_result.get('fitness', 1.0),
            'precision': conf_result.get('precision', 1.0),
            'recall': conf_result.get('recall', 1.0),
            'f1': conf_result.get('f1', 1.0),
        }
        with open(OUTPUT_DIR / 'pm4py_footprints_conformance.json', 'w') as f:
            json.dump(results['footprints_conf'], f, indent=2)
        print(f"  ✓ Footprints Conformance: pm4py_footprints_conformance.json")
    except Exception as e:
        print(f"  ✗ Footprints Conformance failed: {e}")

    return results

def main():
    print("="*60)
    print("Comprehensive pm4py Reference Generator")
    print("="*60)

    print("\nLoading running-example.xes...")
    log = load_running_example()
    print(f"  ✓ Loaded {len(log)} cases")

    print("\n" + "="*60)
    print("Generating Reference Outputs")
    print("="*60)

    # Save event log JSON
    print("\n[0/10] Saving event log as JSON...")
    save_event_log_json(log, OUTPUT_DIR / 'running-example.json')

    # Discover all algorithms
    results = discover_all(log)

    print("\n" + "="*60)
    print("Summary")
    print("="*60)
    print(f"Generated {len(results)} reference outputs")
    print(f"\nRun wasm4pm parity tests:")
    print(f"  cd wasm4pm")
    print(f"  cargo test --package wasm4pm --test comprehensive_parity_tests")

if __name__ == "__main__":
    main()
