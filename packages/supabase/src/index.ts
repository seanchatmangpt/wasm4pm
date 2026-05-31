export {
  SUPABASE_ERROR_CODES,
  SupabaseIntegrationError,
  supabaseIntegrationSchema,
  supabaseTableNamesSchema,
  resolveSupabaseConfig,
  tryResolveSupabaseConfig,
  type SupabaseErrorCode,
  type SupabaseIntegrationConfig,
  type SupabaseTableNames,
} from './config.js';

export {
  createSupabaseClient,
  createSupabaseReadClient,
  createSupabaseWriteClient,
  assertServiceRoleConfigured,
  getSupabaseClient,
  resetSupabaseClientCache,
  assertSupabaseResponse,
  pingSupabase,
  type Wasm4pmSupabaseClient,
} from './client.js';

export {
  SyncQueue,
  getDefaultSyncQueuePath,
  type SyncQueueItem,
  type SyncQueueFile,
} from './sync-queue.js';

export {
  listLocalCommandReceipts,
  upsertCommandReceipt,
  syncCommandReceipts,
  recordDeadletter,
  type CommandReceiptRow,
  type CommandReceiptSyncResult,
} from './command-receipt-sync.js';

export {
  TRUEX_ADMITTED,
  parseTruexEnvelope,
  assertAdmittedEnvelope,
  ingestTruexEnvelope,
  envelopePayloadHash,
  type TruexEnvelope,
  type TruexIngestResult,
} from './truex-ingest.js';

export {
  flushSyncQueue,
  runSupabaseDoctor,
  runSupabaseLiveVerification,
  loadRuntimeReceipt,
  writeRuntimeReceipt,
  verifyRuntimeReceipt,
  computeRuntimeReceiptHash,
  deriveDoctorStatus,
  DEFAULT_RUNTIME_RECEIPT_PATH,
  type SyncQueueFlushResult,
  type SupabaseDoctorReport,
  type SupabaseDoctorStatus,
  type SupabaseRuntimeReceipt,
  type SupabaseLiveVerificationResult,
  type SupabaseLiveCheckResults,
} from './sync-flush.js';
