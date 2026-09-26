import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import grabby from '@githumbi/grabby/plugin';

export default defineConfig({
  plugins: [grabby.vite(), vue()],
});
