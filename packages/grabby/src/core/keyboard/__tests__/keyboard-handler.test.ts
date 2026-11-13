// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createKeyboardHandler } from '../keyboard-handler';

function setup() {
  let active = false;
  const onActivate = vi.fn(() => { active = true; });
  const onDeactivate = vi.fn(() => { active = false; });
  const handler = createKeyboardHandler({
    getActivationKey: () => 'Alt+G',
    getActivationMode: () => 'toggle',
    getKeyHoldDuration: () => 0,
    getEnableInInputs: () => false,
    onActivate,
    onDeactivate,
    isActive: () => active,
  });
  handler.start();
  return { handler, onActivate, onDeactivate };
}

function press(target: EventTarget, init: KeyboardEventInit) {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, ...init }));
  target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, ...init }));
}

describe('keyboard handler, toggle mode', () => {
  let dispose: () => void = () => {};
  afterEach(() => { dispose(); document.body.replaceChildren(); });

  it('toggles on the activation combo', () => {
    const { handler, onActivate, onDeactivate } = setup();
    dispose = () => handler.dispose();
    press(document.body, { key: '©', code: 'KeyG', altKey: true });
    expect(onActivate).toHaveBeenCalledTimes(1);
    press(document.body, { key: '©', code: 'KeyG', altKey: true });
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('ignores a plain "g" typed into a text field (comment box stays open)', () => {
    const { handler, onActivate, onDeactivate } = setup();
    dispose = () => handler.dispose();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    press(ta, { key: 'g', code: 'KeyG' });
    press(ta, { key: 'g', code: 'KeyG' });
    expect(onActivate).not.toHaveBeenCalled();
    expect(onDeactivate).not.toHaveBeenCalled();
  });

  it('ignores a plain "g" outside text fields too', () => {
    const { handler, onActivate } = setup();
    dispose = () => handler.dispose();
    press(document.body, { key: 'g', code: 'KeyG' });
    expect(onActivate).not.toHaveBeenCalled();
  });
});
