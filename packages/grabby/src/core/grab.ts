import type {
  GrabbyOptions,
  GrabbyAPI,
  GrabbyComment,
  Plugin,
  ComponentResolver,
  SourceResolver,
  ThemeMode,
  DetailLevel,
} from './types';
import { createStore } from './store';
import { createOverlayRenderer } from './overlay/overlay-renderer';
import { createCrosshair } from './overlay/crosshair';
import { showToast, disposeToast, type ToastDetail } from './overlay/toast';
import { createElementPicker } from './picker/element-picker';
import { createKeyboardHandler } from './keyboard/keyboard-handler';
import { createPluginRegistry } from './plugins/plugin-registry';
import { createMcpWebhookPlugin, DEFAULT_WEBHOOK_URL } from './plugins/mcp-webhook-plugin';
import { createThemeManager } from './toolbar/theme-manager';
import { createToolbarRenderer } from './toolbar/toolbar-renderer';
import { createCommentsPanel } from './toolbar/comments-panel';
import { createCommentPopover } from './toolbar/comment-popover';
import { createCopySheet, type CopyMode } from './toolbar/copy-sheet';
import { createFreezeOverlay } from './overlay/freeze-overlay';
import { showSelectFeedback, disposeFeedbackStyles } from './overlay/select-feedback';
import { TOOLBAR_TOAST_OFFSET } from './constants';
import { safeQuery } from './utils';
import { isUiNode, eventTarget, isEditableElement, disposeUiRoot, setStyleNonce } from './ui/root';
import { loadHistory, saveHistory, clearPersistedHistory, flushPendingWrite } from './storage/history-persistence';
import { putScreenshot, deleteScreenshots } from './storage/screenshot-store';
import { captureTarget } from './capture/capture';
import { captureScreenshot, type Screenshot } from './capture/screenshot';
import { formatExport } from './capture/export';
import { sanitizeRoute } from './capture/redact';
import { disposeStyleBaseline } from './capture/styles';
import { randomId, currentAuthor, loadIdentity } from './identity/session';
import { composeAdapters, DEFAULT_ADAPTERS } from './adapters';
import { isNoiseClass } from './capture/preview';

const MAX_COMMENTS = 200;
const LEVEL_KEY = 'grabby:v1:level';
/** How long an Undo stays on offer after comments are cleared or deleted. */
const UNDO_MS = 8000;

function getDefaultOptions(): GrabbyOptions {
  return {
    // Alt/Option+G: the old Cmd/Ctrl+C default swallowed normal copying.
    activationKey: 'Alt+G',
    activationMode: 'toggle',
    keyHoldDuration: 0,
    enabled: true,
    enableInInputs: false,
    devOnly: true,
    showToolbar: true,
    themeMode: 'light',
    mcpWebhook: true,
    webhookUrl: DEFAULT_WEBHOOK_URL,
    persistHistory: true,
    copyOnComment: false,
    detailLevel: 'standard',
    screenshots: true,
    captureQueryParams: [],
  };
}

export function init(options?: Partial<GrabbyOptions>): GrabbyAPI {
  return createGrabInstance(options);
}

declare const ngDevMode: unknown;
declare const process: { env: Record<string, string | undefined> };

/**
 * Best guess at whether the host app is a development build. Both checks are
 * written as bare identifiers on purpose: bundlers replace `ngDevMode` and
 * `process.env.NODE_ENV` with literals at build time, including inside
 * dependencies, and a property read off globalThis would never be replaced.
 */
export function isDevMode(): boolean {
  try {
    if (typeof ngDevMode !== 'undefined' && ngDevMode === false) return false;
  } catch { /* not an Angular build */ }
  try {
    if (process.env.NODE_ENV === 'production') return false;
  } catch { /* no process shim in this bundle */ }
  return true;
}

function loadLevel(fallback: DetailLevel): DetailLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'compact' || v === 'standard' || v === 'detailed') return v;
  } catch { /* ignore */ }
  return fallback;
}

function saveLevel(level: DetailLevel): void {
  try { localStorage.setItem(LEVEL_KEY, level); } catch { /* ignore */ }
}

/** No-op API returned when devOnly is true and the app is in production. */
export function createNoopApi(): GrabbyAPI {
  const noop = () => {};
  return {
    activate: noop,
    deactivate: noop,
    toggle: noop,
    isActive: () => false,
    setOptions: noop,
    registerPlugin: noop,
    unregisterPlugin: noop,
    setComponentResolver: noop,
    setSourceResolver: noop,
    showToolbar: noop,
    hideToolbar: noop,
    setThemeMode: noop,
    getComments: () => [],
    exportComments: () => '',
    deleteComment: noop,
    clearComments: noop,
    dispose: noop,
  };
}

