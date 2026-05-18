// vitest.config.ts
import { defineConfig } from "file:///Users/sac/wasm4pm/node_modules/vitest/dist/config.js";
var vitest_config_default = defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // JsonWriter tests have open handles (invalid-path write test hangs shutdown loop).
      // Run separately with: npx vitest run __tests__/json-writer.test.ts
      "**/__tests__/json-writer.test.ts",
      "**/__tests__/json-writer.test.js"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/"]
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9vYnNlcnZhYmlsaXR5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvc2FjL3dhc200cG0vcGFja2FnZXMvb2JzZXJ2YWJpbGl0eS92aXRlc3QuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9vYnNlcnZhYmlsaXR5L3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnbm9kZScsXG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBleGNsdWRlOiBbXG4gICAgICAnKiovbm9kZV9tb2R1bGVzLyoqJyxcbiAgICAgICcqKi9kaXN0LyoqJyxcbiAgICAgIC8vIEpzb25Xcml0ZXIgdGVzdHMgaGF2ZSBvcGVuIGhhbmRsZXMgKGludmFsaWQtcGF0aCB3cml0ZSB0ZXN0IGhhbmdzIHNodXRkb3duIGxvb3ApLlxuICAgICAgLy8gUnVuIHNlcGFyYXRlbHkgd2l0aDogbnB4IHZpdGVzdCBydW4gX190ZXN0c19fL2pzb24td3JpdGVyLnRlc3QudHNcbiAgICAgICcqKi9fX3Rlc3RzX18vanNvbi13cml0ZXIudGVzdC50cycsXG4gICAgICAnKiovX190ZXN0c19fL2pzb24td3JpdGVyLnRlc3QuanMnLFxuICAgIF0sXG4gICAgY292ZXJhZ2U6IHtcbiAgICAgIHByb3ZpZGVyOiAndjgnLFxuICAgICAgcmVwb3J0ZXI6IFsndGV4dCcsICdqc29uJywgJ2h0bWwnXSxcbiAgICAgIGV4Y2x1ZGU6IFsnbm9kZV9tb2R1bGVzLycsICdkaXN0LyddXG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBaVQsU0FBUyxvQkFBb0I7QUFFOVUsSUFBTyx3QkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBLElBQ0osYUFBYTtBQUFBLElBQ2IsU0FBUztBQUFBLElBQ1QsU0FBUztBQUFBLE1BQ1A7QUFBQSxNQUNBO0FBQUE7QUFBQTtBQUFBLE1BR0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUyxDQUFDLGlCQUFpQixPQUFPO0FBQUEsSUFDcEM7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
