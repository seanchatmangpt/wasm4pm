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
      "**/__tests__/json-writer.test.js",
      // Integration test has shared module state (feedback-loop store) and experiences
      // race conditions in parallel execution. Run separately with:
      // npx vitest run src/__tests__/feedback-diagnosis-integration.test.ts
      "**/__tests__/feedback-diagnosis-integration.test.ts"
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9vYnNlcnZhYmlsaXR5XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvc2FjL3dhc200cG0vcGFja2FnZXMvb2JzZXJ2YWJpbGl0eS92aXRlc3QuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9zYWMvd2FzbTRwbS9wYWNrYWdlcy9vYnNlcnZhYmlsaXR5L3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnbm9kZScsXG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBleGNsdWRlOiBbXG4gICAgICAnKiovbm9kZV9tb2R1bGVzLyoqJyxcbiAgICAgICcqKi9kaXN0LyoqJyxcbiAgICAgIC8vIEpzb25Xcml0ZXIgdGVzdHMgaGF2ZSBvcGVuIGhhbmRsZXMgKGludmFsaWQtcGF0aCB3cml0ZSB0ZXN0IGhhbmdzIHNodXRkb3duIGxvb3ApLlxuICAgICAgLy8gUnVuIHNlcGFyYXRlbHkgd2l0aDogbnB4IHZpdGVzdCBydW4gX190ZXN0c19fL2pzb24td3JpdGVyLnRlc3QudHNcbiAgICAgICcqKi9fX3Rlc3RzX18vanNvbi13cml0ZXIudGVzdC50cycsXG4gICAgICAnKiovX190ZXN0c19fL2pzb24td3JpdGVyLnRlc3QuanMnLFxuICAgICAgLy8gSW50ZWdyYXRpb24gdGVzdCBoYXMgc2hhcmVkIG1vZHVsZSBzdGF0ZSAoZmVlZGJhY2stbG9vcCBzdG9yZSkgYW5kIGV4cGVyaWVuY2VzXG4gICAgICAvLyByYWNlIGNvbmRpdGlvbnMgaW4gcGFyYWxsZWwgZXhlY3V0aW9uLiBSdW4gc2VwYXJhdGVseSB3aXRoOlxuICAgICAgLy8gbnB4IHZpdGVzdCBydW4gc3JjL19fdGVzdHNfXy9mZWVkYmFjay1kaWFnbm9zaXMtaW50ZWdyYXRpb24udGVzdC50c1xuICAgICAgJyoqL19fdGVzdHNfXy9mZWVkYmFjay1kaWFnbm9zaXMtaW50ZWdyYXRpb24udGVzdC50cycsXG4gICAgXSxcbiAgICBjb3ZlcmFnZToge1xuICAgICAgcHJvdmlkZXI6ICd2OCcsXG4gICAgICByZXBvcnRlcjogWyd0ZXh0JywgJ2pzb24nLCAnaHRtbCddLFxuICAgICAgZXhjbHVkZTogWydub2RlX21vZHVsZXMvJywgJ2Rpc3QvJ11cbiAgICB9XG4gIH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpVCxTQUFTLG9CQUFvQjtBQUU5VSxJQUFPLHdCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsSUFDSixhQUFhO0FBQUEsSUFDYixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsTUFDUDtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUlBO0FBQUEsSUFDRjtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUyxDQUFDLGlCQUFpQixPQUFPO0FBQUEsSUFDcEM7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
