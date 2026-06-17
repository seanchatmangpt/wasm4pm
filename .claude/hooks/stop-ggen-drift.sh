#!/bin/bash
# Stop gate: delegate to compiled Rust binary for speed.
# Falls back silently (allows stop) if binary is not yet built.
exec "${CLAUDE_PROJECT_DIR}/target/release/wasm4pm-stop-ggen-drift" 2>/dev/null
