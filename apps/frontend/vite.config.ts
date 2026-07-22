import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // e2e/ holds Playwright specs (run via `npm run test:e2e`), which use a
    // different `test()` global — vitest must not try to collect them.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
