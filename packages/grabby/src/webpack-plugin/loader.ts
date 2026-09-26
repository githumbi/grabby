import { transformAngularComponent } from '../esbuild-plugin';

export default function grabbyLoader(this: any, source: string) {
  const callback = this.async();
  const filePath = this.resourcePath;

  if (!filePath.endsWith('.component.ts') || !source.includes('@Component')) {
    return callback(null, source);
  }

  const rootDir = this.rootContext || process.cwd();
  const result = transformAngularComponent(source, filePath, rootDir);

  callback(null, result?.code || source);
}
