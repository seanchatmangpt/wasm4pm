//! Lazy WASM module loader for the cognition boundary.
//!
//! Singleton owns the only direct `import('wasm4pm-cognition')` site in this
//! package — every wrapper goes through `WasmLoader.getInstance().get()`.
//! No decision logic; only loading, error wrapping, and singleton bookkeeping.

import { CognitionError } from './errors.js';

export interface CognitionWasmModule {
  cognition_show: () => unknown;
  cognition_run: (input_json: string) => unknown;
  cognition_session_turn: (input_json: string) => unknown;
  cognition_verify: (result_json: string) => unknown;
  cognition_replay: (run_id: string) => unknown;
  system_build: (intent_json: string) => unknown;
  system_verify: (target: string, artifacts_json: string) => unknown;
  [key: string]: unknown;
}

export interface WasmLoaderConfig {
  /** Module specifier to import. Defaults to the node build `wasm4pm-cognition`.
   *  For browser use, point at a `--target web` build (e.g. `wasm4pm-cognition/pkg-web`). */
  modulePath?: string;
  /** Browser only: URL of the `_bg.wasm` for a `--target web` build. When the
   *  imported module's default export is an `init()` function (the web target),
   *  it is called with this URL to fetch + instantiate. Omit to let the web build
   *  resolve the wasm relative to its own module URL (works under most bundlers). */
  wasmUrl?: string | URL;
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
      const rawMod = await import(/* @vite-ignore */ specifier);

      // Three module shapes are supported:
      //  1. `--target web`: default export is an async `init()`.
      //  2. node default-object: `default` carries cognition exports.
      //  3. `--target nodejs`: named exports live on the namespace itself.
      const def = (rawMod as { default?: unknown }).default;
      if (typeof def === 'function') {
        await (def as (input?: string | URL) => Promise<unknown>)(this.config.wasmUrl);
        this.module = rawMod as CognitionWasmModule;
      } else if (def && typeof (def as { cognition_run?: unknown }).cognition_run === 'function') {
        this.module = def as CognitionWasmModule;
      } else {
        this.module = rawMod as CognitionWasmModule;
      }
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