export function createGrabInstance(options?: Partial<GrabbyOptions>): GrabbyAPI {
  const defaults = getDefaultOptions();
  const merged: GrabbyOptions = { ...defaults, ...options };

  if (merged.devOnly && !isDevMode()) {
    return createNoopApi();
  }

  setStyleNonce(merged.styleNonce);
  const store = createStore(merged);

  // Seed comments from localStorage (if enabled)
  if (merged.persistHistory) {
    const persisted = loadHistory();
    if (persisted.length > 0) {
      store.state.toolbar = { ...store.state.toolbar, comments: persisted };
    }
  }

  const overlay = createOverlayRenderer();
  const crosshair = createCrosshair();
  const freezeOverlay = createFreezeOverlay();
  const pluginRegistry = createPluginRegistry();
  const themeManager = createThemeManager();

  // Adapters are tried per element, so a late-mounting app or a page mixing
  // frameworks still resolves. Explicit resolvers (setComponentResolver)
  // replace them.
  const adapters = composeAdapters(merged.adapters ?? DEFAULT_ADAPTERS);
  let componentResolver: ComponentResolver | null = adapters.resolveComponent;
  let sourceResolver: SourceResolver | null = adapters.resolveSource;
  const cleanClasses = (list: string[]) => adapters.cleanClasses(list.filter((c) => !isNoiseClass(c)));

  // The element being commented on and its screenshot, captured the moment
  // it was clicked, before anything on the page can change.
  let selectedElement: Element | null = null;
  let pendingShot: Promise<Screenshot | null> | null = null;
  let level = loadLevel(merged.detailLevel);

  // Screenshot deletions wait out the Undo window.
  const pendingShotDeletes = new Map<string, ReturnType<typeof setTimeout>>();

  themeManager.apply(store.state.toolbar.themeMode);
  updateToastOffset();

  function comments(): GrabbyComment[] {
    return store.state.toolbar.comments;
  }

  function setComments(next: GrabbyComment[]): void {
    store.state.toolbar = { ...store.state.toolbar, comments: next };
    toolbar.update(store.state);
    commentsPanel.refresh(next);
  }

  function exportText(list: GrabbyComment[], lvl: DetailLevel): string {
    const text = formatExport(list, lvl, { origin: location.host });
    return pluginRegistry.callTransformHook(text, list);
  }

  function toastDetail(c: GrabbyComment): ToastDetail {
    return {
      componentName: c.target.component,
      filePath: c.target.source?.file ?? null,
      line: c.target.source?.line ?? null,
      column: c.target.source?.column ?? null,
    };
  }

  // --- Saving a new comment ---
  function saveComment(element: Element, text: string, shot: Promise<Screenshot | null> | null): GrabbyComment {
    const now = Date.now();
    const comment: GrabbyComment = {
      id: randomId(),
      createdAt: now,
      updatedAt: now,
      status: 'open',
      comment: text,
      author: currentAuthor(loadIdentity()),
      page: {
        route: sanitizeRoute(location, store.state.options.captureQueryParams),
        title: document.title,
        viewport: [window.innerWidth, window.innerHeight],
      },
      target: captureTarget(element, { componentResolver, sourceResolver, cleanClasses }),
      screenshot: null,
      framework: adapters.frameworkFor(element),
    };

    setComments([comment, ...comments()].slice(0, MAX_COMMENTS));
    pluginRegistry.callHook('onComment', comment, element);

    if (shot) void attachScreenshot(comment.id, shot);

    const count = comments().length;
    const copyAction = { label: count === 1 ? 'Copy' : `Copy all ${count}`, onClick: openCopySheet, primary: true };
    if (store.state.options.copyOnComment) {
      void writeClipboard(exportText([comment], level)).then((ok) => {
        showToast(ok ? 'Comment saved and copied' : 'Comment saved (clipboard blocked)', {
          detail: toastDetail(comment),
          actions: count > 1 ? [copyAction] : [],
        });
      });
    } else {
      showToast(count === 1 ? 'Comment saved' : `Comment saved · ${count} total`, {
        detail: toastDetail(comment),
        actions: [copyAction],
      });
    }
    return comment;
  }

  async function attachScreenshot(id: string, shot: Promise<Screenshot | null>): Promise<void> {
    const result = await shot;
    if (!result) return;
    await putScreenshot(id, result.blob);
    const current = comments().find((c) => c.id === id);
    if (!current) {
      // Deleted while the screenshot was rendering.
      void deleteScreenshots([id]);
      return;
    }
    const updated: GrabbyComment = { ...current, screenshot: { localId: id, width: result.width, height: result.height } };
    setComments(comments().map((c) => (c.id === id ? updated : c)));
    pluginRegistry.callHook('onScreenshot', updated, result.blob);
  }

  // --- Removing comments, with Undo ---
  function removeComments(ids: string[], message: string | null): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const before = comments();
    const removed = before.filter((c) => idSet.has(c.id));
    setComments(before.filter((c) => !idSet.has(c.id)));

    const shotIds = removed.flatMap((c) => (c.screenshot?.localId ? [c.screenshot.localId] : []));
    const key = randomId();
    pendingShotDeletes.set(key, setTimeout(() => {
      pendingShotDeletes.delete(key);
      void deleteScreenshots(shotIds);
    }, UNDO_MS + 500));

    if (!message) return;
    showToast(message, {
      duration: UNDO_MS,
      actions: [{
        label: 'Undo',
        onClick: () => {
          clearTimeout(pendingShotDeletes.get(key));
          pendingShotDeletes.delete(key);
          const present = new Set(comments().map((c) => c.id));
          const restored = [...removed.filter((c) => !present.has(c.id)), ...comments()]
            .sort((a, b) => b.createdAt - a.createdAt);
          setComments(restored);
          showToast(`Restored ${removed.length} comment${removed.length === 1 ? '' : 's'}`);
        },
      }],
    });
  }

  // --- Clipboard ---
  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      pluginRegistry.callHook('onCopyError', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  function openCopySheet(): void {
    const list = comments();
    if (list.length === 0) {
      showToast('No comments to copy yet');
      return;
    }
    closeAllPopovers();
    copySheet.open({
      count: list.length,
      level,
      render: (lvl) => exportText(list, lvl),
    });
  }

  function isAnyToolbarElement(el: Element): boolean {
    return isUiNode(el) || freezeOverlay.isFreezeElement(el);
  }

  function closeAllPopovers(): void {
    commentsPanel.hide();
    commentPopover.hide();
    copySheet.close();
  }

  // --- Picker ---
  const picker = createElementPicker({
    overlay,
    crosshair,
    getComponentResolver: () => componentResolver,
    getSourceResolver: () => sourceResolver,
    isToolbarElement: isAnyToolbarElement,
    getFreezeElement: () => freezeOverlay.getElement(),
    onHover(element) {
      store.state.hoveredElement = element;
      if (element) {
        pluginRegistry.callHook('onElementHover', element);
      }
    },
    onSelect(element) {
      selectedElement = element;
      pendingShot = store.state.options.screenshots ? captureScreenshot(element) : null;
      pluginRegistry.callHook('onElementSelect', element);
      showSelectFeedback(element);
      commentPopover.show({ anchor: element, mode: 'new' });
    },
  });

  function doActivate(): void {
    if (!store.state.options.enabled) return;
    if (store.state.active) return;

    if (store.state.toolbar.visible === false && store.state.options.showToolbar) {
      store.state.toolbar = { ...store.state.toolbar, visible: true };
      toolbar.show();
    }

    closeAllPopovers();
    store.state.active = true;
    picker.activate();
    pluginRegistry.callHook('onActivate');
    toolbar.update(store.state);
  }

  function doDeactivate(force = false): void {
    if (!store.state.active) return;

    // Don't deactivate if the page is frozen — the user explicitly asked to
    // keep selection mode alive.
    if (!force && store.state.frozen) return;

    store.state.active = false;
    store.state.frozen = false;
    freezeOverlay.hide();
    picker.deactivate();
    pluginRegistry.callHook('onDeactivate');
    toolbar.update(store.state);
  }

  function toggleFreeze(): void {
    store.state.frozen = !store.state.frozen;
    if (store.state.frozen) {
      freezeOverlay.show(store.state.hoveredElement);
    } else {
      freezeOverlay.hide();
    }
    toolbar.update(store.state);
  }

  // --- Toolbar ---
  const toolbar = createToolbarRenderer({
    onSelectionMode() {
      if (store.state.active) {
        doDeactivate(true);
      } else {
        doActivate();
      }
    },

    onHistory() {
      commentPopover.hide();
      copySheet.close();
      if (commentsPanel.isVisible()) {
        commentsPanel.hide();
      } else {
        commentsPanel.show([...comments()]);
      }
    },

    onEnableToggle() {
      closeAllPopovers();
      const newEnabled = !store.state.options.enabled;
      store.state.options = { ...store.state.options, enabled: newEnabled };
      if (!newEnabled) {
        doDeactivate(true);
      }
      toolbar.update(store.state);
    },

    onDismiss() {
      closeAllPopovers();
      doDeactivate(true);
      store.state.toolbar = { ...store.state.toolbar, visible: false };
      toolbar.hide();
    },
  });

  // --- Comments panel ---
  const commentsPanel = createCommentsPanel({
    onHover(comment) {
      const el = comment ? safeQuery(comment.target.selector) : null;
      if (el && comment) {
        overlay.show(el, comment.target.component, null, []);
      } else {
        overlay.hide();
      }
    },

    onEdit(comment, rowEl) {
      overlay.hide();
      const el = safeQuery(comment.target.selector);
      commentsPanel.hide();
      commentPopover.show({
        anchor: el ?? rowEl,
        initialValue: comment.comment,
        mode: 'edit',
        entryId: comment.id,
      });
    },

    onDelete(comment) {
      overlay.hide();
      removeComments([comment.id], 'Comment deleted');
    },

    onCopyAll() {
      overlay.hide();
      openCopySheet();
    },

    onClearAll() {
      overlay.hide();
      const n = comments().length;
      removeComments(comments().map((c) => c.id), `Cleared ${n} comment${n === 1 ? '' : 's'}`);
      commentsPanel.hide();
    },
  });

  // --- Copy sheet ---
  const copySheet = createCopySheet({
    async onCopy(text: string, mode: CopyMode): Promise<boolean> {
      const list = comments();
      const ok = await writeClipboard(text);
      if (!ok) return false;
      pluginRegistry.callHook('onCopySuccess', text, list);
      const noun = `${list.length} comment${list.length === 1 ? '' : 's'}`;
      if (mode === 'clear') {
        removeComments(list.map((c) => c.id), `Copied and cleared ${noun}`);
      } else {
        showToast(`Copied ${noun}`);
      }
      return true;
    },
    onLevelChange(next) {
      level = next;
      saveLevel(next);
    },
  });

  // --- Comment popover ---
  const commentPopover = createCommentPopover({
    onSubmit(value, ctx) {
      if (ctx.mode === 'new') {
        const element = selectedElement;
        const shot = pendingShot;
        selectedElement = null;
        pendingShot = null;
        if (element) saveComment(element, value, shot);
        doDeactivate(true);
        return;
      }
      if (!ctx.entryId) return;
      const updated = comments().map((c) =>
        c.id === ctx.entryId ? { ...c, comment: value, updatedAt: Date.now() } : c,
      );
      setComments(updated);
      showToast('Comment updated');
      commentsPanel.show([...updated]);
    },
    onCancel(ctx) {
      if (ctx.mode === 'new') {
        selectedElement = null;
        pendingShot = null;
        doDeactivate(true);
        return;
      }
      commentsPanel.show([...comments()]);
    },
  });

  // --- Close popovers on outside click ---
  function handleDocumentClick(e: MouseEvent): void {
    const target = eventTarget(e);
    if (!target) return;
    if (isAnyToolbarElement(target)) return;
    if (commentsPanel.isVisible() || commentPopover.isVisible() || copySheet.isVisible()) {
      closeAllPopovers();
    }
  }
  document.addEventListener('click', handleDocumentClick);

  // A refresh can land between a comment and its batched write, which would
  // lose it. pagehide covers reload and close; visibilitychange covers the
  // mobile case where pagehide isn't guaranteed to run.
  function handlePageHide(): void {
    flushPendingWrite();
  }
  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') flushPendingWrite();
  }
  window.addEventListener('pagehide', handlePageHide);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  function updateToastOffset(): void {
    if (store.state.toolbar.visible) {
      document.documentElement.style.setProperty('--grabby-toast-bottom', TOOLBAR_TOAST_OFFSET);
    } else {
      document.documentElement.style.removeProperty('--grabby-toast-bottom');
    }
  }

  // --- Freeze key handler (F key during selection mode) ---
  function handleFreezeKey(e: KeyboardEvent): void {
    if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isEditableElement(eventTarget(e))) return;
    if (!store.state.active) return;
    e.preventDefault();
    toggleFreeze();
  }
  document.addEventListener('keydown', handleFreezeKey, true);

  // --- Escape closes the panel, or leaves selection mode ---
  function handleEscapeKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (isEditableElement(eventTarget(e))) return;
    if (commentPopover.isVisible() || copySheet.isVisible()) return;
    if (commentsPanel.isVisible()) {
      commentsPanel.hide();
      e.preventDefault();
      return;
    }
    if (!store.state.active) return;
    e.preventDefault();
    doDeactivate(true);
  }
  document.addEventListener('keydown', handleEscapeKey, true);

  const keyboard = createKeyboardHandler({
    getActivationKey: () => store.state.options.activationKey,
    getActivationMode: () => store.state.options.activationMode,
    getKeyHoldDuration: () => store.state.options.keyHoldDuration,
    getEnableInInputs: () => store.state.options.enableInInputs,
    onActivate: doActivate,
    onDeactivate: () => doDeactivate(),
    isActive: () => store.state.active,
  });

  const api: GrabbyAPI = {
    activate: doActivate,
    deactivate: () => doDeactivate(true),

    toggle(): void {
      if (store.state.active) {
        doDeactivate(true);
      } else {
        doActivate();
      }
    },

    isActive(): boolean {
      return store.state.active;
    },

    setOptions(opts: Partial<GrabbyOptions>): void {
      store.state.options = { ...store.state.options, ...opts };
    },

    registerPlugin(plugin: Plugin): void {
      if (plugin.options) {
        store.state.options = { ...store.state.options, ...plugin.options };
      }
      if (plugin.theme) {
        themeManager.applyOverrides(plugin.theme);
      }
      pluginRegistry.register(plugin, api);
    },

    unregisterPlugin(name: string): void {
      pluginRegistry.unregister(name);
    },

    setComponentResolver(resolver: ComponentResolver): void {
      componentResolver = resolver;
    },

    setSourceResolver(resolver: SourceResolver): void {
      sourceResolver = resolver;
    },

    showToolbar(): void {
      store.state.toolbar = { ...store.state.toolbar, visible: true };
      toolbar.show();
      toolbar.update(store.state);
      updateToastOffset();
    },

    hideToolbar(): void {
      closeAllPopovers();
      store.state.toolbar = { ...store.state.toolbar, visible: false };
      toolbar.hide();
      updateToastOffset();
    },

    setThemeMode(mode: ThemeMode): void {
      store.state.toolbar = { ...store.state.toolbar, themeMode: mode };
      themeManager.apply(mode);
      toolbar.update(store.state);
    },

    getComments(): GrabbyComment[] {
      return [...comments()];
    },

    exportComments(opts = {}): string {
      const ids = opts.ids ? new Set(opts.ids) : null;
      const list = ids ? comments().filter((c) => ids.has(c.id)) : comments();
      return exportText(list, opts.level ?? level);
    },

    deleteComment(id: string): void {
      removeComments([id], null);
    },

    clearComments(): void {
      removeComments(comments().map((c) => c.id), null);
    },

    dispose(): void {
      flushPendingWrite();
      doDeactivate(true);
      document.removeEventListener('click', handleDocumentClick);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleFreezeKey, true);
      document.removeEventListener('keydown', handleEscapeKey, true);
      keyboard.dispose();
      picker.dispose();
      overlay.dispose();
      crosshair.dispose();
      freezeOverlay.dispose();
      disposeToast();
      disposeFeedbackStyles();
      pluginRegistry.dispose();
      closeAllPopovers();
      toolbar.dispose();
      commentsPanel.dispose();
      commentPopover.dispose();
      copySheet.dispose();
      themeManager.dispose();
      disposeStyleBaseline();
      document.documentElement.style.removeProperty('--grabby-toast-bottom');
      disposeUiRoot();
    },
  };

  if (store.state.options.enabled) {
    keyboard.start();
  }

  // Toolbar starts hidden — it appears when selection mode is first activated
  store.state.toolbar = { ...store.state.toolbar, visible: false };

  store.subscribe((state, key) => {
    if (key === 'options') {
      if (state.options.enabled) {
        keyboard.start();
      } else {
        keyboard.stop();
        doDeactivate(true);
      }
    }
    if (key === 'toolbar') {
      updateToastOffset();
      if (state.options.persistHistory) {
        if (state.toolbar.comments.length > 0) {
          saveHistory(state.toolbar.comments);
        } else {
          clearPersistedHistory();
        }
      }
    }
  });

  if (merged.mcpWebhook) {
    api.registerPlugin(createMcpWebhookPlugin(merged.webhookUrl));
  }

  return api;
}
