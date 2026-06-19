#!/bin/bash
# Stop gate: delegate to compiled Rust binary for speed.
# Falls back silently (allows stop) if binary is not yet built.
BIN="${CLAUDE_PROJECT_DIR:-$(pwd)}/target/release/wasm4pm-stop-ggen-drift"
[ -x "$BIN" ] && exec "$BIN" 2>/dev/null
exit 0
