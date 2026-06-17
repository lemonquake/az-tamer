import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: {
    port: Number(process.env.PORT) || 5180,
    watch: {
      ignored: ['**/.vs/**']
    }
  },
  plugins: [
    {
      name: 'copy-music',
      closeBundle() {
        const src = path.resolve(__dirname, 'music');
        const dest = path.resolve(__dirname, 'dist/music');
        if (fs.existsSync(src)) {
          fs.mkdirSync(dest, { recursive: true });
          fs.cpSync(src, dest, { recursive: true });
        }
      }
    }
  ]
});

