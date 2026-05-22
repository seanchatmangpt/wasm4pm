// vitest.config.ts
import { defineConfig } from "file:///Users/sac/wasm4pm/node_modules/vitest/dist/config.js";
import path from "path";
var __vite_injected_original_dirname = "/Users/sac/wasm4pm/packages/testing";
var vitest_config_default = defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: [],
    testTimeout: 3e4,
    hookTimeout: 3e4,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "__tests__/", "*.test.ts"]
    }
  },
  resolve: {
    alias: {
      "@wasm4pm/testing": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  // Use happy-dom for tests that need DOM (XML parsing)
  environmentOptions: {
    // Note: To enable DOM for specific tests, use vi.stubEnv('browser', true)
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy90ZXN0aW5nXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvc2FjL3dhc200cG0vcGFja2FnZXMvdGVzdGluZy92aXRlc3QuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy90ZXN0aW5nL3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICB0ZXN0OiB7XG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIGluY2x1ZGU6IFsnX190ZXN0c19fLyoqLyoudGVzdC50cyddLFxuICAgIGV4Y2x1ZGU6IFsnbm9kZV9tb2R1bGVzJywgJ2Rpc3QnXSxcbiAgICBzZXR1cEZpbGVzOiBbXSxcbiAgICB0ZXN0VGltZW91dDogMzAwMDAsXG4gICAgaG9va1RpbWVvdXQ6IDMwMDAwLFxuICAgIGNvdmVyYWdlOiB7XG4gICAgICBwcm92aWRlcjogJ3Y4JyxcbiAgICAgIHJlcG9ydGVyOiBbJ3RleHQnLCAnanNvbicsICdodG1sJ10sXG4gICAgICBleGNsdWRlOiBbJ25vZGVfbW9kdWxlcy8nLCAnZGlzdC8nLCAnX190ZXN0c19fLycsICcqLnRlc3QudHMnXSxcbiAgICB9LFxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAd2FzbTRwbS90ZXN0aW5nJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgLy8gVXNlIGhhcHB5LWRvbSBmb3IgdGVzdHMgdGhhdCBuZWVkIERPTSAoWE1MIHBhcnNpbmcpXG4gIGVudmlyb25tZW50T3B0aW9uczoge1xuICAgIC8vIE5vdGU6IFRvIGVuYWJsZSBET00gZm9yIHNwZWNpZmljIHRlc3RzLCB1c2Ugdmkuc3R1YkVudignYnJvd3NlcicsIHRydWUpXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1IsU0FBUyxvQkFBb0I7QUFDNVQsT0FBTyxVQUFVO0FBRGpCLElBQU0sbUNBQW1DO0FBR3pDLElBQU8sd0JBQVEsYUFBYTtBQUFBLEVBQzFCLE1BQU07QUFBQSxJQUNKLGFBQWE7QUFBQSxJQUNiLFNBQVM7QUFBQSxJQUNULFNBQVMsQ0FBQyx3QkFBd0I7QUFBQSxJQUNsQyxTQUFTLENBQUMsZ0JBQWdCLE1BQU07QUFBQSxJQUNoQyxZQUFZLENBQUM7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLFVBQVU7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLFVBQVUsQ0FBQyxRQUFRLFFBQVEsTUFBTTtBQUFBLE1BQ2pDLFNBQVMsQ0FBQyxpQkFBaUIsU0FBUyxjQUFjLFdBQVc7QUFBQSxJQUMvRDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLG9CQUFvQixLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFFQSxvQkFBb0I7QUFBQTtBQUFBLEVBRXBCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
