#!/bin/bash
# ConfigChange hook - Audit configuration changes

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/utils.sh"

evidence_dir=$(ensure_evidence_dir)
config_log="${evidence_dir}/config_changes.jsonl"

record=$(jq -n \
  --arg ts "$(get_timestamp)" \
  '{
    timestamp: $ts,
    event: "config_change"
  }')

append_jsonl "$config_log" "$record"
exit 0
