// vitest.config.ts
import { defineConfig } from "file:///Users/sac/wasm4pm/node_modules/vitest/dist/config.js";
var vitest_config_default = defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    exclude: [
      "node_modules",
      "dist",
      // These load @wasm4pm/kernel or wasm4pm which requires the nodejs WASM binary.
      // Run independently after `cd wasm4pm && npm run build:nodejs`.
      "__tests__/backend-registry.test.ts",
      "__tests__/deployment-profiles.test.ts",
      "__tests__/algorithms-error-handling.test.ts",
      "__tests__/errors.test.ts",
      "__tests__/eventlog-ir-converter.test.ts",
      "__tests__/model-ir-converter.test.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.d.ts"]
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9rZXJuZWxcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9rZXJuZWwvdml0ZXN0LmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvc2FjL3dhc200cG0vcGFja2FnZXMva2VybmVsL3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICBpbmNsdWRlOiBbJ19fdGVzdHNfXy8qKi8qLnRlc3QudHMnLCAnc3JjLyoqL19fdGVzdHNfXy8qKi8qLnRlc3QudHMnXSxcbiAgICBleGNsdWRlOiBbXG4gICAgICAnbm9kZV9tb2R1bGVzJyxcbiAgICAgICdkaXN0JyxcbiAgICAgIC8vIFRoZXNlIGxvYWQgQHdhc200cG0va2VybmVsIG9yIHdhc200cG0gd2hpY2ggcmVxdWlyZXMgdGhlIG5vZGVqcyBXQVNNIGJpbmFyeS5cbiAgICAgIC8vIFJ1biBpbmRlcGVuZGVudGx5IGFmdGVyIGBjZCB3YXNtNHBtICYmIG5wbSBydW4gYnVpbGQ6bm9kZWpzYC5cbiAgICAgICdfX3Rlc3RzX18vYmFja2VuZC1yZWdpc3RyeS50ZXN0LnRzJyxcbiAgICAgICdfX3Rlc3RzX18vZGVwbG95bWVudC1wcm9maWxlcy50ZXN0LnRzJyxcbiAgICAgICdfX3Rlc3RzX18vYWxnb3JpdGhtcy1lcnJvci1oYW5kbGluZy50ZXN0LnRzJyxcbiAgICAgICdfX3Rlc3RzX18vZXJyb3JzLnRlc3QudHMnLFxuICAgICAgJ19fdGVzdHNfXy9ldmVudGxvZy1pci1jb252ZXJ0ZXIudGVzdC50cycsXG4gICAgICAnX190ZXN0c19fL21vZGVsLWlyLWNvbnZlcnRlci50ZXN0LnRzJyxcbiAgICBdLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICBwcm92aWRlcjogJ3Y4JyxcbiAgICAgIHJlcG9ydGVyOiBbJ3RleHQnLCAnanNvbicsICdodG1sJ10sXG4gICAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnRzJ10sXG4gICAgICBleGNsdWRlOiBbJ3NyYy9pbmRleC50cycsICdzcmMvKiovKi5kLnRzJ10sXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0UixTQUFTLG9CQUFvQjtBQUV6VCxJQUFPLHdCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixTQUFTLENBQUMsMEJBQTBCLCtCQUErQjtBQUFBLElBQ25FLFNBQVM7QUFBQSxNQUNQO0FBQUEsTUFDQTtBQUFBO0FBQUE7QUFBQSxNQUdBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNGO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixVQUFVLENBQUMsUUFBUSxRQUFRLE1BQU07QUFBQSxNQUNqQyxTQUFTLENBQUMsYUFBYTtBQUFBLE1BQ3ZCLFNBQVMsQ0FBQyxnQkFBZ0IsZUFBZTtBQUFBLElBQzNDO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
