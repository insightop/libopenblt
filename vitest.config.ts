import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // 解析 __tests__/ 中 ../src/xxx.js → ../src/xxx.ts
      "../src": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
