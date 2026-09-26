import ts from 'typescript';
import path from 'path';
import fs from 'fs';

export interface ComponentSourceInfo {
  file: string;
  line: number;
}

export type SourceMap = Record<string, ComponentSourceInfo>;

/**
 * Scans the project for `.component.ts` files and extracts component
 * class names with their source locations. Returns a map of
 * `{ ComponentName: { file, line } }`.
 */
export function scanComponentSources(rootDir: string): SourceMap {
  const sourceMap: SourceMap = {};
  const files = findTypeScriptFiles(rootDir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('@Component')) continue;

    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const components = extractComponents(content, filePath);

    for (const comp of components) {
      sourceMap[comp.name] = { file: relativePath, line: comp.line };
    }
  }

  return sourceMap;
}

interface ComponentInfo {
  name: string;
  line: number;
}

function extractComponents(code: string, filePath: string): ComponentInfo[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const results: ComponentInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      const decorators = ts.getDecorators(node);
      if (!decorators) return;

      const hasComponent = decorators.some((d) => {
        if (!ts.isCallExpression(d.expression)) return false;
        if (!ts.isIdentifier(d.expression.expression)) return false;
        return d.expression.expression.text === 'Component';
      });

      if (hasComponent) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        results.push({ name: node.name.text, line: line + 1 });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

function findTypeScriptFiles(rootDir: string): string[] {
  const results: string[] = [];
  const srcDir = path.join(rootDir, 'src');

  if (!fs.existsSync(srcDir)) return results;

  walk(srcDir, results);
  return results;
}

function walk(dir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, results);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
}
