// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryUi, disposeUiRoot } from '../ui/root';
import { init } from '../grab';
import { formatExport } from '../capture/export';
import { elementsInBox, areaWithin, commonContainer } from '../picker/region';
import type { GrabbyAPI, GrabbyComment } from '../types';

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** jsdom has no layout: give elements a box. */
function giveBox(el: Element, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
}

const byId = (id: string) => document.getElementById(id)!;

function layout() {
  document.body.innerHTML = `
    <main id="main">
      <div id="actions" class="actions">
        <button id="approve">Approve</button>
        <button id="reject">Reject</button>
      </div>
      <p id="note">Totals update nightly.</p>
      <div id="empty" class="spacer"></div>
    </main>`;
  giveBox(document.body, 0, 0, 1000, 800);
  giveBox(byId('main'), 0, 0, 1000, 800);
  giveBox(byId('actions'), 100, 100, 300, 60);
  giveBox(byId('approve'), 110, 110, 120, 40);
  giveBox(byId('reject'), 250, 110, 120, 40);
  giveBox(byId('note'), 100, 200, 400, 30);
  giveBox(byId('empty'), 100, 300, 600, 300);
}

const ui = (el: Element) => !!el.closest('grabby-root');

describe('which elements a drag box selects', () => {
  beforeEach(layout);
  afterEach(() => { document.body.innerHTML = ''; });

  it('takes the outermost elements that are inside the box', () => {
    expect(elementsInBox({ left: 90, top: 90, right: 520, bottom: 240 }, ui).map((e) => e.id)).toEqual(['actions', 'note']);
  });

  it('takes the children when their parent is only partly inside', () => {
    expect(elementsInBox({ left: 105, top: 105, right: 380, bottom: 155 }, ui).map((e) => e.id)).toEqual(['approve', 'reject']);
  });

  it('counts an element that is almost entirely inside', () => {
    // 116 of 120 px of "approve" is inside (97%).
    expect(elementsInBox({ left: 114, top: 105, right: 240, bottom: 155 }, ui).map((e) => e.id)).toEqual(['approve']);
  });

  it('finds the element around a group, and an area as fractions', () => {
    expect(commonContainer([byId('approve'), byId('reject')]).id).toBe('actions');
    expect(areaWithin(byId('empty'), { left: 160, top: 330, right: 460, bottom: 480 })).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });
});

describe('commenting on several elements or an area', () => {
  let api: GrabbyAPI;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    layout();
    api = init({ screenshots: false });
    api.showToolbar();
  });

  afterEach(() => {
    api.dispose();
    document.body.innerHTML = '';
    disposeUiRoot();
    localStorage.clear();
    sessionStorage.clear();
  });

  function mouse(type: string, x: number, y: number, extra: MouseEventInit = {}) {
    document.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
  }

  async function drag(from: [number, number], to: [number, number]) {
    document.elementFromPoint = () => byId('main');
    api.activate();
    mouse('mousedown', ...from);
    mouse('mousemove', from[0] + 10, from[1] + 10);
    mouse('mousemove', ...to);
    await wait(30);
    mouse('mouseup', ...to);
    mouse('click', ...to);
  }

  async function type(text: string) {
    const textarea = queryUi<HTMLTextAreaElement>('textarea')!;
    textarea.value = text;
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, composed: true }));
    await wait();
  }

  it('drags across two buttons: one comment on both, about the group', async () => {
    await drag([105, 105], [380, 155]);
    expect(queryUi('.grabby-cp-heading')?.textContent).toBe('2 elements: Button “Approve”, Button “Reject”');
    // The page doesn't see the press (no text selection, no menus opening).
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    byId('note').dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);

    await type('Make these the same width');
    const [c] = api.getComments();
    expect(c.target.selector).toBe('#actions');
    expect(c.members?.map((m) => [m.selector, m.label])).toEqual([['#approve', 'Button “Approve”'], ['#reject', 'Button “Reject”']]);
    expect(c.area).toBeUndefined();
    expect(queryUi('.grabby-marker')?.classList.contains('grabby-marker-group')).toBe(true);
  });

  it('a drag that takes in one element is an ordinary comment', async () => {
    await drag([105, 195], [510, 235]);
    expect(queryUi('.grabby-cp-heading')).toBeNull();
    await type('Say when');
    const [c] = api.getComments();
    expect(c.target.selector).toBe('#note');
    expect(c.members).toBeUndefined();
  });

  it('a drag over empty space comments on that area', async () => {
    document.elementsFromPoint = () => [byId('empty'), byId('main'), document.body];
    await drag([160, 330], [460, 480]);
    expect(queryUi('.grabby-cp-heading')?.textContent).toMatch(/^Area in /);
    await type('Put the chart here');
    const [c] = api.getComments();
    expect(c.target.selector).toBe('#empty');
    expect(c.area).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  it('the box ends where the button comes up, even after few move events', async () => {
    document.elementFromPoint = () => byId('main');
    api.activate();
    mouse('mousedown', 90, 90);
    mouse('mousemove', 115, 115); // only a short way in
    await wait(30);
    mouse('mouseup', 520, 240);
    mouse('click', 520, 240);
    expect(queryUi('.grabby-cp-heading')?.textContent).toMatch(/^2 elements: /);
    await type('Tidy this block');
    expect(api.getComments()[0].members?.map((m) => m.selector)).toEqual(['#actions', '#note']);
  });

  it('drags still work on a page that cancels pointerdown (no mousemove arrives)', async () => {
    // Like the cash repatriation prototype: keeps its menus shut while Grabby picks.
    const guard = (e: Event) => {
      if (document.body.classList.contains('grabby-crosshair-active')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) window.addEventListener(t, guard, true);
    try {
      document.elementFromPoint = () => byId('main');
      api.activate();
      // The browser sends only pointer events during the drag, then the click.
      mouse('pointerdown', 105, 105);
      mouse('pointermove', 200, 130);
      mouse('pointermove', 380, 155);
      await wait(30);
      mouse('pointerup', 380, 155);
      mouse('click', 380, 155);
      expect(queryUi('.grabby-cp-heading')?.textContent).toBe('2 elements: Button “Approve”, Button “Reject”');
    } finally {
      for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) window.removeEventListener(t, guard, true);
    }
  });

  it('a plain click still comments on one element', async () => {
    document.elementFromPoint = () => byId('approve');
    api.activate();
    mouse('mousemove', 120, 120);
    mouse('mousedown', 120, 120);
    mouse('mouseup', 121, 121);
    byId('approve').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 121, clientY: 121 }));
    await type('Green');
    expect(api.getComments()[0].target.selector).toBe('#approve');
  });

  it('⌘/Ctrl-click collects elements; letting go of the key opens one comment for them', async () => {
    api.activate();
    for (const [id, x] of [['approve', 120], ['note', 150]] as const) {
      document.elementFromPoint = () => byId(id);
      mouse('mousemove', x, x);
      byId(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: x, metaKey: true, ctrlKey: true }));
    }
    expect(queryUi('textarea')).toBeNull();
    expect(queryUi('.grabby-group-label')?.textContent).toMatch(/^2 elements/);
    for (const key of ['Meta', 'Control']) window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    expect(queryUi('.grabby-cp-heading')?.textContent).toBe('2 elements: Button “Approve”, Text “Totals update nightly.”');
    await type('Align these');
    expect(api.getComments()[0].members?.map((m) => m.selector)).toEqual(['#approve', '#note']);
    expect(api.getComments()[0].target.selector).toBe('#main');
  });
});

