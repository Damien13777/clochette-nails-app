import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Alias @/ → src/ (le tsconfig mappe "@/*": ["./src/*"]). On n'utilise PAS
// vite-tsconfig-paths pour éviter une dépendance de plus.
const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcPath}/` }],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Série stricte : les fichiers DB partagent clochette_test + truncateAll,
    // ils ne doivent jamais se chevaucher. fileParallelism:false exécute les
    // fichiers l'un après l'autre ; au sein d'un fichier les tests sont
    // séquentiels par défaut (pas de test.concurrent).
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
