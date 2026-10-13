import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  // Source PNGs are personal working art; ship only explicitly imported runtime assets.
  publicDir: false,
  server: {
    port: 5173
  }
});
