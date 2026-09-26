import { SOURCE_ATTRIBUTE } from '../core/adapters/stamp';

interface TemplateNode {
  type: number;
  tag?: string;
  tagType?: number;
  loc: { start: { offset: number; line: number; column: number } };
  props?: Array<{ type: number; name: string }>;
  children?: TemplateNode[];
}

const NODE_ELEMENT = 1;
const TAG_ELEMENT = 0;

type SfcCompiler = { parse: (code: string, opts: { filename: string }) => { descriptor: { template: { lang?: string; ast?: TemplateNode } | null } } };
let compiler: SfcCompiler | null | undefined;

async function loadCompiler(): Promise<SfcCompiler | null> {
  if (compiler !== undefined) return compiler;
  try {
    compiler = (await import('vue/compiler-sfc')) as unknown as SfcCompiler;
  } catch {
    compiler = null;
  }
  return compiler;
}

/**
 * Stamps every native element in a Vue SFC template with `file:line:col`.
 * Component tags are left alone: their attributes fall through onto the
 * child's root element and would overwrite the child's own, more precise
 * stamp. Uses the app's own `vue/compiler-sfc`, so it always matches the
 * installed Vue version.
 */
export async function stampVue(code: string, relativePath: string, attribute = SOURCE_ATTRIBUTE) {
  if (!code.includes('<template')) return null;
  const sfc = await loadCompiler();
  if (!sfc) return null;

  let template;
  try {
    template = sfc.parse(code, { filename: relativePath }).descriptor.template;
  } catch {
    return null;
  }
  // Pug and other template languages have no HTML AST to stamp.
  if (!template?.ast || (template.lang && template.lang !== 'html')) return null;

  const inserts: Array<{ at: number; text: string }> = [];
  const visit = (node: TemplateNode) => {
    if (node.type === NODE_ELEMENT && node.tagType === TAG_ELEMENT && node.tag) {
      const at = node.loc.start.offset + 1 + node.tag.length;
      const alreadyStamped = node.props?.some((p) => p.name === attribute);
      // Guard against offsets that don't line up with the source.
      if (!alreadyStamped && code.slice(node.loc.start.offset, at) === `<${node.tag}`) {
        const { line, column } = node.loc.start;
        inserts.push({ at, text: ` ${attribute}="${relativePath}:${line}:${column}"` });
      }
    }
    node.children?.forEach(visit);
  };
  visit(template.ast);
  if (inserts.length === 0) return null;

  let out = code;
  for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, at) + text + out.slice(at);
  }
  return { code: out, map: null };
}
