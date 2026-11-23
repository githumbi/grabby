// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryUi, disposeUiRoot } from '../ui/root';
import { init, createGrabInstance } from '../grab';
import type { GrabbyAPI } from '../types';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** jsdom has no layout: give elements a box so markers can be placed. */
function giveBox(el: Element, left: number, top: number, width = 100, height = 40) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
}

function markers(): HTMLButtonElement[] {
  return [...(queryUi('#__grabby-markers__')?.querySelectorAll<HTMLButtonElement>('.grabby-marker') ?? [])]
    .filter((m) => !m.classList.contains('grabby-marker-out'));
}

describe('numbered markers', () => {
  let api: GrabbyAPI;

  async function comment(el: Element, text: string, at = { x: 1, y: 1 }) {
    document.elementFromPoint = () => el;
    api.activate();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: at.x, clientY: at.y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
    const textarea = queryUi<HTMLTextAreaElement>('textarea')!;
    textarea.value = text;
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await wait(0);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    document.body.innerHTML = '<h1 id="title">Title</h1><button id="buy">Buy</button>';
    giveBox(document.getElementById('title')!, 10, 20, 200, 40);
    giveBox(document.getElementById('buy')!, 10, 100, 80, 30);
    api = init({ screenshots: false });
    api.showToolbar();
  });

  afterEach(() => {
    api.dispose();
    document.body.innerHTML = '';
    disposeUiRoot();
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('numbers commented elements in order and pins each where it was clicked', async () => {
    await comment(document.getElementById('title')!, 'Bigger heading', { x: 60, y: 30 });
    await comment(document.getElementById('buy')!, 'Make it green', { x: 50, y: 115 });
    await wait(20);
    const [first, second] = markers();
    expect(markers().map((m) => m.textContent)).toEqual(['1', '2']);
    expect(first.getAttribute('aria-label')).toContain('Bigger heading');
    // Clicked 50px into a 200px-wide heading, 10px down: the pin is centred there (22px marker).
    expect(first.style.transform).toBe('translate(49px, 19px)');
    expect(second.hidden).toBe(false);
    expect(api.getComments().find((c) => c.comment === 'Bigger heading')!.pin).toEqual({ x: 0.25, y: 0.25 });
  });

  it('clicking a marker opens the comment for editing, with Save and Delete', async () => {
    await comment(document.getElementById('buy')!, 'Make it green');
    markers()[0].click();
    const textarea = queryUi<HTMLTextAreaElement>('textarea')!;
    expect(textarea.value).toBe('Make it green');
    textarea.value = 'Make it dark green';
    queryUi<HTMLButtonElement>('[data-grabby-save]')!.click();
    expect(api.getComments()[0].comment).toBe('Make it dark green');
    expect(queryUi('textarea')).toBeNull();

    markers()[0].click();
    queryUi<HTMLButtonElement>('[data-grabby-delete]')!.click();
    expect(api.getComments()).toHaveLength(0);
    expect(markers()).toHaveLength(0);
  });

  it('shows only the current page\'s markers, and brings them back on return', async () => {
    await comment(document.getElementById('buy')!, 'Make it green');
    expect(markers()).toHaveLength(1);

    history.pushState(null, '', '/other');
    await wait(350);
    expect(markers()).toHaveLength(0);

    await comment(document.getElementById('title')!, 'Other page note');
    expect(markers().map((m) => m.textContent)).toEqual(['1']);

    history.pushState(null, '', '/');
    await wait(350);
    expect(markers()).toHaveLength(1);
    expect(markers()[0].getAttribute('aria-label')).toContain('Make it green');
  });

  it('counts hash routes as separate pages', async () => {
    history.replaceState(null, '', '/#/requests');
    await wait(350);
    await comment(document.getElementById('buy')!, 'On requests');
    expect(markers()).toHaveLength(1);
    history.pushState(null, '', '/#/dashboard');
    await wait(350);
    expect(markers()).toHaveLength(0);
  });

  it('hides markers while the toolbar is collapsed', async () => {
    await comment(document.getElementById('buy')!, 'Make it green');
    queryUi<HTMLButtonElement>('[data-grabby-btn="dismiss"]')!.click();
    expect(markers()).toHaveLength(0);
    queryUi<HTMLButtonElement>('[data-grabby-btn="expand"]')!.click();
    expect(markers()).toHaveLength(1);
  });

  it('hides the marker of an element that is no longer rendered', async () => {
    await comment(document.getElementById('buy')!, 'Make it green');
    giveBox(document.getElementById('buy')!, 0, 0, 0, 0);
    await wait(30);
    expect(markers()[0].hidden).toBe(true);
  });
});

describe('marker position stays in the browser', () => {
  afterEach(() => {
    disposeUiRoot();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('is not sent to the collector', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<button id="buy">Buy</button>';
    const el = document.getElementById('buy')!;
    giveBox(el, 0, 0, 80, 30);
    const api = createGrabInstance({ mode: 'live', server: 'https://feedback.test', projectKey: 'pk_x', identity: 'anonymous', screenshots: false });
    document.elementFromPoint = () => el;
    api.activate();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    const textarea = queryUi<HTMLTextAreaElement>('textarea')!;
    textarea.value = 'Hi';
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await wait(30);
    expect(api.getComments()[0].pin).toBeDefined();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/v1/comments'))!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body.comment.comment).toBe('Hi');
    expect(body.comment).not.toHaveProperty('pin');
    api.dispose();
  });
});
