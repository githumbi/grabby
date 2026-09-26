// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryUi, getUiRoot, deepActiveElement, disposeUiRoot } from '../ui/root';
import { init } from '../grab';
import { STORAGE_KEY } from '../storage/history-persistence';
import type { GrabbyAPI } from '../types';

/**
 * A grab must survive a clipboard write that rejects. Chrome rejects
 * writeText whenever the document isn't focused, which used to drop the
 * user's comment from both the history and the webhook without a word.
 */
describe('grab with a failing clipboard', () => {
  let api: GrabbyAPI;
  let writeText: ReturnType<typeof vi.fn>;

  function setClipboard(impl: () => Promise<void>) {
    writeText = vi.fn(impl);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  }

  /** Drives the real select → comment → save flow. */
  async function grabWithComment(el: Element, comment: string) {
    // jsdom has no layout, so the picker's hit test needs pointing at the target
    document.elementFromPoint = () => el;
    api.activate();
    // the picker only tracks a hover once activated, and a click needs one
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await Promise.resolve();

    const textarea = queryUi<HTMLTextAreaElement>('textarea');
    if (!textarea) throw new Error('comment popover did not open');
    textarea.value = comment;
    textarea.focus(); // the popover only accepts Enter while the textarea has focus
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }),
    );
    await new Promise((r) => setTimeout(r, 0));
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<main><button id="target">Save</button></main>';
  });

  afterEach(() => {
    api?.dispose();
    document.body.innerHTML = '';
    disposeUiRoot();
    localStorage.clear();
  });

  it('keeps the comment in history when the clipboard rejects', async () => {
    setClipboard(() => Promise.reject(new DOMException('Document is not focused.', 'NotAllowedError')));
    api = init({ devOnly: false, mcpWebhook: false });

    await grabWithComment(document.getElementById('target')!, 'keep me');

    expect(writeText).toHaveBeenCalled();
    expect(api.getHistory().map((e) => e.comment)).toEqual(['keep me']);
  });

  it('persists that comment to storage', async () => {
    setClipboard(() => Promise.reject(new Error('nope')));
    api = init({ devOnly: false, mcpWebhook: false });

    await grabWithComment(document.getElementById('target')!, 'persist me');
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).entries[0].comment).toBe('persist me');
  });

  it('still fires onGrab so the webhook receives it', async () => {
    setClipboard(() => Promise.reject(new Error('nope')));
    api = init({ devOnly: false, mcpWebhook: false });
    const onGrab = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onGrab } });

    await grabWithComment(document.getElementById('target')!, 'forward me');

    expect(onGrab).toHaveBeenCalledTimes(1);
    expect(onGrab.mock.calls[0][2]).toBe('forward me');
  });

  it('reports the failure instead of staying silent', async () => {
    setClipboard(() => Promise.reject(new Error('nope')));
    api = init({ devOnly: false, mcpWebhook: false });
    const onCopyError = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onCopyError } });

    await grabWithComment(document.getElementById('target')!, 'tell me');

    expect(onCopyError).toHaveBeenCalledTimes(1);
    expect(getUiRoot().textContent).toContain('clipboard blocked');
  });

  it('does not claim a copy that never happened', async () => {
    setClipboard(() => Promise.reject(new Error('nope')));
    api = init({ devOnly: false, mcpWebhook: false });
    const onCopySuccess = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onCopySuccess } });

    await grabWithComment(document.getElementById('target')!, 'no copy');

    expect(onCopySuccess).not.toHaveBeenCalled();
  });

  it('still copies and reports success when the clipboard works', async () => {
    setClipboard(() => Promise.resolve());
    api = init({ devOnly: false, mcpWebhook: false });
    const onGrab = vi.fn();
    const onCopySuccess = vi.fn();
    api.registerPlugin({ name: 'probe', hooks: { onGrab, onCopySuccess } });

    await grabWithComment(document.getElementById('target')!, 'happy path');

    expect(api.getHistory().map((e) => e.comment)).toEqual(['happy path']);
    expect(onGrab).toHaveBeenCalledTimes(1);
    expect(onCopySuccess).toHaveBeenCalledTimes(1);
    expect(getUiRoot().textContent).toContain('Copied with comment');
  });
});
