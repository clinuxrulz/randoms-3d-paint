import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  base: "",
  plugins: [tailwindcss(), solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
