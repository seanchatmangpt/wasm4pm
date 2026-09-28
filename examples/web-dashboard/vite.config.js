import { defineConfig } from "vite";

// The cognition WASM glue (wasm-pack --target web) is initialized with a
// top-level `await __wbg_init()` in src/main.js. Vite's default build target
// (es2020 + browser baseline) rejects top-level await, so the browser target is
// raised to esnext, which every browser that supports WebAssembly ESM already
// implements.
export default defineConfig({
  build: {
    target: "esnext",
  },
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
