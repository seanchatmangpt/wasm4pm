/**
 * wasm-loader.ts
 * WASM module initialization and lifecycle management
 * Singleton pattern for efficient module reuse across multiple engine.run() calls
 * Handles panic hooks, memory validation, and runtime environment detection
 */

import { ObservabilityLayer } from '@wasm4pm/observability';

/**
 * Runtime environment detection
 */
type RuntimeEnvironment = 'browser' | 'nodejs' | 'wasi';

/**
 * WASM module type - minimal interface covering common operations
 */
export interface WasmModule {
  memory: any; // WebAssembly.Memory - typed as any for compatibility
  version?: () => string;
  init?: () => void;
  [key: string]: any;
}

/**
 * WASM initialization error codes
 */
export enum WasmErrorCode {
  WASM_INIT_FAILED = 5,
  WASM_MEMORY_EXCEEDED = 5,
  WASM_VERSION_MISMATCH = 5,
}

/**
 * Classified WASM load failure — carries a machine-readable cause code and the
 * resolved module path so callers (and the bootstrap timeout handler) can emit
 * specific, actionable error messages rather than generic "BOOTSTRAP_FAILED".
 */
export class WasmLoadError extends Error {
  public readonly loadCause: 'FILE_NOT_FOUND' | 'CORRUPT_BINARY' | 'MISSING_EXPORTS' | 'LOAD_FAILED';
  public readonly modulePath: string | undefined;

  constructor(
    loadCause: 'FILE_NOT_FOUND' | 'CORRUPT_BINARY' | 'MISSING_EXPORTS' | 'LOAD_FAILED',
    message: string,
    modulePath?: string
  ) {
    super(message);
    this.loadCause = loadCause;
    this.modulePath = modulePath;
    this.name = 'WasmLoadError';
  }
}

/**
 * WASM initialization status
 */
export interface WasmLoaderStatus {
  initialized: boolean;
  moduleVersion?: string;
  expectedVersion?: string;
  memoryPages: number;
  memoryMaxPages?: number;
  memoryUsagePercent: number;
  runtimeEnvironment: RuntimeEnvironment;
}

/**
 * Configuration for WASM loader
 */
export interface WasmLoaderConfig {
  modulePath?: string;
  expectedVersion?: string;
  maxMemoryPercent?: number; // threshold for memory warnings (default: 80)
  enablePanicHook?: boolean; // setup Rust panic hook (default: true)
  observability?: ObservabilityLayer;
}

/**
 * WasmLoader singleton
 * Lazy-loads WASM module on first use, reuses across multiple runs
 * Handles panic hooks, memory validation, and runtime detection
 */
export class WasmLoader {
  private static instance?: WasmLoader;
  private module?: WasmModule;
  private initialized = false;
  private config: WasmLoaderConfig;
  private observability: ObservabilityLayer;
  private panicHook?: (message: string, stack?: string) => void;
  private runtimeEnvironment: RuntimeEnvironment;

  private constructor(config: WasmLoaderConfig = {}) {
    this.config = config;
    this.observability = config.observability || new ObservabilityLayer();
    this.runtimeEnvironment = this.detectRuntimeEnvironment();
  }

  /**
   * Get or create singleton instance
   */
  public static getInstance(config?: WasmLoaderConfig): WasmLoader {
    if (!WasmLoader.instance) {
      WasmLoader.instance = new WasmLoader(config);
    }
    return WasmLoader.instance;
  }

  /**
   * Reset singleton (mainly for testing)
   * Destroys entire singleton - next init() will reload WASM from scratch
   */
  public static reset(): void {
    WasmLoader.instance = undefined;
  }

  /**
   * Soft reset - clears initialized flag but keeps compiled WASM module
   * Allows fast recovery without re-importing and re-compiling WASM
   * Use this for recovery when WASM module is still valid
   */
  public softReset(): void {
    this.initialized = false;
    // Keep this.module and this.observability intact
    // Next init() call will skip the expensive import() and reuse existing module
  }

