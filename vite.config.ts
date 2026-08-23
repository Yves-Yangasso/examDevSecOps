import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Sourcemaps activées : indispensables pour corréler une stack trace de
    // production avec le code source depuis l'outillage d'observabilité.
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Exclus : composition pure (App/main) et instrumentation, couverts par
      // les E2E sur le conteneur réel. Les compter ici gonflerait la métrique
      // sans rien vérifier de plus.
      exclude: ['src/main.tsx', 'src/App.tsx', 'src/observability/**', 'src/**/*.d.ts'],
      // Quality gate local : le pipeline échoue sous ces seuils.
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
