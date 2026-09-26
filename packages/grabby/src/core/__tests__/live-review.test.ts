// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryUi, disposeUiRoot } from '../ui/root';
import { createGrabInstance } from '../grab';
import { createFinishSheet, type ReviewCounts } from '../toolbar/finish-sheet';
import type { GrabbyAPI } from '../types';

const counts = (c: Partial<ReviewCounts>): ReviewCounts => ({ total: 0, sent: 0, pending: 0, failed: 0, ...c });
const text = () => queryUi('[aria-label="Finish review"]')?.textContent ?? '';
function button(label: string): HTMLButtonElement {
  const btn = [...(queryUi('[aria-label="Finish review"]')?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label);
  if (!btn) throw new Error(`no "${label}" button`);
  return btn;
}

describe('finish sheet', () => {
  afterEach(() => { disposeUiRoot(); vi.useRealTimers(); });

  it('confirms when everything was sent', () => {
    const onDone = vi.fn();
    const sheet = createFinishSheet({ onDone, onRetry: vi.fn() });
    sheet.open(counts({ total: 3, sent: 3 }));
    expect(text()).toContain('All 3 comments were sent to the team');
    button('Done').click();
    expect(onDone).toHaveBeenCalledOnce();
    expect(sheet.isVisible()).toBe(false);
  });

  it('waits for comments still sending, then finishes by itself', () => {
    const onDone = vi.fn();
    const onRetry = vi.fn();
    const sheet = createFinishSheet({ onDone, onRetry });
    sheet.open(counts({ total: 2, sent: 1, pending: 1 }));
    expect(text()).toContain('1 comment still sending');
    button('Done').click();
    expect(onRetry).toHaveBeenCalledOnce();
    expect(button('Sending…').disabled).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    sheet.update(counts({ total: 2, sent: 2 }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('after a while, says pending comments will go on the next visit', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const sheet = createFinishSheet({ onDone, onRetry: vi.fn() });
    sheet.open(counts({ total: 1, pending: 1 }));
    button('Done').click();
    vi.advanceTimersByTime(15_000);
    expect(text()).toContain('sent the next time you open this site');
    button('Done').click();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('offers Try again for comments that failed', () => {
    const onRetry = vi.fn();
    createFinishSheet({ onDone: vi.fn(), onRetry }).open(counts({ total: 2, sent: 1, failed: 1 }));
    expect(text()).toContain('1 comment couldn\'t be sent');
    button('Try again').click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('live review', () => {
  let api: GrabbyAPI;
  let status = 503;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = '<button id="buy">Buy</button>';
    status = 503;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    api = createGrabInstance({ mode: 'live', server: 'https://feedback.test', projectKey: 'pk_x', identity: 'anonymous', screenshots: false });
  });

  afterEach(() => {
    api.dispose();
    vi.unstubAllGlobals();
  });

  async function comment(el: Element, value: string) {
    document.elementFromPoint = () => el;
    api.activate();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const textarea = queryUi<HTMLTextAreaElement>('textarea')!;
    textarea.value = value;
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await new Promise((r) => setTimeout(r, 20));
  }

  const leave = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('shows Finish review once there is a comment, with its delivery status', async () => {
    const finish = queryUi<HTMLButtonElement>('[data-grabby-btn="finish"]')!;
    expect(finish.hidden).toBe(true);
    await comment(document.getElementById('buy')!, 'Make it green');
    expect(finish.hidden).toBe(false);
    expect(queryUi('.grabby-toolbar-status')?.textContent).toBe('Sending…');
  });

  it('warns before leaving while a comment is unsent or half-typed', async () => {
    expect(leave()).toBe(false);
    await comment(document.getElementById('buy')!, 'Make it green');
    expect(leave()).toBe(true); // the server is down, so it's still pending

    status = 201;
    queryUi<HTMLButtonElement>('[data-grabby-btn="finish"]')!.click();
    [...queryUi('[aria-label="Finish review"]')!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(leave()).toBe(false);
    const el = document.getElementById('buy')!;
    document.elementFromPoint = () => el;
    api.activate();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 1, clientY: 1 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    queryUi<HTMLTextAreaElement>('textarea')!.value = 'Half a thought';
    expect(leave()).toBe(true);
  });

  it('Done sends the review, then keeps the toolbar with an empty list', async () => {
    status = 201;
    await comment(document.getElementById('buy')!, 'Make it green');
    await new Promise((r) => setTimeout(r, 30));
    expect(queryUi('.grabby-toolbar-status')?.textContent).toBe('1 sent');
    queryUi<HTMLButtonElement>('[data-grabby-btn="finish"]')!.click();
    [...queryUi('[aria-label="Finish review"]')!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(api.getComments()).toHaveLength(0);
    expect(queryUi('#__grabby-toolbar__')!.classList.contains('grabby-toolbar-hidden')).toBe(false);
    expect(queryUi<HTMLButtonElement>('[data-grabby-btn="finish"]')!.hidden).toBe(true);
    expect(queryUi<HTMLElement>('.grabby-toolbar-status')!.hidden).toBe(true);
    expect(queryUi('[aria-label="Finish review"]')).toBeNull();
  });

  it('Done keeps a comment that is still on its way', async () => {
    await comment(document.getElementById('buy')!, 'Make it green'); // server down: pending
    queryUi<HTMLButtonElement>('[data-grabby-btn="finish"]')!.click();
    vi.useFakeTimers();
    [...queryUi('[aria-label="Finish review"]')!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    [...queryUi('[aria-label="Finish review"]')!.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(api.getComments()).toHaveLength(1);
    expect(queryUi('#__grabby-toolbar__')!.classList.contains('grabby-toolbar-hidden')).toBe(false);
  });

  it('closing the toolbar with unsent comments opens the summary instead of leaving', async () => {
    await comment(document.getElementById('buy')!, 'Make it green');
    queryUi<HTMLButtonElement>('[data-grabby-btn="dismiss"]')!.click();
    expect(queryUi('[aria-label="Finish review"]')).not.toBeNull();
  });
});
