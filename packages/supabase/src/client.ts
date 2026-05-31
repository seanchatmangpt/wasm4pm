import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  resolveSupabaseConfig,
  SupabaseIntegrationError,
  type SupabaseIntegrationConfig,
} from './config.js';

export type Wasm4pmSupabaseClient = SupabaseClient;

let cached: { key: string; client: Wasm4pmSupabaseClient } | undefined;

function cacheKey(config: SupabaseIntegrationConfig, useServiceRole: boolean): string {
  const key = useServiceRole && config.serviceRoleKey ? config.serviceRoleKey : config.anonKey;
  return `${config.url}|${key.slice(0, 8)}|${useServiceRole}`;
}

/** Anon-key client for read probes and Edge Function invocation. */
export function createSupabaseReadClient(config: SupabaseIntegrationConfig): Wasm4pmSupabaseClient {
  return createSupabaseClient(config, { useServiceRole: false });
}

/** Service-role client for server-side upserts (receipt sync, deadletter). */
export function createSupabaseWriteClient(config: SupabaseIntegrationConfig): Wasm4pmSupabaseClient {
  return createSupabaseClient(config, { useServiceRole: true });
}

export function assertServiceRoleConfigured(
  config: SupabaseIntegrationConfig,
  context: string
): void {
  if (!config.serviceRoleKey) {
    throw new SupabaseIntegrationError(
      'SUPABASE_SERVICE_ROLE_MISSING',
      `${context}: WASM4PM_SUPABASE_SERVICE_ROLE_KEY is required for server-side Supabase writes ` +
        '(anon key is for read probes and Edge Function invocation only).'
    );
  }
}

/** Create or reuse a Supabase client for the given config. */
export function createSupabaseClient(
  config: SupabaseIntegrationConfig,
  options?: { useServiceRole?: boolean }
): Wasm4pmSupabaseClient {
  if (options?.useServiceRole) {
    assertServiceRoleConfigured(config, 'Supabase write client');
  }

  const useServiceRole = Boolean(options?.useServiceRole);
  const key = cacheKey(config, useServiceRole);
  if (cached?.key === key) {
    return cached.client;
  }

  const apiKey = useServiceRole ? config.serviceRoleKey! : config.anonKey;

  const client = createClient(config.url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  cached = { key, client };
  return client;
}

/** Factory that resolves config from env/file then returns a client. */
export function getSupabaseClient(options?: {
  fileConfig?: Partial<SupabaseIntegrationConfig>;
  env?: NodeJS.ProcessEnv;
  useServiceRole?: boolean;
}): Wasm4pmSupabaseClient {
  const config = resolveSupabaseConfig(options);
  return createSupabaseClient(config, { useServiceRole: options?.useServiceRole });
}

export function resetSupabaseClientCache(): void {
  cached = undefined;
}

export function assertSupabaseResponse<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  context: string
): T | null {
  if (result.error) {
    const msg = result.error.message ?? 'unknown error';
    if (/jwt|api key|invalid key|401|403/i.test(msg)) {
      throw new SupabaseIntegrationError(
        'SUPABASE_AUTH_FAILED',
        `${context}: authentication failed — ${msg}`
      );
    }
    if (/duplicate|unique|23505/i.test(msg)) {
      throw new SupabaseIntegrationError('RECEIPT_DUPLICATE', `${context}: ${msg}`);
    }
    throw new SupabaseIntegrationError('SUPABASE_INSERT_FAILED', `${context}: ${msg}`);
  }
  return result.data;
}

export async function pingSupabase(config: SupabaseIntegrationConfig): Promise<boolean> {
  try {
    const client = createSupabaseClient(config);
    const { error } = await client.from(config.tables.commandReceipts).select('run_id').limit(1);
    if (error && /relation.*does not exist/i.test(error.message)) {
      throw new SupabaseIntegrationError(
        'MIGRATION_MISSING',
        `Table "${config.tables.commandReceipts}" not found — run supabase db push`
      );
    }
    if (error && !/permission denied/i.test(error.message)) {
      throw new SupabaseIntegrationError('SUPABASE_UNREACHABLE', error.message);
    }
    return true;
  } catch (err) {
    if (err instanceof SupabaseIntegrationError) throw err;
    throw new SupabaseIntegrationError(
      'SUPABASE_UNREACHABLE',
      err instanceof Error ? err.message : String(err)
    );
  }
}
