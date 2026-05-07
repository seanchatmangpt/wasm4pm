#!/usr/bin/env python3
"""
generate_test_logs.py

Generate deterministic test event logs for wasm4pm vs pm4py validation.

Usage:
    python3 generate_test_logs.py --output /tmp/wasm4pm_test_logs
"""

import pm4py
from pm4py.objects.log.log import EventLog, Trace, Event
import random
import json
import argparse
from datetime import datetime, timedelta
from pathlib import Path


def generate_synthetic_log(num_traces: int, max_trace_length: int, seed: int = 42) -> EventLog:
    """
    Generate a deterministic synthetic event log.

    Activities follow a realistic pattern:
    - Start: Register Request
    - Process: Request Review, Assess, Execute, Complete
    - Decision: Approve/Reject (some loops back)
    - End: Archive
    """
    random.seed(seed)

    log = EventLog()
    activities = [
        "Register Request",
        "Request Review",
        "Assess",
        "Execute",
        "Approve",
        "Reject",
        "Rework",
        "Complete",
        "Archive"
    ]

    base_time = datetime(2025, 1, 1, 0, 0, 0)

    for trace_id in range(num_traces):
        trace = Trace()
        current_time = base_time + timedelta(hours=trace_id)

        # Generate trace with realistic patterns
        trace_length = random.randint(3, max_trace_length)
        visited = set()

        for step in range(trace_length):
            if step == 0:
                # Start activity
                activity = "Register Request"
            elif step == trace_length - 1:
                # End activity
                activity = "Archive"
            else:
                # Middle activities with some patterns
                if "Approve" not in visited and random.random() < 0.7:
                    activity = "Request Review"
                elif "Assess" not in visited:
                    activity = "Assess"
                elif "Execute" not in visited:
                    activity = "Execute"
                elif "Approve" not in visited and random.random() < 0.5:
                    activity = "Approve"
                elif "Reject" in visited and random.random() < 0.3:
                    activity = "Rework"
                else:
                    activity = "Complete"

            visited.add(activity)

            # Create event
            event = Event({
                "concept:name": activity,
                "time:timestamp": current_time,
                "case:concept:name": f"case_{trace_id}",
                "org:resource": f"Resource_{random.randint(1, 5)}"
            })

            trace.append(event)
            current_time += timedelta(hours=1)

        log.append(trace)

    return log


def generate_small_log(output_dir: Path) -> None:
    """Generate small test log (50 events)."""
    print("Generating small log (50 events)...")
    log = generate_synthetic_log(num_traces=5, max_trace_length=10, seed=42)

    output_file = output_dir / "log_50_events.xes"
    pm4py.write_xes(log, str(output_file))

    print(f"✓ Generated {output_file}")
    print(f"  - Traces: {len(log)}")
    print(f"  - Events: {sum(len(trace) for trace in log)}")


def generate_medium_log(output_dir: Path) -> None:
    """Generate medium test log (500 events)."""
    print("Generating medium log (500 events)...")
    log = generate_synthetic_log(num_traces=50, max_trace_length=10, seed=123)

    output_file = output_dir / "log_500_events.xes"
    pm4py.write_xes(log, str(output_file))

    print(f"✓ Generated {output_file}")
    print(f"  - Traces: {len(log)}")
    print(f"  - Events: {sum(len(trace) for trace in log)}")


def generate_large_log(output_dir: Path) -> None:
    """Generate large test log (5000 events)."""
    print("Generating large log (5000 events)...")
    log = generate_synthetic_log(num_traces=500, max_trace_length=10, seed=456)

    output_file = output_dir / "log_5000_events.xes"
    pm4py.write_xes(log, str(output_file))

    print(f"✓ Generated {output_file}")
    print(f"  - Traces: {len(log)}")
    print(f"  - Events: {sum(len(trace) for trace in log)}")


def generate_json_versions(output_dir: Path) -> None:
    """Generate JSON versions of test logs for JavaScript testing."""
    print("Generating JSON versions...")

    xes_files = list(output_dir.glob("log_*_events.xes"))

    for xes_file in xes_files:
        print(f"Converting {xes_file.name}...")

        # Read XES
        log = pm4py.read_xes(str(xes_file))

        # Convert to JSON-serializable format
        log_json = {
            "traces": []
        }

        for trace in log:
            trace_json = {
                "case_id": trace.attributes.get("concept:name", ""),
                "events": []
            }

            for event in trace:
                event_json = {
                    "activity": event.get("concept:name", ""),
                    "timestamp": event.get("time:timestamp", "").isoformat() if event.get("time:timestamp") else "",
                    "resource": event.get("org:resource", "")
                }
                trace_json["events"].append(event_json)

            log_json["traces"].append(trace_json)

        # Write JSON
        json_file = output_dir / xes_file.name.replace(".xes", ".json")
        with open(json_file, "w") as f:
            json.dump(log_json, f, indent=2, default=str)

        print(f"✓ Generated {json_file}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate test event logs for wasm4pm validation"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/wasm4pm_test_logs"),
        help="Output directory for test logs"
    )

    args = parser.parse_args()

    # Create output directory
    args.output.mkdir(parents=True, exist_ok=True)

    print(f"Generating test logs to {args.output}\n")

    # Generate all log sizes
    generate_small_log(args.output)
    print()
    generate_medium_log(args.output)
    print()
    generate_large_log(args.output)
    print()
    generate_json_versions(args.output)

    print("\n✓ All test logs generated successfully!")
    print(f"\nLog files:")
    for log_file in sorted(args.output.glob("log_*")):
        stat = log_file.stat()
        print(f"  - {log_file.name} ({stat.st_size} bytes)")


if __name__ == "__main__":
    main()
