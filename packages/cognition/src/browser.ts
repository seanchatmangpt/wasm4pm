//! Browser entrypoint for `@wasm4pm/cognition`.
//!
//! Browser applications should initialize the singleton once before invoking any
//! wrapper. A literal `moduleLoader` callback is preferred because bundlers can
//! then discover and include the generated web-target JavaScript module.

import { WasmLoader, type WasmLoaderConfig } from './init.js';

/** Module specifier used when no bundle-visible loader is supplied. */
export const BROWSER_MODULE_PATH = 'wasm4pm-cognition-web';

export interface BrowserInitOptions {
  /** URL of the generated `wasm4pm_cognition_bg.wasm` asset. */
  wasmUrl?: string | URL;
  /** Override the fallback web-module specifier. */
  modulePath?: string;
  /**
   * Bundle-visible generated-module factory, for example:
   * `() => import('./pkg-web/wasm4pm_cognition.js')`.
   */
  moduleLoader?: () => Promise<unknown>;
}

/**
 * Initialize the cognition WASM kernel for the browser.
 *
 * The returned loader is the same singleton consumed by all package wrappers.
 * Calling this before a wrapper also ensures its browser configuration wins over
 * the default Node module path.
 */
export async function initCognitionBrowser(
  options: BrowserInitOptions = {},
): Promise<WasmLoader> {
  const config: WasmLoaderConfig = {
    modulePath: options.modulePath ?? BROWSER_MODULE_PATH,
    moduleLoader: options.moduleLoader,
    wasmUrl: options.wasmUrl,
  };
  const loader = WasmLoader.getInstance(config);
  await loader.init();
  return loader;
}

export { WasmLoader } from './init.js';
export type { CognitionWasmModule, WasmLoaderConfig } from './init.js';
