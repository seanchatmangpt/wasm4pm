/**
 * wasm-loader.ts
 * WASM module initialization and lifecycle management
 * Singleton pattern for efficient module reuse across multiple engine.run() calls
 * Handles panic hooks, memory validation, and runtime environment detection
 */

import { ObservabilityLayer } from '@pictl/observability';

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
   */
  public static reset(): void {
    WasmLoader.instance = undefined;
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
      throw new Error(
        'WASM module not initialized. Call init() before using the module.'
      );
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
        memoryPages: 0,
        memoryUsagePercent: 0,
        runtimeEnvironment: this.runtimeEnvironment,
      };
    }

    const memory = this.module.memory;
    const memoryPages = memory.buffer.byteLength / (64 * 1024); // 64KB pages
    const memoryMaxPages = memory.maximum ?? undefined;
    const memoryUsagePercent = memoryMaxPages
      ? (memoryPages / memoryMaxPages) * 100
      : 0;

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
          message: `WASM memory usage at ${status.memoryUsagePercent.toFixed(1)}% ` +
            `(${status.memoryPages} pages)`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`WASM memory validation failed: ${message}`);
    }
  }

  /**
   * Load WASM module from wasm4pm/pkg directory
   */
  private async loadWasmModule(): Promise<WasmModule> {
    // Dynamically import based on runtime environment
    let wasmModule: any;

    try {
      // Import from the built pictl WASM package
      // Path is relative to where this file runs
      const modulePath = this.config.modulePath ||
        '../../../wasm4pm/pkg/pictl.js';

      // Use dynamic import for flexibility
      wasmModule = await import(modulePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load WASM module: ${message}`);
    }

    if (!wasmModule || !wasmModule.memory) {
      throw new Error('Invalid WASM module: missing memory or exports');
    }

    return wasmModule as WasmModule;
  }

  /**
   * Setup Rust panic hook for readable error messages
   * Wraps wasm_bindgen's panic hook with custom handler
   */
  private setupPanicHook(module: WasmModule): void {
    // Check if wasm_bindgen panic hook is available
    const wasmBindgenPanicHook = (module as any).set_panic_hook;

    if (typeof wasmBindgenPanicHook === 'function') {
      // Call wasm_bindgen's panic hook setup
      wasmBindgenPanicHook();
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
  private getGetrandomPolyfill(): any {
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
  private emitJson(event: any): void {
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
