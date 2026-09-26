// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCommentsPanel } from '../toolbar/comments-panel';
import { showToast, disposeToast } from '../overlay/toast';
import { init } from '../grab';
import { getUiRoot, getUiHost, disposeUiRoot, HOST_TAG } from '../ui/root';
import type { GrabbyAPI, GrabbyComment } from '../types';
import { makeComment, makeTarget } from './fixtures';

const PAYLOAD = '"><img src=x onerror="window.__pwned=1">';

function entry(comment: string, file: string): GrabbyComment {
  return makeComment({
    comment,
    author: { name: PAYLOAD, anonymous: false, sessionId: 's' },
    target: makeTarget({ component: PAYLOAD, source: { file, line: 1, column: 1 }, selector: 'div' }),
  });
}

describe('UI rendering never parses data as markup', () => {
  afterEach(() => {
    disposeToast();
    disposeUiRoot();
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).__pwned;
  });

  it('renders a hostile comment, author, component and file path in the panel as text', () => {
    const panel = createCommentsPanel({ onEdit: vi.fn(), onHover: vi.fn(), onDelete: vi.fn(), onCopyAll: vi.fn(), onClearAll: vi.fn() });
    panel.show([entry(PAYLOAD, `/src/${PAYLOAD}.ts`)]);

    const root = getUiRoot();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(PAYLOAD);
    const row = root.querySelector('.grabby-comment-row')!;
    expect(row.getAttribute('aria-label')).toBe(`Edit comment: ${PAYLOAD}`);
    expect(row.hasAttribute('onerror')).toBe(false);
    panel.dispose();
  });

  it('renders a hostile toast detail as text', () => {
    showToast(PAYLOAD, { detail: { componentName: PAYLOAD, filePath: PAYLOAD, line: 1, column: 1, cssClasses: [PAYLOAD] }, actions: [{ label: PAYLOAD, onClick: () => {} }] });
    const root = getUiRoot();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(PAYLOAD);
  });
});

describe('UI lives in one shadow root', () => {
  let api: GrabbyAPI;

  beforeEach(() => {
    document.body.innerHTML = '<button id="target">Go</button>';
    api = init({ mcpWebhook: false, persistHistory: false });
  });

  afterEach(() => {
    api.dispose();
    document.body.innerHTML = '';
  });

  it('adds nothing to <body> or <head> when the toolbar and toast render', () => {
    api.showToolbar();
    showToast('hello');
    expect(document.body.querySelector('[id^="__grabby"]')).toBeNull();
    expect(document.head.querySelector('style[data-grabby-style]')).toBeNull();
    expect(getUiHost()?.tagName.toLowerCase()).toBe(HOST_TAG);
    expect(getUiRoot().querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('removes the host on dispose', () => {
    api.showToolbar();
    api.dispose();
    expect(document.querySelector(HOST_TAG)).toBeNull();
  });
});

describe('activation shortcut', () => {
  let api: GrabbyAPI;

  beforeEach(() => {
    api = init({ mcpWebhook: false, persistHistory: false });
  });

  afterEach(() => {
    api.dispose();
  });

  function press(init: KeyboardEventInit) {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, ...init }));
    document.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, ...init }));
  }

  it('toggles on Option+G even though macOS reports the key as ©', () => {
    press({ key: '©', code: 'KeyG', altKey: true });
    expect(api.isActive()).toBe(true);
    press({ key: '©', code: 'KeyG', altKey: true });
    expect(api.isActive()).toBe(false);
  });

  it('leaves Cmd/Ctrl+C alone so normal copying still works', () => {
    const e = new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', metaKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(api.isActive()).toBe(false);
  });
});
