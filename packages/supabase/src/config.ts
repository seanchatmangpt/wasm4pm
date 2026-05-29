import { z } from 'zod';

export const SUPABASE_ERROR_CODES = [
  'SUPABASE_CREDENTIALS_MISSING',
  'SUPABASE_SERVICE_ROLE_MISSING',
  'SUPABASE_AUTH_FAILED',
  'SUPABASE_INSERT_FAILED',
  'SUPABASE_UNREACHABLE',
  'RECEIPT_DUPLICATE',
  'RECEIPT_REFUSED',
  'SYNC_QUEUE_EMPTY',
  'MIGRATION_MISSING',
] as const;

export type SupabaseErrorCode = (typeof SUPABASE_ERROR_CODES)[number];

export class SupabaseIntegrationError extends Error {
  readonly code: SupabaseErrorCode;

  constructor(code: SupabaseErrorCode, message: string) {
    super(message);
    this.name = 'SupabaseIntegrationError';
    this.code = code;
  }
}

export const supabaseTableNamesSchema = z
  .object({
    commandReceipts: z.string().min(1).default('wpm_command_receipts'),
    truexEnvelopes: z.string().min(1).default('truex_envelopes'),
    syncQueueDeadletter: z.string().min(1).default('sync_queue_deadletter'),
  })
  .default({});

export const supabaseIntegrationSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
  serviceRoleKey: z.string().min(1).optional(),
  edgeFunctionTruexIngest: z.string().min(1).default('truex-ingest'),
  tables: supabaseTableNamesSchema,
});

export type SupabaseIntegrationConfig = z.infer<typeof supabaseIntegrationSchema>;
export type SupabaseTableNames = z.infer<typeof supabaseTableNamesSchema>;

const ENV_URL_KEYS = ['WASM4PM_SUPABASE_URL', 'SUPABASE_URL'] as const;
const ENV_ANON_KEYS = ['WASM4PM_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'] as const;
const ENV_SERVICE_KEYS = [
  'WASM4PM_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function pickEnv(env: NodeJS.ProcessEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Merge file config with WASM4PM_* / SUPABASE_* environment variables. */
export function resolveSupabaseConfig(options?: {
  fileConfig?: Partial<SupabaseIntegrationConfig>;
  env?: NodeJS.ProcessEnv;
}): SupabaseIntegrationConfig {
  const env = options?.env ?? process.env;
  const file = options?.fileConfig ?? {};
  const url = file.url ?? pickEnv(env, ENV_URL_KEYS);
  const anonKey = file.anonKey ?? pickEnv(env, ENV_ANON_KEYS);
  const serviceRoleKey = file.serviceRoleKey ?? pickEnv(env, ENV_SERVICE_KEYS);

  if (!url || !anonKey) {
    throw new SupabaseIntegrationError(
      'SUPABASE_CREDENTIALS_MISSING',
      'Supabase URL and anon key are required. Set WASM4PM_SUPABASE_URL and WASM4PM_SUPABASE_ANON_KEY ' +
        '(or SUPABASE_URL / SUPABASE_ANON_KEY), or add [integrations.supabase] to wasm4pm.toml.'
    );
  }

  return supabaseIntegrationSchema.parse({
    ...file,
    url,
    anonKey,
    serviceRoleKey,
  });
}

/** @returns config or null when credentials are absent (non-throwing probe). */
export function tryResolveSupabaseConfig(options?: {
  fileConfig?: Partial<SupabaseIntegrationConfig>;
  env?: NodeJS.ProcessEnv;
}): SupabaseIntegrationConfig | null {
  try {
    return resolveSupabaseConfig(options);
  } catch (err) {
    if (err instanceof SupabaseIntegrationError && err.code === 'SUPABASE_CREDENTIALS_MISSING') {
      return null;
    }
    throw err;
  }
}
