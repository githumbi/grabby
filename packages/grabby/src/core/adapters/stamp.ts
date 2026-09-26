export const SOURCE_ATTRIBUTE = 'data-grabby-loc';

const LOCATION = /^(.*?):(\d+):(\d+)(?::([A-Za-z_$][\w$.]*))?$/;

/**
 * Reads the `file:line:column` stamp the Grabby build plugin puts on elements
 * (JSX and Vue templates), walking up to the nearest ancestor that has one.
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

export interface Stamp {
  file: string;
  line: number | null;
  column: number | null;
  /** The component written at that spot (`<Card …>`), when it was a component. */
  name: string | null;
}

/** The stamp on this exact element (not an ancestor's), if it has one. */
export function ownStamp(element: Element | null): Stamp | null {
  const raw = element?.getAttribute?.(SOURCE_ATTRIBUTE);
  if (!raw) return null;
  const match = LOCATION.exec(raw);
  if (!match) return { file: raw, line: null, column: null, name: null };
  return { file: match[1], line: Number(match[2]), column: Number(match[3]), name: match[4] ?? null };
}

/** True when the page was built with the Grabby source plugin. */
export function hasSourceStamps(): boolean {
  try {
    return document.querySelector(`[${SOURCE_ATTRIBUTE}]`) !== null;
  } catch {
    return false;
  }
}
