import path from 'node:path';
import { SOURCE_ATTRIBUTE } from '../react/resolvers/source-resolver';

export interface ReactGrabBabelOptions {
  /** Paths are stamped relative to this. Default: process.cwd() */
  rootDir?: string;
  /** Attribute to stamp. Default: "data-ag-loc" */
  attribute?: string;
}

/** React built-ins that take no DOM props, so stamping them does nothing useful. */
const SKIP = new Set(['Fragment', 'StrictMode', 'Suspense', 'SuspenseList', 'Profiler']);

/**
 * Stamps every JSX element with its `file:line:column` so angular-grab can
 * report where a grabbed element was written.
 *
 * Wire it through @vitejs/plugin-react:
 *
 *   react({ babel: { plugins: [reactGrabBabelPlugin()] } })
 *
 * The attribute is prepended, so a `{...props}` spread still wins. That's
 * deliberate: for `<Button />` the stamp travels with the props onto the
 * rendered DOM node, and the grab points at the page rather than the library.
 */
export function reactGrabBabelPlugin(options: ReactGrabBabelOptions = {}) {
  const attribute = options.attribute ?? SOURCE_ATTRIBUTE;
  const rootDir = options.rootDir ?? process.cwd();

  return function reactGrabSource({ types: t }: { types: any }) {
    return {
      name: 'react-grab-source',
      visitor: {
        JSXOpeningElement(nodePath: any, state: any) {
          const filename: string | undefined = state.filename ?? state.file?.opts?.filename;
          if (!filename || filename.includes('node_modules')) return;

          const node = nodePath.node;
          if (node.name?.type === 'JSXNamespacedName') return;

          const name = elementName(node.name);
          if (name && SKIP.has(name)) return;

          const already = node.attributes.some(
            (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === attribute,
          );
          if (already) return;

          const loc = node.loc?.start;
          if (!loc) return;

          const relative = path.relative(rootDir, filename).split(path.sep).join('/');
          const value = `${relative}:${loc.line}:${loc.column + 1}`;

          node.attributes.unshift(
            t.jsxAttribute(t.jsxIdentifier(attribute), t.stringLiteral(value)),
          );
        },
      },
    };
  };
}

function elementName(name: any): string | null {
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return elementName(name.property);
  return null;
}

export default reactGrabBabelPlugin;
