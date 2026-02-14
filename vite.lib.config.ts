import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      include: ['src'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [/^three(\/.*)?$/],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
	copyPublicDir:false,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
