#!/usr/bin/env python3
"""pm4py parity oracle for wasm4pm conformance metrics.

Runs pm4py 2.7.x reference implementations of token-based replay fitness,
ETConformance precision, and alignment-based fitness against an event log
(XES) and Petri net (PNML), or discovers the net from the log. Emits a
deterministic JSON document on stdout.

No network. Deterministic given identical inputs and pm4py version.

Usage:
    python3 oracle.py --log LOG.xes [--net NET.pnml | --discover inductive|alphaminer]
                      [--activity-key concept:name] [--out result.json]
"""

import argparse
import json
import sys

import pm4py


def load_log(path: str, activity_key: str):
    log = pm4py.read_xes(path, return_legacy_log_object=True)
    return log


def load_or_discover_net(args, log):
    if args.net:
        net, im, fm = pm4py.read_pnml(args.net)
        provenance = {"source": "pnml", "path": args.net}
    elif args.discover == "inductive":
        net, im, fm = pm4py.discover_petri_net_inductive(
            log, activity_key=args.activity_key
        )
        provenance = {"source": "discovered", "algorithm": "inductive"}
    else:  # alphaminer
        net, im, fm = pm4py.discover_petri_net_alpha(log, activity_key=args.activity_key)
        provenance = {"source": "discovered", "algorithm": "alphaminer"}
    return net, im, fm, provenance


def main():
    ap = argparse.ArgumentParser(description="pm4py conformance parity oracle")
    ap.add_argument("--log", required=True)
    ap.add_argument("--net", default=None)
    ap.add_argument("--discover", choices=["inductive", "alphaminer"], default=None)
    ap.add_argument("--activity-key", default="concept:name")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if bool(args.net) == bool(args.discover):
        ap.error("exactly one of --net or --discover is required")

    log = load_log(args.log, args.activity_key)
    net, im, fm, provenance = load_or_discover_net(args, log)

    # --- token-based replay fitness + diagnostics -----------------------
    fitness_tbr = pm4py.fitness_token_based_replay(
        log, net, im, fm, activity_key=args.activity_key
    )
    diag = pm4py.conformance_diagnostics_token_based_replay(
        log, net, im, fm, activity_key=args.activity_key
    )
    n_traces = len(diag)
    n_fit = sum(1 for d in diag if d.get("trace_is_fit"))
    total_missing = sum(d["missing_tokens"] for d in diag)
    total_remaining = sum(d["remaining_tokens"] for d in diag)
    total_consumed = sum(d["consumed_tokens"] for d in diag)
    total_produced = sum(d["produced_tokens"] for d in diag)

    # --- ETConformance precision ----------------------------------------
    precision = pm4py.precision_token_based_replay(
        log, net, im, fm, activity_key=args.activity_key
    )

    # --- alignment-based fitness ----------------------------------------
    fitness_align = pm4py.fitness_alignments(
        log, net, im, fm, activity_key=args.activity_key
    )
    align_diag = pm4py.conformance_diagnostics_alignments(
        log, net, im, fm, activity_key=args.activity_key
    )
    total_log_moves = sum(1 for a in align_diag for m in a["alignment"] if m[0] == ">>")
    total_model_moves = sum(1 for a in align_diag for m in a["alignment"] if m[1] == ">>")

    result = {
        "oracle": {
            "tool": "pm4py",
            "version": pm4py.__version__,
            "deterministic": True,
            "network": False,
        },
        "inputs": {
            "log": args.log,
            "net": provenance,
            "activity_key": args.activity_key,
            "traces": n_traces,
            "events": sum(len(t) for t in log),
        },
        "token_based_replay": {
            "log_fitness": fitness_tbr["log_fitness"],
            "percentage_fitting_traces": fitness_tbr["percentage_of_fitting_traces"],
            "average_fitness": fitness_tbr["average_trace_fitness"],
            "traces_fitting": n_fit,
            "traces_total": n_traces,
            "tokens_missing": total_missing,
            "tokens_remaining": total_remaining,
            "tokens_consumed": total_consumed,
            "tokens_produced": total_produced,
        },
        "etconformance_precision": {"precision": precision},
        "alignment_fitness": {
            "log_fitness": fitness_align["log_fitness"],
            "average_fitness": fitness_align["average_trace_fitness"],
            "percentage_fitting_traces": fitness_align["percentage_of_fitting_traces"],
            "total_log_moves": total_log_moves,
            "total_model_moves": total_model_moves,
        },
    }

    text = json.dumps(result, indent=2, sort_keys=True)
    if args.out:
        with open(args.out, "w") as f:
            f.write(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
