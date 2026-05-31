# Unverified / Stale Documentation Archive

Documents moved here document CLI commands, flags, or schemas that **do not exist** in the current `wpm` binary, or contain exit-code / receipt shapes that were never bound to runtime evidence.

**Do not treat these as user-facing documentation.** They are retained for historical reference only.

## Archived files

| Original path | Reason | Use instead |
|---------------|--------|-------------|
| `tutorials/advanced_benchmarking.md` | `wpm compare suite`, `wpm compare export` not implemented | `wpm compare dfg,heuristic,inductive -i log.xes` — [cli_commands.md](../../../docs/reference/cli_commands.md) |
| `tutorials/custom_event_logs.md` | `wpm import csv` not implemented | Load XES via `wpm run log.xes` — [getting_started.md](../../../docs/tutorials/getting_started.md) |
| `how-to/export_bpmn.md` | `wpm export bpmn`, wrong `wpm run` syntax | `wpm run log.xes -a inductive`, `bpmn_import` via [algorithms.md](../../../docs/reference/algorithms.md) |
| `how-to/ml_clustering.md` | `wpm ml extract-features`, wrong cluster flags | `wpm ml cluster -i log.xes --k 5` — [cli_commands.md](../../../docs/reference/cli_commands.md) |
| `reference/error_codes.md` | Exit codes do not match `apps/wasm4pm/src/exit-codes.ts` | `wpm --help`, [AGENTS.md](../../../AGENTS.md) |
| `reference/receipt_format.md` | Receipt JSON schema unverified against disk artifacts | `wpm results --last --verify`, release certificates under `artifacts/release/` |
| `reference/telemetry_spans.md` | Span names unverified against OTEL instrumentation | [configure_observability.md](../../../docs/how-to/configure_observability.md) |
| `explanation/typestate_enforcement.md` | References `wpm results --export` (not implemented) | [architecture_overview.md](../../../docs/explanation/architecture_overview.md), [AGENTS.md](../../../AGENTS.md) |

## Active documentation hub

See [docs/INDEX.md](../../../docs/INDEX.md).
