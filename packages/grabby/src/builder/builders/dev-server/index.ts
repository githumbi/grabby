import { createBuilder } from '@angular-devkit/architect';
import { executeDevServerBuilder } from '@angular/build';
import { grabbyEsbuildPlugin } from '../../../esbuild-plugin';

export default createBuilder(async function* (options: any, context) {
  yield* executeDevServerBuilder(options, context, {
    buildPlugins: [grabbyEsbuildPlugin({ rootDir: context.workspaceRoot })],
  });
});
