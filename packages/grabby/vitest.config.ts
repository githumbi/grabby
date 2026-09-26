import { defineConfig } from 'vitest/config';
import { versionDefines } from './build-constants';

export default defineConfig({
  define: versionDefines,
});
