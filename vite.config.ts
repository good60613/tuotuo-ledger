import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base 用相對路徑，之後 Capacitor 打包時（webDir = dist）不需要改。
export default defineConfig({
  base: './',
  plugins: [preact()],
  server: { host: true, port: 5173 },
  test: { environment: 'node' },
});
