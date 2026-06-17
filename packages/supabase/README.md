# @wasm4pm/supabase

Remote persistence and offline-sync layer for wasm4pm. Pushes BLAKE3 receipts and TrueX conformance envelopes to a Supabase backend; buffers to a local queue when the network is unavailable.

## What it does

Every `wpm run` produces a cryptographic receipt (BLAKE3 hash chain) written to `.wasm4pm/receipts/`. This package uploads those receipts to a Supabase table so teams can query the full audit log across machines, CI runs, and deployments. It also handles TrueX envelopes — the conformance admission records that prove a process actually conformed to a declared model.

Three components work together:

| Component | Purpose |
|-----------|---------|
| **Command receipt sync** | Upserts local `.wasm4pm/receipts/*.json` to `wpm_command_receipts` (batch cap: 500) |
| **TrueX ingest** | Sends OCEL2 conformance envelopes to `truex_envelopes` via Supabase Edge Function or direct table insert |
| **Offline sync queue** | Buffers items to `.wasm4pm/sync-queue.json` when Supabase is unreachable; flushes on reconnect (max 5 attempts, then deadletter) |

## Installation

```bash
pnpm add @wasm4pm/supabase
```

## Configuration

Credentials are resolved from environment variables or `wasm4pm.toml`. Precedence: `WASM4PM_SUPABASE_*` → `SUPABASE_*` → file config.

```bash
# Required
WASM4PM_SUPABASE_URL=https://your-project.supabase.co
WASM4PM_SUPABASE_ANON_KEY=eyJ...

# Required for writes (RLS)
WASM4PM_SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Or in `wasm4pm.toml`:

```toml
[integrations.supabase]
url = "https://your-project.supabase.co"
anonKey = "eyJ..."
serviceRoleKey = "eyJ..."          # optional; required for writes

[integrations.supabase.tables]     # optional overrides
commandReceipts = "wpm_command_receipts"
truexEnvelopes  = "truex_envelopes"
syncQueueDeadletter = "sync_queue_deadletter"
```

Table names must match `^[a-zA-Z_][a-zA-Z0-9_]*$` — arbitrary strings are rejected to prevent REST path traversal.

## Usage

### Sync local receipts

```ts
import { resolveSupabaseConfig, syncCommandReceipts } from '@wasm4pm/supabase';

const config = resolveSupabaseConfig();
const result = await syncCommandReceipts({ config });
console.log(`Synced: ${result.synced}, skipped: ${result.skipped}, errors: ${result.errors.length}`);
```

### Ingest a TrueX envelope

```ts
import { resolveSupabaseConfig, ingestTruexEnvelope, parseTruexEnvelope } from '@wasm4pm/supabase';

const config = resolveSupabaseConfig();
const envelope = parseTruexEnvelope(rawJson);
const result = await ingestTruexEnvelope({ config, envelope, preferEdgeFunction: true });
// result.via === 'edge_function' | 'direct_table'
```

### Flush the offline queue

```ts
import { resolveSupabaseConfig, flushSyncQueue } from '@wasm4pm/supabase';

const config = resolveSupabaseConfig();
const result = await flushSyncQueue({ config });
// result.processed / result.failed / result.acked
```

Items that fail 5 times are moved to the `sync_queue_deadletter` table and removed from the queue.

### Doctor check

```ts
import { resolveSupabaseConfig, runSupabaseDoctor } from '@wasm4pm/supabase';

const report = await runSupabaseDoctor(resolveSupabaseConfig());
// report.status: 'prepublish_only' | 'configured' | 'live_verified'
console.log(report.message);
```

`wpm doctor` surfaces the same report in the CLI.

**Doctor status progression:**

| Status | Meaning |
|--------|---------|
| `prepublish_only` | Credentials missing, unreachable, migrations not applied, or service role absent |
| `configured` | Credentials present, reachable, migrations applied, service role configured |
| `live_verified` | Full smoke test passed; runtime receipt written to `.wasm4pm/receipts/supabase_runtime.receipt.json` |

Pass `{ live: true }` to trigger the full smoke test (upsert probe receipt → read back → deadletter write → Edge Function ingest). The result is a BLAKE3-hashed runtime receipt stored at `.wasm4pm/receipts/supabase_runtime.receipt.json`.

## Required migrations

Three tables must exist before writes will succeed:

```sql
-- wpm_command_receipts: one row per wpm run
create table wpm_command_receipts (
  run_id        text primary key,
  command       text not null,
  input_hash    text not null,
  output_hash   text not null,
  status        text not null,
  payload       jsonb,
  git_commit    text,
  inserted_at   timestamptz default now()
);

-- truex_envelopes: OCEL2 conformance admission records
create table truex_envelopes (
  receipt_hash       text primary key,
  session_id         text not null,
  admission_status   text not null,
  ocel2_batch_hash   text not null,
  truex_profile      text,
  trace_id           text,
  inserted_at        timestamptz default now()
);

-- sync_queue_deadletter: items that exhausted retry budget
create table sync_queue_deadletter (
  queue_item_id  text primary key,
  kind           text not null,
  error_code     text not null,
  error_message  text,
  payload_hash   text not null,
  recorded_at    timestamptz default now()
);
```

Apply with `supabase db push` or by running the SQL directly in the Supabase dashboard.

## Error codes

| Code | Meaning |
|------|---------|
| `SUPABASE_CREDENTIALS_MISSING` | `url` or `anonKey` not found in env or config |
| `SUPABASE_SERVICE_ROLE_MISSING` | Write operation attempted without service role key |
| `SUPABASE_UNREACHABLE` | Network error during ping |
| `RECEIPT_DUPLICATE` | `run_id` already exists (upsert is idempotent; non-fatal) |
| `MIGRATION_MISSING` | Required table does not exist |
| `SYNC_QUEUE_EMPTY` | Flush called with nothing pending |

## License

[BUSL-1.1](../../LICENSE) — converts to AGPL-3.0 after the Change Date. See [COMMERCIAL_LICENSE.md](../../COMMERCIAL_LICENSE.md) for commercial use.
