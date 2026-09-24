import { defineConfig } from "vite";

export default defineConfig({
  base: "/HIFI-ViTacSim/",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
});
