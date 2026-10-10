import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in client/. In dev, Vite forwards /api calls to the
// Express server on port 3000. `npm run build` writes the app to dist/,
// which Express then serves on its own.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
