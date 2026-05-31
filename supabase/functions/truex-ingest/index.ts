/**
 * Supabase Edge Function: truex-ingest
 * Validates TrueX envelope schema and admission status, then upserts to truex_envelopes.
 *
 * Deploy: supabase functions deploy truex-ingest
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ADMITTED = 'ReceiptAdmitted';
const REQUIRED = ['session_id', 'admission_status', 'ocel2_batch_hash', 'receipt_hash'] as const;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: 'POST only' }, 405);
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = await req.json();
  } catch {
    return jsonResponse({ code: 'MALFORMED_JSON', message: 'Invalid JSON body' }, 400);
  }

  for (const field of REQUIRED) {
    if (!envelope[field] || typeof envelope[field] !== 'string') {
      return jsonResponse(
        { code: 'SCHEMA_VIOLATION', message: `Missing required field: ${field}` },
        400
      );
    }
  }

  if (envelope.admission_status !== ADMITTED) {
    return jsonResponse(
      {
        code: 'RECEIPT_REFUSED',
        message: `Only ${ADMITTED} envelopes may be ingested`,
        status: envelope.admission_status,
      },
      422
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ code: 'CONFIG_MISSING', message: 'Supabase env not configured' }, 500);
  }

  const client = createClient(supabaseUrl, serviceKey);
  const receiptHash = envelope.receipt_hash as string;

  const { error } = await client.from('truex_envelopes').upsert(
    {
      receipt_hash: receiptHash,
      session_id: envelope.session_id,
      device_id: envelope.device_id ?? null,
      admission_status: envelope.admission_status,
      ocel2_batch_hash: envelope.ocel2_batch_hash,
      expected_path_hash: envelope.expected_path_hash ?? null,
      envelope,
      verified_at: new Date().toISOString(),
    },
    { onConflict: 'receipt_hash' }
  );

  if (error) {
    if (/duplicate|unique|23505/i.test(error.message)) {
      return jsonResponse(
        { code: 'RECEIPT_DUPLICATE', message: error.message, receipt_hash: receiptHash },
        409
      );
    }
    return jsonResponse({ code: 'INSERT_FAILED', message: error.message }, 500);
  }

  return jsonResponse({ receipt_hash: receiptHash, inserted: true });
});
