import { defineConfig } from "./src/core/define-config.js";

export default defineConfig({
  threshold: 8,
  coverageMetric: "line",
  thresholds: {
    "src/domain/**": 8,
    "src/adapters/**": 12,
    "src/cli/**": 12,
  },
});
