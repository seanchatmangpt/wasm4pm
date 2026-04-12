#!/usr/bin/env python3
"""
Plot benchmark trends from trends.json
Generates weekly/monthly performance graphs
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
import argparse

def load_trends():
    """Load trends.json data"""
    trends_file = Path(__file__).parent / "trends.json"

    try:
        with open(trends_file) as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: trends.json not found at {trends_file}")
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing trends.json: {e}")
        return None

def filter_data_points(data_points, algorithm=None, profile=None, days=None):
    """Filter data points by criteria"""
    cutoff_date = None
    if days:
        cutoff_date = datetime.utcnow() - timedelta(days=days)

    filtered = []
    for point in data_points:
        if algorithm and point.get("algorithm") != algorithm:
            continue
        if profile and point.get("profile") != profile:
            continue

        if cutoff_date:
            try:
                point_time = datetime.fromisoformat(point["timestamp"].replace("Z", "+00:00"))
                if point_time < cutoff_date:
                    continue
            except (ValueError, KeyError):
                continue

        filtered.append(point)

    return sorted(filtered, key=lambda p: p.get("timestamp", ""))

def generate_ascii_graph(data_points, metric="throughput_ops_per_sec", width=60, height=15):
    """Generate ASCII sparkline graph"""
    if not data_points:
        return "No data points available"

    # Extract metric values
    values = []
    labels = []
    for point in data_points:
        val = point.get("metrics", {}).get(metric)
        if val is not None:
            values.append(val)
            timestamp = point.get("timestamp", "")
            # Extract date from ISO timestamp
            date_str = timestamp.split("T")[0] if "T" in timestamp else timestamp
            labels.append(date_str[-5:])  # Last 5 chars (MM-DD)

    if not values:
        return f"No {metric} data available"

    # Normalize to graph height
    min_val = min(values)
    max_val = max(values)
    if min_val == max_val:
        normalized = [height // 2] * len(values)
    else:
        normalized = [
            int((v - min_val) / (max_val - min_val) * (height - 1))
            for v in values
        ]

    # Create graph
    graph = [[" " for _ in range(len(values))] for _ in range(height)]
    for x, y in enumerate(normalized):
        graph[height - 1 - y][x] = "█"

    # Format output
    result = f"\n{metric.replace('_', ' ').title()}\n"
    result += f"Range: {min_val:.2f} to {max_val:.2f}\n\n"

    for row in graph:
        result += "│ " + "".join(row) + "\n"

    result += "└─" + "─" * len(values) + "\n"
    if len(labels) > 5:
        step = max(1, len(labels) // 5)
        result += "  " + " ".join([labels[i] for i in range(0, len(labels), step)]) + "\n"
    else:
        result += "  " + " ".join(labels) + "\n"

    return result

def generate_summary_table(data_points):
    """Generate summary statistics table"""
    if not data_points:
        return "No data points available"

    # Group by algorithm and profile
    grouped = defaultdict(list)
    for point in data_points:
        key = f"{point.get('algorithm')} ({point.get('profile')})"
        grouped[key].append(point)

    result = "\n## Summary Statistics\n\n"
    result += "| Algorithm (Profile) | Latest | Previous | Delta % | Trend |\n"
    result += "|---|---|---|---|---|\n"

    for key in sorted(grouped.keys()):
        points = grouped[key]
        if len(points) < 2:
            continue

        latest = points[-1].get("metrics", {}).get("throughput_ops_per_sec")
        previous = points[-2].get("metrics", {}).get("throughput_ops_per_sec") if len(points) > 1 else None

        if latest is None or previous is None:
            continue

        delta_pct = ((latest - previous) / previous * 100) if previous != 0 else 0
        trend = "📈" if delta_pct > 0 else "📉" if delta_pct < 0 else "➡️"

        result += f"| {key} | {latest:.1f} | {previous:.1f} | {delta_pct:+.1f}% | {trend} |\n"

    return result

def main():
    parser = argparse.ArgumentParser(description="Plot benchmark trends")
    parser.add_argument("--algorithm", help="Filter by algorithm name")
    parser.add_argument("--profile", help="Filter by profile (fast/balanced/quality)")
    parser.add_argument("--days", type=int, default=30, help="Show last N days (default: 30)")
    parser.add_argument("--metric", default="throughput_ops_per_sec",
                        help="Metric to plot (default: throughput_ops_per_sec)")
    parser.add_argument("--format", choices=["ascii", "json", "summary"], default="ascii",
                        help="Output format")
    args = parser.parse_args()

    trends = load_trends()
    if trends is None:
        return 1

    data_points = trends.get("data_points", [])
    if not data_points:
        print("No benchmark data available yet")
        return 1

    # Filter data
    filtered = filter_data_points(data_points, algorithm=args.algorithm, profile=args.profile, days=args.days)

    if not filtered:
        print(f"No data points found matching criteria")
        return 1

    # Generate output
    if args.format == "json":
        print(json.dumps(filtered, indent=2))
    elif args.format == "summary":
        print(generate_summary_table(filtered))
    else:  # ascii (default)
        algo_str = f" ({args.algorithm})" if args.algorithm else ""
        profile_str = f" - {args.profile} profile" if args.profile else ""
        print(f"\n## Benchmark Trends (last {args.days} days){algo_str}{profile_str}")
        print(generate_ascii_graph(filtered, metric=args.metric))
        print(generate_summary_table(filtered))

    return 0

if __name__ == "__main__":
    sys.exit(main())
