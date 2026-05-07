//! Lazy WASM module loader for the cognition facade.
//!
//! Singleton owns the only direct `import('wasm4pm-cognition')` site in this
//! package — every wrapper goes through `WasmLoader.getInstance().get()`.
//! No decision logic; only loading, error wrapping, and singleton bookkeeping.

import { CognitionError } from './errors';

export interface CognitionWasmModule {
  cognition_show: () => unknown;
  cognition_run: (input_json: string) => unknown;
  cognition_verify: (result_json: string) => unknown;
  cognition_replay: (run_id: string) => unknown;
  system_build: (intent_json: string) => unknown;
  system_verify: (target: string, artifacts_json: string) => unknown;
  [key: string]: unknown;
}

export interface WasmLoaderConfig {
  modulePath?: string;
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
    if (!WasmLoader.instance) {
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
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      const specifier = this.config.modulePath ?? 'wasm4pm-cognition';
      const mod = (await import(/* @vite-ignore */ specifier)) as CognitionWasmModule;
      this.module = mod;
      this.initialized = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CognitionError(
        `Failed to initialize wasm4pm-cognition: ${msg}`,
        'WASM_INIT_FAILED',
        { cause: err },
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
