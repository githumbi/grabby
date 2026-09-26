import { Z_INDEX_POPOVER } from '../constants';
import { addStyles, hasStyles, removeStyles, getUiRoot, deepActiveElement, isEditableElement } from '../ui/root';
import { h } from '../ui/dom';

const POPOVER_ID = '__grabby-comment-popover__';
const STYLE_ID = '__grabby-comment-styles__';

export type CommentMode = 'new' | 'edit';

export interface CommentShowOpts {
  anchor: Element | null;
  initialValue?: string;
  mode: CommentMode;
  entryId?: string;
  /** Ask who's commenting (name or anonymous) before saving. */
  askIdentity?: boolean;
}

/** What the commenter chose on the identity step. */
export interface IdentityChoice {
  name: string | null;
}

export interface CommentCtx {
  mode: CommentMode;
  entryId?: string;
}

export interface CommentPopoverCallbacks {
  onSubmit(value: string, ctx: CommentCtx, identity?: IdentityChoice): void;
  onCancel(ctx: CommentCtx): void;
}

export interface CommentPopover {
  show(opts: CommentShowOpts): void;
  hide(): void;
  isVisible(): boolean;
  /** Typed (or edited) but not saved yet. */
  hasDraft(): boolean;
  isPopoverElement(el: Element): boolean;
  dispose(): void;
}

