// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHistoryPopover } from '../toolbar/history-popover';
import { showToast, disposeToast } from '../overlay/toast';
import { init } from '../grab';
import { getUiRoot, getUiHost, disposeUiRoot, HOST_TAG } from '../ui/root';
import type { GrabbyAPI, HistoryEntry } from '../types';

const PAYLOAD = '"><img src=x onerror="window.__pwned=1">';

function entry(comment: string, filePath: string | null = null): HistoryEntry {
  return {
    id: `id-${comment.length}`,
    context: {
      html: '<div></div>',
      componentName: PAYLOAD,
      filePath,
      line: 1,
      column: 1,
      componentStack: [],
      selector: 'div',
      cssClasses: [],
    },
    snippet: '',
    timestamp: Date.now(),
    comment,
  };
}

describe('UI rendering never parses data as markup', () => {
  afterEach(() => {
    disposeToast();
    disposeUiRoot();
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).__pwned;
  });

  it('renders a hostile comment, component name and file path in history as text', () => {
    const popover = createHistoryPopover({ onEntryClick: vi.fn(), onEntryHover: vi.fn(), onClearAll: vi.fn() });
    popover.show([entry(PAYLOAD, `/src/${PAYLOAD}.ts`)]);

    const root = getUiRoot();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(PAYLOAD);
    const row = root.querySelector('.grabby-history-item')!;
    expect(row.getAttribute('aria-label')).toBe(`Edit comment for ${PAYLOAD}`);
    expect(row.hasAttribute('onerror')).toBe(false);
    popover.dispose();
  });

  it('renders a hostile toast detail as text', () => {
    showToast(PAYLOAD, { componentName: PAYLOAD, filePath: PAYLOAD, line: 1, column: 1, cssClasses: [PAYLOAD] });
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
