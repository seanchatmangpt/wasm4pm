#!/bin/bash
set -e
echo "Generating TypeScript types from Rust..."
cargo test -p wasm4pm ts_rs_export --features bcinr
# Assuming ts-rs output is captured in a known location
# cp target/ts-rs/*.tswasm4pm/wasm4pm/src/
echo "Type definitions updated."