  /**
   * Initialize WASM module
   * - Loads module from ../../wasm4pm/pkg/wasm4pm.js
   * - Sets up panic hook
   * - Validates memory
   * - Verifies version compatibility
   * Throws on failure with appropriate error code
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return; // Already initialized
    }

    try {
      this.observability.emitCli({
        level: 'info',
        message: 'Initializing WASM module',
      });

      // Load WASM module
      const module = await this.loadWasmModule();
      this.module = module;

      // Setup panic hook for readable error messages
      if (this.config.enablePanicHook !== false) {
        this.setupPanicHook(module);
      }

      // Validate memory
      this.validateMemory();

      // Verify module version if expected version is provided
      if (this.config.expectedVersion && module.version) {
        const actualVersion = module.version();
        if (actualVersion !== this.config.expectedVersion) {
          throw new Error(
            `WASM module version mismatch: expected ${this.config.expectedVersion}, ` +
              `got ${actualVersion}`
          );
        }
      }

      this.initialized = true;

      this.observability.emitCli({
        level: 'info',
        message: 'WASM module initialized successfully',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.observability.emitCli({
        level: 'error',
        message: `WASM initialization failed: ${message}`,
      });
      throw err;
    }
  }

  /**
   * Get initialized WASM module
   * Throws if module is not initialized (call init() first)
   */
  public get(): WasmModule {
    if (!this.module || !this.initialized) {
      throw new Error('WASM module not initialized. Call init() before using the module.');
    }
    return this.module;
  }

