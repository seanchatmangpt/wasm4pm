#!/bin/bash
# PostToolUse OTEL Coverage Enforcement
# After editing Rust/TS source files: warns if new pub fn / export function
# declarations lack an OTEL span or instrumentation call. Advisory (exit 0).

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""

# Only fire for file edits
case "$TOOL_NAME" in Edit|Write) ;; *) exit 0 ;; esac

# Only fire for source files (not tests, not hooks, not docs)
echo "$FILE_PATH" | grep -qE '\.(rs|ts)$' || exit 0
echo "$FILE_PATH" | grep -qE '\.test\.|\.spec\.|__tests__|/hooks/|/dist/|/pkg/' && exit 0

ABS_PATH="${CLAUDE_PROJECT_DIR:-.}/$FILE_PATH"
[ -f "$ABS_PATH" ] || ABS_PATH="$FILE_PATH"
[ -f "$ABS_PATH" ] || exit 0

# Detect public function declarations
if echo "$FILE_PATH" | grep -q '\.rs$'; then
  # Rust: look for `pub fn` or `pub async fn` outside cfg(test)
  PUB_FNS=$(grep -n "^\s*pub\( async\)\? fn " "$ABS_PATH" 2>/dev/null | grep -v "//\|cfg(test)" | wc -l | tr -d ' ')
  SPAN_CALLS=$(grep -cE "span|emit_event|create_span|start_span|instrument" "$ABS_PATH" 2>/dev/null) || SPAN_CALLS=0
else
  # TypeScript: look for exported functions
  PUB_FNS=$(grep -nE "^export (async )?function |^export const [a-z].*=.*=>" "$ABS_PATH" 2>/dev/null | wc -l | tr -d ' ')
  SPAN_CALLS=$(grep -cE "createSpan|startSpan|emitEvent|Instrumentation\.|tracer\." "$ABS_PATH" 2>/dev/null) || SPAN_CALLS=0
fi

[ "$PUB_FNS" -eq 0 ] && exit 0

if [ "$SPAN_CALLS" -eq 0 ] && [ "$PUB_FNS" -gt 0 ]; then
  echo "⚠️  OTEL COVERAGE: $FILE_PATH has $PUB_FNS public function(s) but no OTEL spans"
  echo "   Add span instrumentation to satisfy the 100% OTEL coverage requirement."
  echo "   Rust: use #[instrument] or span!(Level::INFO, \"...\") from tracing crate"
  echo "   TypeScript: use Instrumentation.createComputeEvent() from @wasm4pm/observability"
fi

exit 0
