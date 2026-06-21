# Supabase Integration

Sync **wpm command receipts** and **TrueX OCEL 2.0 envelopes** to a Supabase project with optional offline queue flush and Edge Function ingest.

## Prerequisites

1. [Supabase CLI](https://supabase.com/docs/guides/cli) installed
2. Node.js ≥ 20 and wasm4pm built: `wasm-pack build --target nodejs --out-dir pkg -- --features wasm` (run from `crates/wasm4pm-cognition/`) or `pnpm build` from the repo root
3. A Supabase project (local or cloud)

## 1. Apply database migrations

From the repo root:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates:

| Table | Purpose |
|-------|---------|
| `wpm_command_receipts` | BLAKE3-anchored wpm command receipts |
| `truex_envelopes` | Admitted TrueX OCEL 2.0 envelopes |
| `sync_queue_deadletter` | Failed offline sync attempts |

Row Level Security (RLS) is enabled. Authenticated users may insert admitted TrueX envelopes; service role bypasses RLS for Edge Functions.

## 2. Deploy Edge Function

```bash
supabase functions deploy truex-ingest
```

The function validates required envelope fields, rejects non-`ReceiptAdmitted` payloads with `RECEIPT_REFUSED`, and upserts into `truex_envelopes`.

## 3. Configure credentials

Set environment variables (or add to `wasm4pm.toml`):

```bash
export WASM4PM_SUPABASE_URL="https://<project-ref>.supabase.co"
export WASM4PM_SUPABASE_ANON_KEY="<anon-key>"
# Required for receipt sync, sync-queue flush, and deadletter writes
export WASM4PM_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

**Key rule:** anon key = read probes and Edge Function invocation; service role key = server-side receipt upsert/deadletter/sync-queue writes.

TOML example:

```toml
[integrations.supabase]
url = "https://<project-ref>.supabase.co"
anonKey = "<anon-key>"
edgeFunctionTruexIngest = "truex-ingest"
```

## 4. Sync wpm command receipts

After running discovery commands (`wpm run`, `wpm compare`, etc.), receipts land in `.wasm4pm/receipts/`:

```bash
wpm supabase sync-receipts --dry-run
wpm supabase sync-receipts --format json
```

Each row stores `run_id`, `command`, BLAKE3 hashes, full JSON `payload`, and optional `git_commit`.

## 5. Verify and ingest TrueX envelopes

**Two-step (explicit):**

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
wpm supabase ingest-truex examples/out/truex_ocel2_valid.json
```

**One-step (verify + ingest):**

```bash
wpm truex verify examples/out/truex_ocel2_valid.json --ingest
```

Flow:

1. WASM `truex_verify_receipt` (authoritative cryptographic verify)
2. Edge Function `truex-ingest` (schema + admission gate)
3. Postgres row in `truex_envelopes`

Refused envelopes (`truex_ocel2_forged.json`) must fail with `RECEIPT_REFUSED` — never silently ingested.

See [Truex Receipt Verification](../tutorials/truex_receipts.md) and the [OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md).

## 6. Offline sync queue

Mobile or edge clients can enqueue payloads locally in `.wasm4pm/sync-queue.json` using `@wasm4pm/supabase` `SyncQueue`, then flush when online:

```bash
wpm supabase sync-queue
```

Failed items are recorded in `sync_queue_deadletter` with error codes.

## 7. Health check

```bash
wpm supabase doctor --format json
wpm supabase doctor --live --format json   # live write + Edge probes + runtime receipt
```

Doctor `status` (hard distinction for consumers such as ZoeOS):

| Status | Meaning | ZoeOS may trust Supabase runtime? |
|--------|---------|-----------------------------------|
| `prepublish_only` | Wiring/mock only, or missing credentials/migrations/service role, or no runtime receipt | **No** |
| `configured` | Reachable, migrations applied, service role present — writes *may* work but not proven | **No** |
| `live_verified` | Valid `supabase_runtime.receipt.json` on disk for this Supabase host | **Yes** |

Mock tests prove wiring. Live Supabase smoke proves runtime authority.

## Verification boundaries

| Layer | Checks |
|-------|--------|
| **WASM (`wpm truex verify`)** | Full JCS-OCEL canonicalization + BLAKE3 receipt chain |
| **Edge Function** | Required fields, `ReceiptAdmitted` only, upsert idempotency |
| **CLI sync** | Receipt schema (BLAKE3 hex-64), typed Supabase errors |

## Typed error codes

| Code | Meaning |
|------|---------|
| `SUPABASE_CREDENTIALS_MISSING` | URL or anon key not configured |
| `SUPABASE_SERVICE_ROLE_MISSING` | Service role key required for server-side writes |
| `SUPABASE_AUTH_FAILED` | Invalid API key |
| `SUPABASE_UNREACHABLE` | Network or project unavailable |
| `SUPABASE_INSERT_FAILED` | Insert/upsert error |
| `RECEIPT_REFUSED` | Envelope failed WASM or Edge admission |
| `RECEIPT_DUPLICATE` | Idempotent conflict on `receipt_hash` / `run_id` |
| `SYNC_QUEUE_EMPTY` | Nothing to flush |
| `MIGRATION_MISSING` | Tables not created — run `supabase db push` |

## Local development smoke test

`supabase start` may fail on Colima (docker.sock mount) or when default ports (54321–54323) are taken. Two supported paths:

### A. External Docker Compose stack (ZoeOS / self-hosted)

Against a running stack (Kong on port 8000 is common):

```bash
export SUPABASE_DB_CONTAINER=supabase-db
export SUPABASE_EDGE_FUNCTIONS_DIR=/path/to/your/supabase/volumes/functions
bash scripts/examples/supabase-live-setup.sh

export WASM4PM_SUPABASE_URL="http://127.0.0.1:8000"
export WASM4PM_SUPABASE_ANON_KEY="<anon-key>"
export WASM4PM_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
npx tsx scripts/examples/supabase-smoke.ts
# or: wpm supabase doctor --live --format json
```

### B. Supabase CLI local project (wasm4pm-local)

Default ports 54321–54323 often conflict with other local Supabase projects. This repo uses **54421–54423** and disables analytics/inbucket for Colima compatibility:

```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock   # Colima only
supabase start          # API http://127.0.0.1:54421
supabase functions serve truex-ingest --no-verify-jwt &
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export WASM4PM_SUPABASE_URL="$API_URL"
export WASM4PM_SUPABASE_ANON_KEY="$ANON_KEY"
export WASM4PM_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
npx tsx scripts/examples/supabase-smoke.ts
```

On success, emits `.wasm4pm/receipts/supabase_runtime.receipt.json` with `status: live_verified` and a recomputable `receipt_hash`. Doctor then reports `status: live_verified`.

**ZoeOS rule:** consume only `live_verified`, not `configured` or `prepublish_only`.

## Package API

Programmatic use:

```typescript
import {
  resolveSupabaseConfig,
  syncCommandReceipts,
  ingestTruexEnvelope,
  SyncQueue,
} from '@wasm4pm/supabase';
```

Canonical OCEL serialization lives in `@wasm4pm/contracts`:

```typescript
import { canonicalStringify } from '@wasm4pm/contracts';
```
