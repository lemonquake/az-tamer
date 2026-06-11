import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: { port: Number(process.env.PORT) || 5180 }
});
