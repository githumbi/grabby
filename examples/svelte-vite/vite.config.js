import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// No Grabby build plugin needed: Svelte's dev build already records where
// every element was written.
export default defineConfig({
  plugins: [svelte()],
});
