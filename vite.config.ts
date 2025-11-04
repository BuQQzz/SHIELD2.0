import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import { visualizer } from "rollup-plugin-visualizer";
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
                "better-sqlite3",
                "playwright-core",
                "jsdom",
                "cheerio",
                "@mozilla/readability",
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React and core libs
          "react-vendor": ["react", "react-dom"],
          // UI libraries
          "ui-vendor": ["framer-motion", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-label", "@radix-ui/react-slot", "@radix-ui/react-switch", "@radix-ui/react-tabs"],
          // Markdown and syntax highlighting (heavy)
          "markdown-vendor": ["react-markdown", "remark-gfm", "react-syntax-highlighter"],
          // Utilities
          "utils-vendor": ["zustand", "date-fns", "clsx", "tailwind-merge"],
        },
      },
      plugins: [
        visualizer({
          filename: "./dist/stats.html",
          open: false,
          gzipSize: true,
          brotliSize: true,
        }),
      ],
    },
    // Enable code splitting
    chunkSizeWarningLimit: 500,
    minify: "esbuild",
  },
});
