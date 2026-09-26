import path from 'node:path';
import { SOURCE_ATTRIBUTE } from '../core/adapters/stamp';

export interface GrabbyBabelOptions {
  /** Paths are stamped relative to this. Default: process.cwd() */
  rootDir?: string;
  /** Attribute to stamp. Default: "data-grabby-loc" */
  attribute?: string;
}

/** React built-ins that take no DOM props, so stamping them does nothing useful. */
const SKIP = new Set(['Fragment', 'StrictMode', 'Suspense', 'SuspenseList', 'Profiler']);

/**
 * Stamps every JSX element with its `file:line:column` so grabby can
 * report where a grabbed element was written.
 *
 * Wire it through @vitejs/plugin-react:
 *
 *   react({ babel: { plugins: [grabbyBabelPlugin()] } })
 *
 * The attribute is prepended, so a `{...props}` spread still wins. That's
 * deliberate: for `<Button />` the stamp travels with the props onto the
 * rendered DOM node, and the grab points at the page rather than the library.
 */
export function grabbyBabelPlugin(options: GrabbyBabelOptions = {}) {
  const attribute = options.attribute ?? SOURCE_ATTRIBUTE;
  const rootDir = options.rootDir ?? process.cwd();

  return function grabbyReactSource({ types: t }: { types: any }) {
    return {
      name: 'grabby-react-source',
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
          // Components also record their name: production builds minify
          // function names, so the fiber would only say "vu" or "M".
          const component = componentName(node.name);
          const value = `${relative}:${loc.line}:${loc.column + 1}${component ? `:${component}` : ''}`;

          node.attributes.unshift(
            t.jsxAttribute(t.jsxIdentifier(attribute), t.stringLiteral(value)),
          );
        },
      },
    };
  };
}

/** `Card`, `Table.Row`: capitalised or member JSX names; native tags return null. */
function componentName(name: any): string | null {
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return /^[A-Z]/.test(name.name) ? name.name : null;
  if (name.type === 'JSXMemberExpression') {
    const object = name.object?.type === 'JSXIdentifier' ? name.object.name : componentName(name.object);
    return object && name.property?.name ? `${object}.${name.property.name}` : null;
  }
  return null;
}

function elementName(name: any): string | null {
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return elementName(name.property);
  return null;
}

export default grabbyBabelPlugin;
