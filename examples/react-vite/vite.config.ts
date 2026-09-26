import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import grabby from '@githumbi/grabby/plugin';

export default defineConfig({
  plugins: [grabby.vite(), react()],
});
