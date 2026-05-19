// vitest.config.ts
import { defineConfig } from "file:///Users/sac/wasm4pm/node_modules/vitest/dist/config.js";
var vitest_config_default = defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 1e4,
    hookTimeout: 1e4,
    teardownTimeout: 1e4,
    isolate: true,
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    reporters: ["default"],
    outputFile: {
      json: "./reports/test-results.json",
      html: "./reports/test-results.html"
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9sYWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9zYWMvd2FzbTRwbS9sYWIvdml0ZXN0LmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvc2FjL3dhc200cG0vbGFiL3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICB0ZXN0VGltZW91dDogMTAwMDAsXG4gICAgaG9va1RpbWVvdXQ6IDEwMDAwLFxuICAgIHRlYXJkb3duVGltZW91dDogMTAwMDAsXG4gICAgaXNvbGF0ZTogdHJ1ZSxcbiAgICB0aHJlYWRzOiB0cnVlLFxuICAgIG1heFRocmVhZHM6IDQsXG4gICAgbWluVGhyZWFkczogMSxcbiAgICBpbmNsdWRlOiBbJ3Rlc3RzLyoqLyoudGVzdC50cyddLFxuICAgIGV4Y2x1ZGU6IFsnbm9kZV9tb2R1bGVzJywgJ2Rpc3QnXSxcbiAgICByZXBvcnRlcnM6IFsnZGVmYXVsdCddLFxuICAgIG91dHB1dEZpbGU6IHtcbiAgICAgIGpzb246ICcuL3JlcG9ydHMvdGVzdC1yZXN1bHRzLmpzb24nLFxuICAgICAgaHRtbDogJy4vcmVwb3J0cy90ZXN0LXJlc3VsdHMuaHRtbCcsXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF3UCxTQUFTLG9CQUFvQjtBQUVyUixJQUFPLHdCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixhQUFhO0FBQUEsSUFDYixhQUFhO0FBQUEsSUFDYixpQkFBaUI7QUFBQSxJQUNqQixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEsSUFDVCxZQUFZO0FBQUEsSUFDWixZQUFZO0FBQUEsSUFDWixTQUFTLENBQUMsb0JBQW9CO0FBQUEsSUFDOUIsU0FBUyxDQUFDLGdCQUFnQixNQUFNO0FBQUEsSUFDaEMsV0FBVyxDQUFDLFNBQVM7QUFBQSxJQUNyQixZQUFZO0FBQUEsTUFDVixNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsSUFDUjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
