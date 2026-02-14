import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: "/three-simplecloth/",
  server: {
    open: true,
    port: 3000,
  },
  build: {
    target: "es2022",
	outDir: 'web',
    emptyOutDir: false,
  },
  esbuild: {
    target: "es2022"
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022"
    }, 
  }
});
