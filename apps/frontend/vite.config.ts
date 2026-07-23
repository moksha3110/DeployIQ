import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Matches the shadcn/ui convention (components.json) so generated/
    // hand-written ui components under src/components/ui can be imported
    // as "@/components/ui/button" regardless of how deep the importing
    // file is nested.
    alias: { '@': path.resolve(dirname, './src') },
  },
  server: {
    port: 5173,
  },
  test: {
    // e2e/ holds Playwright specs (run via `npm run test:e2e`), which use a
    // different `test()` global — vitest must not try to collect them.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
