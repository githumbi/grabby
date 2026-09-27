// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { describeElement, describeTarget } from '../capture/describe';
import { createOverlayRenderer } from '../overlay/overlay-renderer';
import { makeTarget } from './fixtures';

function mount(html: string): void {
  document.body.innerHTML = html;
}
const $ = (sel: string) => document.querySelector(sel)!;

describe('plain-language element names for reviewers', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('names actions, fields and media the way people talk about them', () => {
    mount(`
      <button id="b">Back to the journey index</button>
      <a id="l" href="/pricing">Pricing</a>
      <div id="t" role="tab">Overview</div>
      <label for="e">Email address</label><input id="e" type="email" value="jane@example.com">
      <input id="s" type="search" placeholder="Search farmers">
      <select id="c" aria-label="Country"><option>Kenya</option></select>
      <img id="i" src="logo.png" alt="KCB logo">
      <svg id="v"></svg>`);
    expect(describeElement($('#b'))).toBe('Button “Back to the journey index”');
    expect(describeElement($('#l'))).toBe('Link “Pricing”');
    expect(describeElement($('#t'))).toBe('Tab “Overview”');
    expect(describeElement($('#e'))).toBe('Text box “Email address”');
    expect(describeElement($('#s'))).toBe('Search box “Search farmers”');
    expect(describeElement($('#c'))).toBe('Dropdown “Country”');
    expect(describeElement($('#i'))).toBe('Image “KCB logo”');
    expect(describeElement($('#v'))).toBe('Icon');
  });

  it('names text, groups of content, and the page', () => {
    mount(`
      <h2 id="h">KCB branch staff shell preview</h2>
      <p id="p">This role's screens aren't built yet.</p>
      <div id="card" style="box-shadow: 0 1px 3px #0003"><h3>Your plan</h3><p>Pro</p></div>
      <section id="sec"><h2>Loans</h2><p>x</p></section>
      <div id="box"><span>a</span><span>b</span></div>
      <nav id="n"><a href="/">Home</a></nav>
      <ul id="ul"><li>One</li><li>Two</li></ul>`);
    expect(describeElement($('#h'))).toBe('Heading “KCB branch staff shell preview”');
    expect(describeElement($('#p'))).toBe('Text “This role’s screens aren’t built yet.”'.replace(/’/g, "'"));
    expect(describeElement($('#card'))).toBe('Card “Your plan”');
    expect(describeElement($('#sec'))).toBe('Section “Loans”');
    expect(describeElement($('#box'))).toBe('Area');
    expect(describeElement($('#n'))).toBe('Menu');
    expect(describeElement($('#ul'))).toBe('List');
    expect(describeElement(document.body)).toBe('Whole page');
  });

  it('never shows what someone typed, masked text, or secrets', () => {
    mount(`
      <input id="pw" type="text" value="hunter2-secret">
      <div data-grabby-mask><button id="m">Account 0123456789</button></div>
      <p id="mail">Contact jane.doe@example.com for help</p>`);
    expect(describeElement($('#pw'))).toBe('Text box');
    expect(describeElement($('#m'))).toBe('Button');
    expect(describeElement($('#mail'))).not.toContain('jane.doe@example.com');
  });

  it('keeps long names short', () => {
    mount(`<p id="long">${'word '.repeat(40)}</p>`);
    expect(describeElement($('#long')).length).toBeLessThanOrEqual('Text “”'.length + 40);
  });

  it('describes saved comments the same way', () => {
    expect(describeTarget(makeTarget({ kind: 'action', tag: 'button', facts: { label: 'Choose Pro' } }))).toBe('Button “Choose Pro”');
    expect(describeTarget(makeTarget({ kind: 'container', tag: 'div', facts: { heading: 'Your plan' } }))).toBe('Section “Your plan”');
    expect(describeTarget(makeTarget({ kind: 'media', tag: 'img', facts: { alt: 'Logo' } }))).toBe('Image “Logo”');
  });
});

describe('hover label', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const labelText = () => (document.querySelector('grabby-root')?.shadowRoot ?? document).querySelector('#__grabby-label__')?.textContent ?? '';

  it('reads plainly for reviewers, and stays technical for developers', () => {
    mount('<button id="b" class="btn btn-primary">Choose Pro</button>');
    const review = createOverlayRenderer({ plainLabels: true });
    review.show($('#b'), 'PlanCard', 'src/PlanCard.tsx:15', ['btn', 'btn-primary']);
    expect(labelText()).toBe('Button “Choose Pro” · Click to select');
    review.dispose();

    const dev = createOverlayRenderer();
    dev.show($('#b'), 'PlanCard', 'src/PlanCard.tsx:15', ['btn', 'btn-primary']);
    expect(labelText()).toContain('<button> .btn.btn-primary in PlanCard');
    expect(labelText()).toContain('src/PlanCard.tsx:15');
    dev.dispose();
  });
});
