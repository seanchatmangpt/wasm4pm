#!/usr/bin/env bash
# Apply wasm4pm Supabase migration + truex-ingest Edge Function to a running Docker Supabase stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"
EDGE_FUNCTIONS_DIR="${SUPABASE_EDGE_FUNCTIONS_DIR:-}"
MIGRATION="$ROOT/supabase/migrations/20260523000000_receipts.sql"

if [[ ! -f "$MIGRATION" ]]; then
  echo "[FAIL] Migration not found: $MIGRATION" >&2
  exit 1
fi

echo "[INFO] Applying migration to container: $DB_CONTAINER"
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$MIGRATION"

if [[ -n "$EDGE_FUNCTIONS_DIR" && -d "$EDGE_FUNCTIONS_DIR" ]]; then
  echo "[INFO] Installing truex-ingest Edge Function to: $EDGE_FUNCTIONS_DIR/truex-ingest"
  mkdir -p "$EDGE_FUNCTIONS_DIR/truex-ingest"
  cp "$ROOT/supabase/functions/truex-ingest/index.ts" "$EDGE_FUNCTIONS_DIR/truex-ingest/index.ts"
  if docker ps --format '{{.Names}}' | grep -qx supabase-edge-functions; then
    echo "[INFO] Restarting supabase-edge-functions"
    docker restart supabase-edge-functions >/dev/null
  fi
else
  echo "[WARN] SUPABASE_EDGE_FUNCTIONS_DIR not set — skip Edge Function install"
  echo "[WARN] Set e.g. SUPABASE_EDGE_FUNCTIONS_DIR=/path/to/volumes/functions"
fi

echo "[PASS] Supabase live setup complete"
