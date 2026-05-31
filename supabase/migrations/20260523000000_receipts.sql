-- wasm4pm Supabase integration: command receipts, TrueX envelopes, sync deadletter

create table if not exists public.wpm_command_receipts (
  run_id text primary key,
  command text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text not null check (output_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('success', 'partial', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  git_commit text,
  inserted_at timestamptz not null default now()
);

create index if not exists wpm_command_receipts_inserted_at_idx
  on public.wpm_command_receipts (inserted_at desc);

create table if not exists public.truex_envelopes (
  receipt_hash text primary key,
  session_id text not null,
  device_id text,
  admission_status text not null,
  ocel2_batch_hash text not null,
  expected_path_hash text,
  envelope jsonb not null,
  verified_at timestamptz not null default now()
);

create index if not exists truex_envelopes_session_id_idx
  on public.truex_envelopes (session_id);

create table if not exists public.sync_queue_deadletter (
  id bigint generated always as identity primary key,
  queue_item_id text not null,
  kind text not null,
  error_code text not null,
  error_message text not null,
  payload_hash text not null,
  recorded_at timestamptz not null default now()
);

alter table public.wpm_command_receipts enable row level security;
alter table public.truex_envelopes enable row level security;
alter table public.sync_queue_deadletter enable row level security;

-- Authenticated users may insert/read their org rows (extend with tenant_id when multi-tenant)
create policy "authenticated_insert_command_receipts"
  on public.wpm_command_receipts for insert to authenticated
  with check (true);

create policy "authenticated_select_command_receipts"
  on public.wpm_command_receipts for select to authenticated
  using (true);

create policy "authenticated_insert_truex_envelopes"
  on public.truex_envelopes for insert to authenticated
  with check (admission_status = 'ReceiptAdmitted');

create policy "authenticated_select_truex_envelopes"
  on public.truex_envelopes for select to authenticated
  using (true);

create policy "service_role_all_command_receipts"
  on public.wpm_command_receipts for all to service_role
  using (true) with check (true);

create policy "service_role_all_truex_envelopes"
  on public.truex_envelopes for all to service_role
  using (true) with check (true);

create policy "service_role_all_deadletter"
  on public.sync_queue_deadletter for all to service_role
  using (true) with check (true);