describe('exporting multi-element and area comments', () => {
  const base: Omit<GrabbyComment, 'id' | 'comment' | 'target'> = {
    createdAt: 1, updatedAt: 1, status: 'open', screenshot: null, framework: 'React',
    author: { name: null, anonymous: true, sessionId: 'abcd1234-0000-0000-0000-000000000000' },
    page: { route: '/', title: '', viewport: [1280, 800] },
  };
  const target = (selector: string, file: string | null) => ({
    kind: 'container' as const, tag: 'div', component: 'Actions', source: file ? { file, line: 10, column: 1 } : null,
    stack: [], selector, preview: '<div class="actions">', facts: {}, extra: {},
  });

  it('lists every element of a group with where it lives', () => {
    const text = formatExport([{
      ...base, id: 'a', comment: 'Same width', target: target('#actions', 'src/Actions.tsx'),
      members: [
        { kind: 'action', tag: 'button', component: 'Actions', source: { file: 'src/Actions.tsx', line: 12, column: 3 }, selector: '#approve', preview: '<button>Approve</button>', label: 'Button "Approve"' },
        { kind: 'action', tag: 'button', component: 'Actions', source: { file: 'src/Actions.tsx', line: 13, column: 3 }, selector: '#reject', preview: '<button>Reject</button>', label: 'Button "Reject"' },
      ],
    }]);
    expect(text).toContain('   - in `<div class="actions">` (container)');
    expect(text).toContain('   - 2 elements:');
    expect(text).toContain('     - `<button>Approve</button>` (action) Actions.tsx:12');
    expect(text).toContain('     - `<button>Reject</button>` (action) Actions.tsx:13');
    expect(formatExport([{ ...base, id: 'a', comment: 'x', target: target('#actions', null), members: [] }], 'compact')).not.toContain('elements');
  });

  it('says where an area is inside its element', () => {
    const text = formatExport([{ ...base, id: 'b', comment: 'Chart here', target: target('#empty', null), area: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } }]);
    expect(text).toContain('   - area in `<div class="actions">` (container)');
    expect(text).toContain('   - region: 10% from left, 20% from top, 50% wide, 25% tall');
    const compact = formatExport([{ ...base, id: 'b', comment: 'Chart here', target: target('#empty', null), area: { x: 0, y: 0, w: 1, h: 1 } }], 'compact');
    expect(compact).toContain('1. [area] in #empty Actions <div> — Chart here');
  });
});
