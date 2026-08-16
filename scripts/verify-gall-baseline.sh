#!/usr/bin/env bash
# Replays the commands_run[] list from receipts/W4PM-GALL-000-baseline.json
# against live repo state. This is the W4PM-GALL-000 positive witness: a
# fresh process can regenerate/verify the status matrix without consulting
# CLAUDE.md or any prior conversation — only this JSON and live commands.
#
# Exit 0: revisions and all commands_run entries match. Exit 1: drift found.
set -uo pipefail

RECEIPT="${1:-$(dirname "$0")/../receipts/W4PM-GALL-000-baseline.json}"
if [[ ! -f "$RECEIPT" ]]; then
  echo "FATAL: receipt not found at $RECEIPT" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "FATAL: jq is required" >&2
  exit 2
fi

drift=0

echo "== Repo revision drift =="
repos=$(jq -r '.repos | keys[]' "$RECEIPT")
for repo in $repos; do
  path=$(jq -r ".repos[\"$repo\"].path" "$RECEIPT")
  recorded_rev=$(jq -r ".repos[\"$repo\"].revision" "$RECEIPT")
  recorded_uncommitted=$(jq -r ".repos[\"$repo\"].uncommitted_files" "$RECEIPT")

  if [[ ! -d "$path/.git" ]]; then
    echo "  SKIP  $repo: $path is not a git repo (or not present)"
    continue
  fi

  actual_rev=$(git -C "$path" rev-parse HEAD 2>/dev/null)
  actual_uncommitted=$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

  if [[ "$actual_rev" != "$recorded_rev" ]]; then
    echo "  DRIFT $repo: revision recorded=$recorded_rev actual=$actual_rev"
    drift=1
  elif [[ "$actual_uncommitted" != "$recorded_uncommitted" ]]; then
    echo "  NOTE  $repo: uncommitted_files recorded=$recorded_uncommitted actual=$actual_uncommitted (revision matches; working tree has moved since receipt was written — expected during active work, not necessarily drift)"
  else
    echo "  OK    $repo: revision + uncommitted count match"
  fi
done

echo ""
echo "== commands_run replay (wasm4pm and ggen only — the two repos with recorded commands) =="
for repo in wasm4pm ggen; do
  path=$(jq -r ".repos[\"$repo\"].path" "$RECEIPT")
  count=$(jq -r ".repos[\"$repo\"].commands_run | length" "$RECEIPT")
  for i in $(seq 0 $((count - 1))); do
    cmd=$(jq -r ".repos[\"$repo\"].commands_run[$i].command" "$RECEIPT")
    cwd_rel=$(jq -r ".repos[\"$repo\"].commands_run[$i].cwd" "$RECEIPT")
    recorded_exit=$(jq -r ".repos[\"$repo\"].commands_run[$i].exit_code" "$RECEIPT")

    case "$cwd_rel" in
      "wasm4pm (targeting wasm4pm's ggen.toml)") full_cwd="/Users/sac/wasm4pm" ;;
      .) full_cwd="$path" ;;
      *) full_cwd="$path/$cwd_rel" ;;
    esac

    if [[ ! -d "$full_cwd" ]]; then
      echo "  SKIP  [$repo] '$cmd': cwd $full_cwd does not exist"
      continue
    fi

    actual_exit=0
    (cd "$full_cwd" && eval "$cmd" >/tmp/gall-baseline-replay.$$.log 2>&1) || actual_exit=$?
    if [[ "$actual_exit" == "$recorded_exit" ]]; then
      echo "  OK    [$repo] '$cmd': exit $actual_exit matches recorded"
    else
      echo "  DRIFT [$repo] '$cmd': recorded exit=$recorded_exit actual exit=$actual_exit (log: /tmp/gall-baseline-replay.$$.log)"
      drift=1
    fi
  done
done

echo ""
if [[ "$drift" -eq 0 ]]; then
  echo "RESULT: no drift detected"
else
  echo "RESULT: drift detected — see above"
fi
exit "$drift"
