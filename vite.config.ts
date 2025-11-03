import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            rollupOptions: {
              external: [
                "node-llama-cpp",
                "@node-llama-cpp/win-x64-cuda",
                "@node-llama-cpp/win-x64-vulkan",
                "@node-llama-cpp/win-x64",
                "@node-llama-cpp/mac-arm64-metal",
                "@node-llama-cpp/mac-x64",
                "@node-llama-cpp/linux-x64-cuda",
                "@node-llama-cpp/linux-x64-vulkan",
                "@node-llama-cpp/linux-x64",
                "@node-llama-cpp/linux-arm64",
              ],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
});
