// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryUi, getUiRoot, disposeUiRoot } from '../ui/root';
import { init } from '../grab';
import { STORAGE_KEY } from '../storage/history-persistence';
import type { GrabbyAPI } from '../types';

/** Drives the real flow: select mode → click an element → type → Enter. */
describe('commenting and copying', () => {
  let api: GrabbyAPI;
  let writeText: ReturnType<typeof vi.fn>;

  function setClipboard(impl: (text: string) => Promise<void>) {
    writeText = vi.fn(impl);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  }

  async function comment(el: Element, text: string) {
    // jsdom has no layout, so the picker's hit test needs pointing at the target
    document.elementFromPoint = () => el;
    api.activate();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const textarea = queryUi<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('comment popover did not open');
    textarea.value = text;
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
  }

  function click(selector: string) {
    const el = queryUi<HTMLElement>(selector);
    if (!el) throw new Error(`no ${selector}`);
    el.click();
  }

  async function openCopySheet() {
    api.showToolbar();
    click('[data-grabby-btn="history"]');
    click('[data-grabby-copy-all]');
    await Promise.resolve();
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <main>
        <button id="save" class="btn md:px-4" type="submit"><svg id="icon"></svg> Save <input type="hidden" value="csrf-secret"></button>
        <input id="email" type="email" value="jane@example.com" aria-label="Email">
      </main>`;
  });

  afterEach(() => {
    api?.dispose();
    document.body.innerHTML = '';
    disposeUiRoot();
    localStorage.clear();
  });

  it('saves the comment without touching the clipboard by default', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });

    await comment(document.getElementById('save')!, 'make it primary');

    expect(writeText).not.toHaveBeenCalled();
    expect(api.getComments().map((c) => c.comment)).toEqual(['make it primary']);
    expect(getUiRoot().textContent).toContain('Comment saved');
  });

  it('captures a compact target instead of outerHTML, and never field values', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });

    await comment(document.getElementById('save')!, 'a');
    await comment(document.getElementById('email')!, 'b');

    const [email, save] = api.getComments();
    expect(save.target.kind).toBe('action');
    expect(save.target.facts.label).toBe('Save');
    expect(JSON.stringify(save)).not.toContain('csrf-secret');
    expect(email.target.kind).toBe('field');
    expect(email.target.facts.label).toBe('Email');
    expect(JSON.stringify(email)).not.toContain('jane@example.com');
  });

  it('promotes a click on an icon inside a button to the button', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });

    await comment(document.getElementById('icon')!, 'icon click');

    expect(api.getComments()[0].target.tag).toBe('button');
  });

  it('persists comments and fires onComment', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });
    const onComment = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onComment } });

    await comment(document.getElementById('save')!, 'persist me');
    await new Promise((r) => setTimeout(r, 150));

    expect(onComment).toHaveBeenCalledTimes(1);
    expect(onComment.mock.calls[0][0].comment).toBe('persist me');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).entries[0].comment).toBe('persist me');
  });

  it('Copy & clear copies every comment, then clears them with an Undo', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });
    await comment(document.getElementById('save')!, 'first');
    await comment(document.getElementById('email')!, 'second');

    await openCopySheet();
    const preview = queryUi<HTMLTextAreaElement>('textarea')!.value;
    expect(preview).toContain('# UI feedback · 2 comments');
    click('[data-grabby-copy-clear]');
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledWith(preview);
    expect(api.getComments()).toHaveLength(0);
    expect(getUiRoot().textContent).toContain('Copied and cleared 2 comments');

    const undo = Array.from(getUiRoot().querySelectorAll<HTMLButtonElement>('.grabby-toast-action'))
      .find((b) => b.textContent === 'Undo')!;
    undo.click();
    expect(api.getComments().map((c) => c.comment)).toEqual(['second', 'first']);
  });

  it('Copy, keep comments leaves them in place for next time', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false });
    await comment(document.getElementById('save')!, 'keep me');

    await openCopySheet();
    click('[data-grabby-copy-keep]');
    await new Promise((r) => setTimeout(r, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(api.getComments()).toHaveLength(1);
  });

  it('clears nothing and explains when the clipboard refuses', async () => {
    setClipboard(() => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')));
    api = init({ mcpWebhook: false, screenshots: false });
    const onCopyError = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onCopyError } });
    await comment(document.getElementById('save')!, 'still here');

    await openCopySheet();
    click('[data-grabby-copy-clear]');
    await new Promise((r) => setTimeout(r, 0));

    expect(onCopyError).toHaveBeenCalledTimes(1);
    expect(api.getComments()).toHaveLength(1);
    expect(getUiRoot().textContent).toContain('blocked the clipboard');
    expect(queryUi('[data-grabby-copy-clear]')).not.toBeNull();
  });

  it('copies each comment immediately when copyOnComment is on', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ mcpWebhook: false, screenshots: false, copyOnComment: true });

    await comment(document.getElementById('save')!, 'instant');

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('instant');
    expect(api.getComments()).toHaveLength(1);
  });
});
