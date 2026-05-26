import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Ensure all output filenames use only alphanumeric, _, -, . characters
        // (YouTube Playables requirement — no special chars allowed)
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: undefined,
      }
    }
  },
  server: {
    port: 8080,
    host: true
  }
});