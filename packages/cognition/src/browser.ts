//! Browser entrypoint for `@wasm4pm/cognition`.
//!
//! Node consumers import from the package root and the default
//! `wasm4pm-cognition` (`--target nodejs`) build is used. Browser/bundler
//! consumers (Vite, Next, Webpack, esbuild) should import from
//! `@wasm4pm/cognition/browser` and call `initCognitionBrowser({ wasmUrl })`
//! once before any wrapper (`cognitionRun`, `cognitionVerify`, …).
//!
//! This points the singleton `WasmLoader` at the `--target web`
//! (`wasm4pm-cognition-web`) build, whose default export is an async `init()`
//! that fetches + instantiates the `_bg.wasm`. `WasmLoader.doInit` already
//! recognizes that shape (default export is a function) and awaits it.

import { WasmLoader, type WasmLoaderConfig } from './init.js';

/** Module specifier for the `--target web` (fetch-based, ESM) cognition build. */
export const BROWSER_MODULE_PATH = 'wasm4pm-cognition-web';

export interface BrowserInitOptions {
  /**
   * URL of the `wasm4pm_cognition_bg.wasm` asset. Under most bundlers, resolve
   * it from the package so the bundler emits/serves the asset, e.g.:
   *
   *   import wasmUrl from 'wasm4pm-cognition-web/wasm4pm_cognition_bg.wasm?url';
   *
   * Omit to let the web build resolve the wasm relative to its own module URL
   * (works under bundlers that rewrite `new URL(..., import.meta.url)`).
   */
  wasmUrl?: string | URL;
  /** Override the web build specifier (defaults to {@link BROWSER_MODULE_PATH}). */
  modulePath?: string;
}

/**
 * Initialize the cognition WASM kernel for the browser. Idempotent: the
 * underlying `WasmLoader` is a singleton, so repeated calls resolve the same
 * instantiation. Call `WasmLoader.reset()` first if you need to re-point it.
 */
export async function initCognitionBrowser(
  options: BrowserInitOptions = {},
): Promise<WasmLoader> {
  const config: WasmLoaderConfig = {
    modulePath: options.modulePath ?? BROWSER_MODULE_PATH,
    wasmUrl: options.wasmUrl,
  };
  const loader = WasmLoader.getInstance(config);
  await loader.init();
  return loader;
}

export { WasmLoader } from './init.js';
export type { WasmLoaderConfig } from './init.js';