export function createCommentPopover(callbacks: CommentPopoverCallbacks): CommentPopover {
  let popover: HTMLDivElement | null = null;
  let textarea: HTMLTextAreaElement | null = null;
  let visible = false;
  let currentCtx: CommentCtx = { mode: 'new' };
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  let askIdentity = false;
  let stage: 'comment' | 'identity' = 'comment';
  let pendingValue = '';
  let nameInput: HTMLInputElement | null = null;
  let initialValue = '';

  function injectStyles(): void {
    if (hasStyles(STYLE_ID)) return;
    addStyles(STYLE_ID, `
      #${POPOVER_ID} {
        position: fixed;
        z-index: ${Z_INDEX_POPOVER};
        background: var(--grabby-popover-bg, #ffffff);
        border: 1px solid var(--grabby-popover-border, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 8px 24px var(--grabby-popover-shadow, rgba(0, 0, 0, 0.12));
        width: 300px;
        padding: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
        animation: grabby-comment-in 0.12s ease;
      }
      @keyframes grabby-comment-in {
        from { opacity: 0; transform: scale(0.96); }
        to   { opacity: 1; transform: scale(1); }
      }
      #${POPOVER_ID} textarea {
        width: 100%;
        min-height: 64px;
        padding: 8px 10px;
        border: 1px solid var(--grabby-popover-border, #e2e8f0);
        border-radius: 8px;
        background: var(--grabby-surface, #f1f5f9);
        color: var(--grabby-popover-text, #334155);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }
      #${POPOVER_ID} textarea:focus {
        border-color: var(--grabby-accent, #2563eb);
      }
      #${POPOVER_ID} textarea::placeholder {
        color: var(--grabby-text-muted, #94a3b8);
      }
      #${POPOVER_ID} .grabby-cp-title { font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--grabby-popover-text, #334155); }
      #${POPOVER_ID} .grabby-cp-sub { font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--grabby-text-muted, #94a3b8); }
      #${POPOVER_ID} .grabby-cp-name {
        width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; outline: none;
        border: 1px solid var(--grabby-popover-border, #e2e8f0); background: var(--grabby-surface, #f1f5f9);
        color: var(--grabby-popover-text, #334155); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #${POPOVER_ID} .grabby-cp-name:focus { border-color: var(--grabby-accent, #2563eb); }
      #${POPOVER_ID} .grabby-cp-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
      #${POPOVER_ID} .grabby-cp-post {
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 8px 14px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--grabby-accent, #2563eb); background: var(--grabby-accent, #2563eb); color: #fff;
      }
      #${POPOVER_ID} .grabby-cp-link {
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 8px 4px; border: none;
        background: transparent; color: var(--grabby-text-muted, #64748b); cursor: pointer; text-decoration: underline;
      }
      #${POPOVER_ID} .grabby-cp-hint {
        font-size: 11px;
        color: var(--grabby-text-muted, #94a3b8);
        white-space: nowrap;
        text-align: right;
      }
    `);
  }

  function ensurePopover(): HTMLDivElement {
    if (popover) return popover;
    injectStyles();
    popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Comment');
    textarea = document.createElement('textarea');
    textarea.placeholder = 'What should change here?';
    textarea.rows = 3;
    const hint = document.createElement('span');
    hint.className = 'grabby-cp-hint';
    hint.textContent = '↵ save · Esc cancel · ⇧↵ newline';
    popover.appendChild(textarea);
    popover.appendChild(hint);
    getUiRoot().appendChild(popover);
    return popover;
  }

  function position(el: HTMLDivElement, anchor: Element | null): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fW = 300;
    const fH = 120;
    if (!anchor) {
      el.style.left = '50%';
      el.style.top = '24px';
      el.style.transform = 'translateX(-50%)';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    let left: number; let top: number;
    if (rect.right + 16 + fW <= vw) {
      left = rect.right + 16;
      top = rect.top + rect.height / 2 - fH / 2;
    } else if (rect.left - 16 - fW >= 0) {
      left = rect.left - 16 - fW;
      top = rect.top + rect.height / 2 - fH / 2;
    } else if (rect.bottom + 12 + fH <= vh) {
      left = Math.max(12, Math.min(rect.left, vw - fW - 12));
      top = rect.bottom + 12;
    } else {
      left = Math.max(12, Math.min(rect.left, vw - fW - 12));
      top = Math.max(12, rect.top - 12 - fH);
    }
    top = Math.max(12, Math.min(top, vh - fH - 12));
    el.style.transform = '';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  /** True for fields the user could legitimately be typing into instead. */
  function isEditable(el: Element | null): boolean {
    return !!el && el !== textarea && el !== nameInput && isEditableElement(el);
  }

  function finish(identity?: IdentityChoice): void {
    const ctx = currentCtx;
    const value = pendingValue;
    doHide();
    if (identity) callbacks.onSubmit(value, ctx, identity);
    else callbacks.onSubmit(value, ctx);
  }

  /**
   * Second step, shown once per browser: who is this from? Asking after the
   * comment is written (not before) keeps the first interaction to "click
   * and type", which is what gets non-technical reviewers to leave feedback.
   */
  function showIdentityStep(): void {
    if (!popover) return;
    stage = 'identity';
    nameInput = h('input', {
      type: 'text',
      class: 'grabby-cp-name',
      placeholder: 'Your name',
      maxlength: '80',
      autocomplete: 'name',
      'aria-label': 'Your name',
    });
    const post = () => finish({ name: nameInput?.value.trim() || null });
    popover.replaceChildren(
      h('div', { class: 'grabby-cp-title' }, 'Thanks! Who is this from?'),
      h('div', { class: 'grabby-cp-sub' }, 'Your name helps the team follow up. It\'s remembered in this browser.'),
      nameInput,
      h('div', { class: 'grabby-cp-actions' },
        h('button', { type: 'button', class: 'grabby-cp-link', 'data-grabby-anonymous': '', onclick: (e: Event) => { e.stopPropagation(); finish({ name: null }); } }, 'Post anonymously'),
        h('button', { type: 'button', class: 'grabby-cp-post', 'data-grabby-post': '', onclick: (e: Event) => { e.stopPropagation(); post(); } }, 'Post'),
      ),
    );
    nameInput.focus();
  }

  function attachKey(): void {
    if (keydownHandler) return;
    keydownHandler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (stage === 'identity') {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          const ctx = currentCtx;
          doHide();
          callbacks.onCancel(ctx);
        } else if (e.key === 'Enter' && deepActiveElement() === nameInput) {
          e.preventDefault();
          e.stopImmediatePropagation();
          finish({ name: nameInput?.value.trim() || null });
        }
        return;
      }
      if (!textarea) return;
      // Normally the textarea has focus. If focus was never granted or was
      // stolen by something outside a field, the popover still owns the
      // keyboard — dropping the key here is what silently discarded comments.
      const active = deepActiveElement();
      if (active !== textarea) {
        if (isEditable(active)) return;
        textarea.focus();
      }
      e.stopImmediatePropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = textarea.value.trim();
        if (!v) return;
        pendingValue = v;
        if (askIdentity) showIdentityStep();
        else finish();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const ctx = currentCtx;
        doHide();
        callbacks.onCancel(ctx);
      }
    };
    document.addEventListener('keydown', keydownHandler, true);
  }

  function detachKey(): void {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }
  }

  function doHide(): void {
    visible = false;
    popover?.remove();
    popover = null;
    textarea = null;
    nameInput = null;
    stage = 'comment';
    detachKey();
  }

  return {
    show(opts: CommentShowOpts): void {
      doHide();
      const el = ensurePopover();
      initialValue = opts.initialValue ?? '';
      textarea!.value = initialValue;
      currentCtx = { mode: opts.mode, entryId: opts.entryId };
      askIdentity = opts.askIdentity === true && opts.mode === 'new';
      visible = true;
      position(el, opts.anchor);
      attachKey();
      // Focus now rather than only on a frame: an occluded or backgrounded tab
      // gets no frames, and without focus the textarea swallows nothing and
      // Enter never submits. The frame is kept as a retry for the case where
      // the click that opened the popover takes focus back afterwards.
      textarea?.focus();
      requestAnimationFrame(() => textarea?.focus());
    },
    hide(): void {
      if (!visible) return;
      doHide();
    },
    isVisible(): boolean { return visible; },
    hasDraft(): boolean {
      if (!visible) return false;
      if (stage === 'identity') return true;
      const v = textarea?.value.trim() ?? '';
      return v !== '' && v !== initialValue.trim();
    },
    isPopoverElement(el: Element): boolean {
      if (!popover) return false;
      let cur: Element | null = el;
      while (cur) {
        if (cur === popover || cur.id === POPOVER_ID) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    dispose(): void {
      doHide();
      removeStyles(STYLE_ID);
    },
  };
}
