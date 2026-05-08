#!/bin/bash
# Shared utility library for Claude Code hooks

get_session_id() {
  echo "session-$(date -u +%Y%m%d%H%M%S)-$$"
}

get_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

validate_json() {
  echo "$1" | jq empty 2>/dev/null
  return $?
}

ensure_evidence_dir() {
  local evidence_dir=".claude/evidence"
  mkdir -p "$evidence_dir"
  echo "$evidence_dir"
}

append_jsonl() {
  local file="$1"
  local record="$2"
  mkdir -p "$(dirname "$file")"
  echo "$record" >> "$file"
}

is_protected_path() {
  local path="$1"
  local -a protected=(
    "\.claude/hooks/"
    "\.claude/settings.json"
    "wasm4pm/pkg/"
  )
  for pattern in "${protected[@]}"; do
    if [[ "$path" =~ $pattern ]]; then return 0; fi
  done
  return 1
}

get_git_diff_hash() {
  if git rev-parse --git-dir > /dev/null 2>&1; then
    git diff --cached --binary | sha256sum | awk '{print $1}'
  else
    echo "no-git"
  fi
}

extract_tool_name() {
  echo "$1" | jq -r '.tool_name // "unknown"'
}

log_event() {
  local level="$1"
  local msg="$2"
  echo "[$level] $(get_timestamp) $msg" >&2
}