  /**
   * Check if module is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current WASM loader status
   */
  public getStatus(): WasmLoaderStatus {
    if (!this.module) {
      return {
        initialized: false,
        moduleVersion: undefined,
        expectedVersion: this.config.expectedVersion,
        memoryPages: 0,
        memoryUsagePercent: 0,
        runtimeEnvironment: this.runtimeEnvironment,
      };
    }

    const memory = this.module.memory;
    const memoryPages = memory.buffer.byteLength / (64 * 1024); // 64KB pages
    const memoryMaxPages = memory.maximum ?? undefined;
    const memoryUsagePercent = memoryMaxPages ? (memoryPages / memoryMaxPages) * 100 : 0;

    return {
      initialized: this.initialized,
      moduleVersion: this.module.version?.(),
      expectedVersion: this.config.expectedVersion,
      memoryPages,
      memoryMaxPages,
      memoryUsagePercent,
      runtimeEnvironment: this.runtimeEnvironment,
    };
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryStats(): {
    usedBytes: number;
    totalBytes: number;
    maxBytes?: number;
    usagePercent: number;
  } {
    if (!this.module) {
      return {
        usedBytes: 0,
        totalBytes: 0,
        usagePercent: 0,
      };
    }

    const buffer = this.module.memory.buffer;
    const usedBytes = buffer.byteLength;
    const maxBytes = this.module.memory.maximum
      ? this.module.memory.maximum * (64 * 1024)
      : undefined;
    const totalBytes = usedBytes;
    const usagePercent = maxBytes ? (usedBytes / maxBytes) * 100 : 0;

    return {
      usedBytes,
      totalBytes,
      maxBytes,
      usagePercent,
    };
  }

  /**
   * Validate WASM memory is accessible and not corrupted
   * Throws if validation fails
   */
  private validateMemory(): void {
    if (!this.module) {
      throw new Error('Module not loaded');
    }

    // wasm-pack bundler target does not expose .memory directly — skip if absent
    if (!this.module.memory) {
      return;
    }

    try {
      const buffer = this.module.memory.buffer;

      // Check memory is accessible
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('WASM memory is inaccessible or empty');
      }

      // Create a view to verify memory is valid
      const view = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
      const testValue = 42;

      // Try to write and read
      const originalValue = view[0];
      view[0] = testValue;
      if (view[0] !== testValue) {
        throw new Error('WASM memory write verification failed');
      }
      view[0] = originalValue;

      // Check memory usage
      const status = this.getStatus();
      const maxMemoryPercent = this.config.maxMemoryPercent ?? 80;

      if (status.memoryUsagePercent > 100) {
        throw new Error('WASM memory exceeded maximum allocation');
      }

      if (status.memoryUsagePercent > maxMemoryPercent) {
        this.observability.emitCli({
          level: 'warn',
          message:
            `WASM memory usage at ${status.memoryUsagePercent.toFixed(1)}% ` +
            `(${status.memoryPages} pages)`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`WASM memory validation failed: ${message}`);
    }
  }

  /**
   * Load WASM module from wasm4pm/pkg directory.
   * Validates that the module exports required discovery functions.
   * Throws WasmLoadError with a classified cause for actionable diagnostics.
   */
  private async loadWasmModule(): Promise<WasmModule> {
    let wasmModule: Record<string, unknown>;
    let resolvedModulePath = this.config.modulePath;

    try {
      if (!resolvedModulePath) {
        // Compute workspace root from import.meta.url
        // In src: wasm-loader.ts at packages/engine/src/
        // In dist: wasm-loader.js at packages/engine/dist/
        // Both are 3 levels up from workspace root
        const currentUrl = new URL(import.meta.url);
        const currentPath = currentUrl.pathname;

        // Find 'packages/engine' and go up to workspace root
        const engineIndex = currentPath.lastIndexOf('packages/engine');
        if (engineIndex === -1) {
          throw new Error('Cannot determine workspace root: "packages/engine" not found in path');
        }
        const workspaceRoot = currentPath.substring(0, engineIndex);
        resolvedModulePath = workspaceRoot + 'wasm4pm/pkg/wasm4pm.js';
      }

      // Verify the file exists before attempting dynamic import (Node.js only).
      // This produces a precise "file not found" error rather than a cryptic
      // "ERR_MODULE_NOT_FOUND" / "Cannot find module" message.
      if (typeof process !== 'undefined' && process.versions?.node) {
        const { existsSync } = await import('fs');
        if (!existsSync(resolvedModulePath)) {
          throw new WasmLoadError(
            'FILE_NOT_FOUND',
            `WASM binary not found at: ${resolvedModulePath}. ` +
              `Run "npm run build" inside the wasm4pm/ directory to compile the WASM binary, ` +
              `or set the modulePath config option to the correct wasm4pm.js path.`,
            resolvedModulePath
          );
        }
      }

      // Use dynamic import for flexibility
      wasmModule = await import(resolvedModulePath);
    } catch (err) {
      // Re-throw WasmLoadError instances as-is (already classified)
      if (err instanceof WasmLoadError) throw err;

      const message = err instanceof Error ? err.message : String(err);

      // Classify the error by its message pattern for actionable diagnostics
      if (
        message.includes('ERR_MODULE_NOT_FOUND') ||
        message.includes('Cannot find module') ||
        message.includes('MODULE_NOT_FOUND')
      ) {
        throw new WasmLoadError(
          'FILE_NOT_FOUND',
          `WASM module not found at "${resolvedModulePath}". ` +
            `Run "npm run build" in the wasm4pm/ directory to compile the WASM binary.`,
          resolvedModulePath
        );
      }

      if (
        message.includes('SyntaxError') ||
        message.includes('Unexpected token') ||
        message.includes('invalid wasm') ||
        message.includes('WebAssembly.compile')
      ) {
        throw new WasmLoadError(
          'CORRUPT_BINARY',
          `WASM binary at "${resolvedModulePath}" appears corrupt or incomplete. ` +
            `Delete wasm4pm/pkg/ and re-run "npm run build" to regenerate the binary.`,
          resolvedModulePath
        );
      }

      throw new WasmLoadError(
        'LOAD_FAILED',
        `Failed to load WASM module from "${resolvedModulePath}": ${message}`,
        resolvedModulePath
      );
    }

    // Validate that the module exports required functions
    // memory field may not be present depending on bundler target (nodejs vs bundler vs browser)
    if (!wasmModule || typeof wasmModule.load_eventlog_from_xes !== 'function') {
      throw new WasmLoadError(
        'MISSING_EXPORTS',
        `WASM module at "${resolvedModulePath}" is missing required export "load_eventlog_from_xes". ` +
          `The binary may be from an incompatible version. Re-run "npm run build" to regenerate.`,
        resolvedModulePath
      );
    }

    return wasmModule as WasmModule;
  }

  /**
   * Setup Rust panic hook for readable error messages
   * Wraps wasm_bindgen's panic hook with custom handler
   * Note: set_panic_hook is optional if not exported by WASM module
   */
  private setupPanicHook(module: WasmModule): void {
    // Attempt to setup panic hook if available
    const wasmBindgenPanicHook = (module as Partial<WasmModule>).set_panic_hook;

    if (typeof wasmBindgenPanicHook === 'function') {
      try {
        // Call wasm_bindgen's panic hook setup
        wasmBindgenPanicHook();
        this.observability.emitCli({
          level: 'debug',
          message: 'WASM panic hook initialized',
        });
      } catch (e) {
        this.observability.emitCli({
          level: 'warn',
          message: `Failed to initialize WASM panic hook: ${String(e)}`,
        });
      }
    } else {
      this.observability.emitCli({
        level: 'warn',
        message:
          'WASM module does not export set_panic_hook. Continuing without custom panic hook.',
      });
    }

    // Additionally, setup a global panic handler for uncaught exceptions
    if (typeof (globalThis as any).window === 'undefined') {
      // Node.js environment
      const originalWarning = console.error;
      this.panicHook = (message: string, stack?: string) => {
        this.observability.emitCli({
          level: 'error',
          message: `WASM panic: ${message}`,
        });

        // Log to observability system
        this.emitJson({
          timestamp: new Date().toISOString(),
          component: 'wasm-loader',
          event_type: 'wasm_panic',
          data: {
            message,
            stack,
            runtimeEnvironment: this.runtimeEnvironment,
          },
        });

        originalWarning(`WASM Panic: ${message}\n${stack || ''}`);
      };
    } else {
      // Browser environment
      this.panicHook = (message: string, stack?: string) => {
        this.observability.emitCli({
          level: 'error',
          message: `WASM panic: ${message}`,
        });

        this.emitJson({
          timestamp: new Date().toISOString(),
          component: 'wasm-loader',
          event_type: 'wasm_panic',
          data: {
            message,
            stack,
            runtimeEnvironment: this.runtimeEnvironment,
          },
        });

        // In browser, don't re-throw, just log
        console.error(`WASM Panic: ${message}`, stack);
      };
    }
  }

  /**
   * Detect runtime environment (browser, Node.js, WASI)
   */
  private detectRuntimeEnvironment(): RuntimeEnvironment {
    // Check for WASI environment
    if (typeof process !== 'undefined' && process.versions?.wasi) {
      return 'wasi';
    }

    // Check for Node.js
    if (typeof process !== 'undefined' && process.versions?.node) {
      return 'nodejs';
    }

    // Assume browser
    return 'browser';
  }

  /**
   * Get getrandom polyfill if needed
   * For WASM32 targets, getrandom may need a polyfill
   */
  private getGetrandomPolyfill(): ((buffer: Uint8Array) => Uint8Array) | undefined {
    if (this.runtimeEnvironment === 'nodejs') {
      // Node.js has native crypto
      try {
        return require('crypto').randomBytes;
      } catch {
        return undefined;
      }
    }

    if (this.runtimeEnvironment === 'browser') {
      // Browser has crypto.getRandomValues
      return (buffer: Uint8Array) => {
        if (crypto && crypto.getRandomValues) {
          crypto.getRandomValues(buffer);
          return buffer;
        }
        throw new Error('crypto.getRandomValues not available');
      };
    }

    return undefined;
  }

  /**
   * Emit JSON event via observability layer
   */
  private emitJson(event: Record<string, unknown>): void {
    if ((this.observability as any).emitJson) {
      (this.observability as any).emitJson(event);
    }
  }
}

/**
 * Factory function for creating WasmLoader instances
 */
export function createWasmLoader(config?: WasmLoaderConfig): WasmLoader {
  return WasmLoader.getInstance(config);
}

/**
 * Get the singleton WasmLoader instance
 */
export function getWasmLoader(): WasmLoader {
  return WasmLoader.getInstance();
}
