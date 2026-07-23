//! Lazy WASM module loader for the cognition boundary.
//!
//! The singleton owns WASM initialization for every wrapper. Browser bundlers
//! may inject a literal module-loader callback so the generated web module is
//! visible to static analysis instead of relying on a variable bare import.

import { CognitionError } from './errors.js';

export interface CognitionWasmModule {
  cognition_show: () => unknown;
  cognition_run: (input_json: string) => unknown;
  cognition_session_turn: (input_json: string) => unknown;
  cognition_session_verify: (input_json: string) => unknown;
  cognition_session_code: (input_json: string) => unknown;
  cognition_verify: (result_json: string) => unknown;
  cognition_replay: (run_id: string) => unknown;
  system_build: (intent_json: string) => unknown;
  system_verify: (target: string, artifacts_json: string) => unknown;
  [key: string]: unknown;
}

export interface WasmLoaderConfig {
  /** Module specifier to import. Defaults to the Node build `wasm4pm-cognition`. */
  modulePath?: string;
  /** Bundle-visible module factory for browser applications. */
  moduleLoader?: () => Promise<unknown>;
  /** URL of the `_bg.wasm` passed to a web-target module's default `init()`. */
  wasmUrl?: string | URL;
}

const REQUIRED_EXPORTS = [
  'cognition_show',
  'cognition_run',
  'cognition_session_turn',
  'cognition_session_verify',
  'cognition_session_code',
  'cognition_verify',
  'cognition_replay',
  'system_build',
  'system_verify',
] as const;

function assertModuleShape(module: unknown): asserts module is CognitionWasmModule {
  if (!module || typeof module !== 'object') {
    throw new TypeError('WASM module namespace is not an object.');
  }
  const missing = REQUIRED_EXPORTS.filter(
    (name) => typeof (module as Record<string, unknown>)[name] !== 'function',
  );
  if (missing.length > 0) {
    throw new TypeError(`WASM module is missing required exports: ${missing.join(', ')}`);
  }
}

export class WasmLoader {
  private static instance?: WasmLoader;
  private module?: CognitionWasmModule;
  private initialized = false;
  private initPromise?: Promise<void>;
  private readonly config: WasmLoaderConfig;

  private constructor(config: WasmLoaderConfig = {}) {
    this.config = config;
  }

  public static getInstance(config?: WasmLoaderConfig): WasmLoader {
    if (!WasmLoader.instance || (config && !WasmLoader.instance.initialized)) {
      WasmLoader.instance = new WasmLoader(config);
    }
    return WasmLoader.instance;
  }

  public static reset(): void {
    WasmLoader.instance = undefined;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit().catch((error: unknown) => {
      this.initPromise = undefined;
      throw error;
    });
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      const rawModule = this.config.moduleLoader
        ? await this.config.moduleLoader()
        : await import(/* @vite-ignore */ this.config.modulePath ?? 'wasm4pm-cognition');

      const defaultExport = (rawModule as { default?: unknown }).default;
      let module: unknown;
      if (typeof defaultExport === 'function') {
        await (defaultExport as (input?: string | URL) => Promise<unknown>)(this.config.wasmUrl);
        module = rawModule;
      } else if (
        defaultExport &&
        typeof (defaultExport as { cognition_run?: unknown }).cognition_run === 'function'
      ) {
        module = defaultExport;
      } else {
        module = rawModule;
      }

      assertModuleShape(module);
      this.module = module;
      this.initialized = true;
    } catch (error) {
      this.module = undefined;
      this.initialized = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new CognitionError(
        `Failed to initialize wasm4pm-cognition: ${message}`,
        'WASM_INIT_FAILED',
        { cause: error },
      );
    }
  }

  public get(): CognitionWasmModule {
    if (!this.module || !this.initialized) {
      throw new CognitionError(
        'WASM module not initialized. Call WasmLoader.getInstance().init() first.',
        'WASM_INIT_FAILED',
      );
    }
    return this.module;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

export function getWasmLoader(): WasmLoader {
  return WasmLoader.getInstance();
}
