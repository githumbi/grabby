// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryUi, getUiRoot, deepActiveElement, disposeUiRoot } from '../ui/root';
import { createCommentPopover } from '../toolbar/comment-popover';
import { saveHistory, flushPendingWrite, STORAGE_KEY } from '../storage/history-persistence';
import type { HistoryEntry } from '../types';

/**
 * A tab that is backgrounded, occluded or simply between frames gets no
 * requestAnimationFrame callbacks. Nothing that carries the user's comment may
 * depend on one arriving.
 */
describe('when no animation frame ever fires', () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    localStorage.clear();
    rafCallbacks = [];
    // Queue frames but never run them, the way an occluded tab behaves.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
    disposeUiRoot();
    localStorage.clear();
  });

  function entry(comment: string): HistoryEntry {
    return {
      id: comment,
      snippet: 's',
      timestamp: 1,
      comment,
      context: {
        html: '<b/>', componentName: null, filePath: null, line: null, column: null,
        componentStack: [], selector: 'b', cssClasses: [],
      },
    };
  }

  it('still writes history, via the timer fallback', () => {
    vi.useFakeTimers();
    saveHistory([entry('written without a frame')]);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(200);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).entries[0].comment).toBe('written without a frame');
    expect(rafCallbacks.length).toBe(1); // a frame was asked for, and never came
  });

  it('flushes on demand without waiting for the timer', () => {
    saveHistory([entry('flushed')]);
    flushPendingWrite();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).entries[0].comment).toBe('flushed');
  });

  it('focuses the comment textarea without a frame', () => {
    const popover = createCommentPopover({ onSubmit: vi.fn(), onCancel: vi.fn() });
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    popover.show({ anchor, mode: 'new' });

    expect(deepActiveElement()).toBe(queryUi('textarea'));
    popover.dispose();
  });

  it('submits on Enter even if focus never reached the textarea', () => {
    const onSubmit = vi.fn();
    const popover = createCommentPopover({ onSubmit, onCancel: vi.fn() });
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);

    popover.show({ anchor, mode: 'new' });
    const ta = queryUi('textarea')!;
    ta.value = 'typed anyway';
    ta.blur();
    (document.body as HTMLElement).focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toBe('typed anyway');
    popover.dispose();
  });

  it('leaves other input fields alone', () => {
    const onSubmit = vi.fn();
    const popover = createCommentPopover({ onSubmit, onCancel: vi.fn() });
    const anchor = document.createElement('div');
    const other = document.createElement('input');
    document.body.append(anchor, other);

    popover.show({ anchor, mode: 'new' });
    queryUi('textarea')!.value = 'not mine';
    other.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));

    expect(onSubmit).not.toHaveBeenCalled();
    popover.dispose();
  });
});
