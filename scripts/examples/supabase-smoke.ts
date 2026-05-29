#!/usr/bin/env npx tsx
/**
 * Live Supabase boundary smoke — requires credentials + migrated DB + Edge Function.
 *
 * Mock tests prove wiring. This script proves runtime authority and emits
 * `.wasm4pm/receipts/supabase_runtime.receipt.json` (status: live_verified).
 *
 * Usage:
 *   export WASM4PM_SUPABASE_URL="http://127.0.0.1:54321"
 *   export WASM4PM_SUPABASE_ANON_KEY="<anon-key>"
 *   export WASM4PM_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   npx tsx scripts/examples/supabase-smoke.ts
 *
 * Or: wpm supabase doctor --live --format json
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_RUNTIME_RECEIPT_PATH,
  resolveSupabaseConfig,
  runSupabaseDoctor,
  tryResolveSupabaseConfig,
  verifyRuntimeReceipt,
} from '../../packages/supabase/dist/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/supabase/package.json'), 'utf-8')
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function gitCommit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

async function main(): Promise<number> {
  const fileConfig = tryResolveSupabaseConfig();
  if (!fileConfig) {
    console.error(
      '[FAIL] SUPABASE_CREDENTIALS_MISSING — set WASM4PM_SUPABASE_URL and WASM4PM_SUPABASE_ANON_KEY'
    );
    return 1;
  }

  if (!fileConfig.serviceRoleKey) {
    console.error(
      '[FAIL] SUPABASE_SERVICE_ROLE_MISSING — set WASM4PM_SUPABASE_SERVICE_ROLE_KEY for RLS-compatible writes'
    );
    return 1;
  }

  console.log('[INFO] Resolved Supabase URL:', fileConfig.url);
  const config = resolveSupabaseConfig({ fileConfig });

  try {
    const report = await runSupabaseDoctor(config, {
      live: true,
      gitCommit: gitCommit(),
      packageVersion: packageVersion(),
      truexEnvelopePath: resolve(repoRoot, 'examples/out/truex_ocel2_valid.json'),
    });

    console.log('[INFO] Doctor report:', JSON.stringify(report, null, 2));

    if (report.status !== 'live_verified') {
      console.error(`[FAIL] Expected status live_verified, got ${report.status}`);
      return 2;
    }

    const receipt = JSON.parse(
      readFileSync(resolve(repoRoot, DEFAULT_RUNTIME_RECEIPT_PATH), 'utf-8')
    );
    if (!verifyRuntimeReceipt(receipt)) {
      console.error('[FAIL] Runtime receipt hash mismatch');
      return 3;
    }

    console.log('[PASS] Supabase live boundary verified');
    console.log('[PASS] Runtime receipt:', DEFAULT_RUNTIME_RECEIPT_PATH);
    console.log('[PASS] receipt_hash:', receipt.receipt_hash);
    return 0;
  } catch (err) {
    console.error('[FAIL]', err instanceof Error ? err.message : err);
    return 4;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[FAIL]', err);
    process.exit(5);
  });
