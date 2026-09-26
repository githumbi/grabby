import { IGNORE_ATTR, MASK_ATTR } from './preview';
import { HOST_TAG } from '../ui/root';

export interface Screenshot {
  blob: Blob;
  width: number;
  height: number;
}

/** Longest side of the saved image, in pixels. */
const MAX_SIDE = 1200;
/** Tall elements are cropped rather than shrunk into an unreadable strip. */
const MAX_CSS_HEIGHT = 1600;
const TIMEOUT_MS = 5000;

function keepNode(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  if (node.tagName.toLowerCase() === HOST_TAG) return false;
  return !node.hasAttribute(IGNORE_ATTR);
}

function blurMasked(cloned: Node): void {
  if (cloned instanceof HTMLElement && cloned.hasAttribute(MASK_ATTR)) {
    cloned.style.filter = 'blur(8px)';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/**
 * Renders the element to an image. The renderer is loaded on first use so it
 * costs nothing until someone actually comments. Resolves to null instead of
 * throwing: a missing screenshot must never cost the user their comment.
 */
export async function captureScreenshot(el: Element): Promise<Screenshot | null> {
  if (typeof window === 'undefined' || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;

  const cssWidth = Math.min(rect.width, document.documentElement.scrollWidth || rect.width);
  const cssHeight = Math.min(rect.height, MAX_CSS_HEIGHT);
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(dpr, MAX_SIDE / Math.max(cssWidth, cssHeight));

  const render = async (): Promise<Screenshot | null> => {
    const { domToBlob } = await import('modern-screenshot');
    const blob = await domToBlob(el, {
      width: cssWidth,
      height: cssHeight,
      scale,
      type: 'image/webp',
      quality: 0.8,
      filter: keepNode,
      onCloneEachNode: blurMasked,
      // The renderer strips the root's margins, which lets the browser's
      // default margin for h1/p/ul come back and shift the content down.
      style: { margin: '0' },
      timeout: TIMEOUT_MS,
    });
    if (!blob) return null;
    return { blob, width: Math.round(cssWidth * scale), height: Math.round(cssHeight * scale) };
  };

  return withTimeout(render(), TIMEOUT_MS + 1000);
}
