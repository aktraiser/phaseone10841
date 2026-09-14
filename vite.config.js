import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.js',
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'server/index.js' } },
  },
});
