import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig(({ mode }) => ({
  plugins: [glsl()],
  ...(mode === 'lib' ? {
    build: {
      lib: {
        entry: 'valis-api.ts',
        name: 'SplashValis',
        fileName: 'splash',
        formats: ['iife'],
      },
      rollupOptions: {
        // Keep external deps external if needed
      },
    },
  } : {}),
}));
