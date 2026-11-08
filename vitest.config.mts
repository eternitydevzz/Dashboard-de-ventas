import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" rompe fuera de Next: en los tests es un módulo vacío
      "server-only": fileURLToPath(new URL("./tests/apoyo/vacio.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/apoyo/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Los de integración comparten la base de datos local: uno detrás de otro
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
