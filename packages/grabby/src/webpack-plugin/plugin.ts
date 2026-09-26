import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export class GrabbyWebpackPlugin {
  apply(compiler: any) {
    const pluginDir = dirname(fileURLToPath(import.meta.url));

    compiler.options.module = compiler.options.module || {};
    compiler.options.module.rules = compiler.options.module.rules || [];
    compiler.options.module.rules.push({
      test: /\.component\.ts$/,
      enforce: 'pre' as const,
      use: [
        {
          loader: resolve(pluginDir, 'loader.js'),
        },
      ],
    });
  }
}
