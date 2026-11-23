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

const SANDBOX_HTML = '<!DOCTYPE html><meta charset="UTF-8"><title></title><body>';
let sandbox: HTMLIFrameElement | null = null;
let policy: { createHTML(s: string): unknown } | null | undefined;

/**
 * The HTML to give the sandbox, as a TrustedHTML where the Trusted Types API
 * exists. Returns null when the page's CSP won't let us create the "grabby"
 * policy; the sandbox then stays about:blank rather than violate the CSP.
 */
function sandboxHtml(): unknown | null {
  const tt = (window as unknown as { trustedTypes?: { createPolicy(n: string, r: { createHTML(s: string): string }): { createHTML(s: string): unknown } } }).trustedTypes;
  if (!tt) return SANDBOX_HTML;
  if (policy === undefined) {
    try {
      policy = tt.createPolicy('grabby', { createHTML: (html: string) => (html === SANDBOX_HTML ? html : '') });
    } catch {
      policy = null;
    }
  }
  return policy ? policy.createHTML(SANDBOX_HTML) : null;
}

/**
 * The renderer needs a blank document to read default styles from. It would
 * create one by assigning iframe.srcdoc, which pages enforcing Trusted Types
 * block, so we hand it one we made safely, and reuse it between captures.
 */
async function getSandbox(): Promise<HTMLIFrameElement> {
  if (sandbox?.isConnected) return sandbox;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.setAttribute(IGNORE_ATTR, '');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', visibility: 'hidden', pointerEvents: 'none' });
  document.documentElement.appendChild(frame);
  const html = sandboxHtml();
  if (html !== null) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      frame.addEventListener('load', done, { once: true });
      setTimeout(done, 1000);
      try {
        (frame as unknown as { srcdoc: unknown }).srcdoc = html;
      } catch {
        done();
      }
    });
  }
  sandbox = frame;
  return frame;
}

export function disposeScreenshotSandbox(): void {
  sandbox?.remove();
  sandbox = null;
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
/** A region to keep, in viewport coordinates (a multi-element or area comment). */
export interface ClipBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A clipped region further down than this inside its element isn't rendered (too costly). */
const MAX_CLIP_DEPTH = 4000;

const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

export async function captureScreenshot(el: Element, clip?: ClipBox): Promise<Screenshot | null> {
  if (typeof window === 'undefined' || !el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;

  const fullWidth = Math.min(rect.width, document.documentElement.scrollWidth || rect.width);
  // With a clip, render the element down to the clip's bottom, then crop.
  const region = clip ? {
    x: clamp(clip.left - rect.left, fullWidth),
    y: clamp(clip.top - rect.top, rect.height),
    right: clamp(clip.right - rect.left, fullWidth),
    bottom: clamp(clip.bottom - rect.top, rect.height),
  } : null;
  if (region && (region.right - region.x < 1 || region.bottom - region.y < 1 || region.bottom > MAX_CLIP_DEPTH)) return null;

  const cssWidth = fullWidth;
  const cssHeight = region ? region.bottom : Math.min(rect.height, MAX_CSS_HEIGHT);
  const outWidth = region ? region.right - region.x : cssWidth;
  const outHeight = region ? Math.min(region.bottom - region.y, MAX_CSS_HEIGHT) : cssHeight;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(dpr, MAX_SIDE / Math.max(outWidth, outHeight));

  const render = async (): Promise<Screenshot | null> => {
    const { createContext, destroyContext, domToBlob, domToCanvas } = await import('modern-screenshot');
    const context = await createContext(el, {
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
    context.sandbox = await getSandbox();
    let blob: Blob | null;
    try {
      if (region) {
        const full = await domToCanvas(context);
        const crop = document.createElement('canvas');
        crop.width = Math.max(1, Math.round(outWidth * scale));
        crop.height = Math.max(1, Math.round(outHeight * scale));
        crop.getContext('2d')?.drawImage(full, region.x * scale, region.y * scale, outWidth * scale, outHeight * scale, 0, 0, crop.width, crop.height);
        blob = await new Promise<Blob | null>((resolve) => crop.toBlob(resolve, 'image/webp', 0.8));
      } else {
        blob = await domToBlob(context);
      }
    } finally {
      // Keep our sandbox for next time; free everything else.
      context.sandbox = undefined;
      destroyContext(context);
    }
    if (!blob) return null;
    return { blob, width: Math.round(outWidth * scale), height: Math.round(outHeight * scale) };
  };

  return withTimeout(render(), TIMEOUT_MS + 1000);
}
