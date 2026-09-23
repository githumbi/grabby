export const SOURCE_ATTRIBUTE = 'data-ag-loc';

const LOCATION = /^(.*):(\d+):(\d+)$/;

/**
 * Reads the `file:line:column` stamp the babel plugin puts on JSX elements,
 * walking up to the nearest ancestor that carries one.
 */
export function resolveSource(element: Element): {
  filePath: string | null;
  line: number | null;
  column: number | null;
} {
  let current: Element | null = element;
  while (current) {
    const raw = current.getAttribute?.(SOURCE_ATTRIBUTE);
    if (raw) return parseLocation(raw);
    current = current.parentElement;
  }
  return { filePath: null, line: null, column: null };
}

function parseLocation(raw: string): {
  filePath: string | null;
  line: number | null;
  column: number | null;
} {
  const match = LOCATION.exec(raw);
  if (!match) return { filePath: raw, line: null, column: null };
  return { filePath: match[1], line: Number(match[2]), column: Number(match[3]) };
}
