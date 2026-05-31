import { hashJsonString } from '@wasm4pm/contracts';
import {
  assertSupabaseResponse,
  createSupabaseWriteClient,
  type Wasm4pmSupabaseClient,
} from './client.js';
import { SupabaseIntegrationError, type SupabaseIntegrationConfig } from './config.js';

export const TRUEX_ADMITTED = 'ReceiptAdmitted';

export interface TruexEnvelope {
  truex_profile?: string;
  trace_id?: string;
  span_id?: string;
  session_id: string;
  device_id?: string;
  admission_status: string;
  equivalence_class?: string;
  expected_path_hash?: string;
  ocel2_batch_hash: string;
  receipt_hash: string;
  ocel2?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TruexIngestResult {
  receipt_hash: string;
  inserted: boolean;
  via: 'edge_function' | 'direct_upsert';
}

const REQUIRED_ENVELOPE_FIELDS = [
  'session_id',
  'admission_status',
  'ocel2_batch_hash',
  'receipt_hash',
] as const;

export function parseTruexEnvelope(raw: string | Record<string, unknown>): TruexEnvelope {
  let envelope: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      throw new SupabaseIntegrationError(
        'RECEIPT_REFUSED',
        `TrueX envelope is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  } else {
    envelope = raw;
  }

  for (const field of REQUIRED_ENVELOPE_FIELDS) {
    if (!envelope[field] || typeof envelope[field] !== 'string') {
      // RECEIPT_REFUSED is the correct code for a client-side malformed envelope —
      // SUPABASE_INSERT_FAILED is wrong here because nothing has been sent to Supabase yet.
      throw new SupabaseIntegrationError(
        'RECEIPT_REFUSED',
        `TrueX envelope missing or invalid required field "${field}" — envelope refused before ingest`
      );
    }
  }

  return envelope as TruexEnvelope;
}

/** Refuse non-admitted envelopes before any network call. */
export function assertAdmittedEnvelope(envelope: TruexEnvelope): void {
  if (envelope.admission_status !== TRUEX_ADMITTED) {
    throw new SupabaseIntegrationError(
      'RECEIPT_REFUSED',
      `Envelope admission_status is "${envelope.admission_status}" — only ${TRUEX_ADMITTED} may be ingested`
    );
  }
}

export async function ingestTruexEnvelope(options: {
  config: SupabaseIntegrationConfig;
  envelope: TruexEnvelope;
  client?: Wasm4pmSupabaseClient;
  preferEdgeFunction?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<TruexIngestResult> {
  assertAdmittedEnvelope(options.envelope);

  const preferEdge =
    options.preferEdgeFunction !== false && Boolean(options.config.edgeFunctionTruexIngest);

  if (preferEdge) {
    return ingestViaEdgeFunction(options);
  }

  return ingestViaDirectUpsert(options);
}

async function ingestViaEdgeFunction(options: {
  config: SupabaseIntegrationConfig;
  envelope: TruexEnvelope;
  fetchImpl?: typeof fetch;
}): Promise<TruexIngestResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  const url = `${options.config.url.replace(/\/$/, '')}/functions/v1/${options.config.edgeFunctionTruexIngest}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.config.anonKey}`,
        apikey: options.config.anonKey,
      },
      body: JSON.stringify(options.envelope),
    });
  } catch (err) {
    throw new SupabaseIntegrationError(
      'SUPABASE_UNREACHABLE',
      `Edge function unreachable: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (response.status === 409 || body.code === 'RECEIPT_DUPLICATE') {
    throw new SupabaseIntegrationError(
      'RECEIPT_DUPLICATE',
      String(body.message ?? 'Envelope already ingested')
    );
  }

  if (!response.ok) {
    if (body.code === 'RECEIPT_REFUSED') {
      throw new SupabaseIntegrationError(
        'RECEIPT_REFUSED',
        String(body.message ?? 'Envelope refused by edge function')
      );
    }
    throw new SupabaseIntegrationError(
      'SUPABASE_INSERT_FAILED',
      String(body.message ?? `Edge function returned ${response.status}`)
    );
  }

  return {
    receipt_hash: String(body.receipt_hash ?? options.envelope.receipt_hash),
    inserted: Boolean(body.inserted ?? true),
    via: 'edge_function',
  };
}

async function ingestViaDirectUpsert(options: {
  config: SupabaseIntegrationConfig;
  envelope: TruexEnvelope;
  client?: Wasm4pmSupabaseClient;
}): Promise<TruexIngestResult> {
  const client = options.client ?? createSupabaseWriteClient(options.config);
  const table = options.config.tables.truexEnvelopes;

  const result = await client.from(table).upsert(
    {
      receipt_hash: options.envelope.receipt_hash,
      session_id: options.envelope.session_id,
      device_id: options.envelope.device_id ?? null,
      admission_status: options.envelope.admission_status,
      ocel2_batch_hash: options.envelope.ocel2_batch_hash,
      expected_path_hash: options.envelope.expected_path_hash ?? null,
      envelope: options.envelope,
      verified_at: new Date().toISOString(),
    },
    { onConflict: 'receipt_hash' }
  );

  assertSupabaseResponse(result, `upsert truex envelope ${options.envelope.receipt_hash}`);

  return {
    receipt_hash: options.envelope.receipt_hash,
    inserted: true,
    via: 'direct_upsert',
  };
}

export function envelopePayloadHash(envelope: TruexEnvelope): string {
  return hashJsonString(JSON.stringify(envelope));
}
