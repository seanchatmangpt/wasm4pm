#!/bin/bash
# PostToolUse Evidence Emitter - Record work unit metadata

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/utils.sh"

work_unit_id="wu-$(date -u +%Y%m%d%H%M%S)-$$-${RANDOM}"
timestamp=$(get_timestamp)
session_id=$(get_session_id)
git_diff_hash=$(get_git_diff_hash)

evidence_dir=$(ensure_evidence_dir)
evidence_file="${evidence_dir}/events.jsonl"

record=$(jq -n \
  --arg wuid "$work_unit_id" \
  --arg ts "$timestamp" \
  --arg session "$session_id" \
  --arg hash "$git_diff_hash" \
  '{
    work_unit_id: $wuid,
    timestamp: $ts,
    session_id: $session,
    git_diff_hash: $hash
  }')

append_jsonl "$evidence_file" "$record"
exit 0
