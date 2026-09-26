import type { FrameworkAdapter } from './adapters/types';

export type ThemeMode = 'light';

/** What kind of UI the comment is about; decides which facts get captured. */
export type TargetKind = 'action' | 'field' | 'text' | 'media' | 'container' | 'section';

/** How much context the export includes. */
export type DetailLevel = 'compact' | 'standard' | 'detailed';

export interface SourceLocation {
  file: string;
  line: number | null;
  column: number | null;
}

export interface StackFrame {
  name: string;
  file: string | null;
  line: number | null;
}

/** The compact, serialisable description of the element a comment is about. */
export interface GrabbyTarget {
  kind: TargetKind;
  tag: string;
  component: string | null;
  source: SourceLocation | null;
  /** Up to 3 of the app's own component frames, innermost first. */
  stack: StackFrame[];
  /** Unique CSS selector. Exported only when there is no source location. */
  selector: string;
  /** Trimmed opening tag plus a text excerpt, at most ~300 characters. */
  preview: string;
  /** Kind-specific facts for the standard export, in display order. */
  facts: Record<string, string>;
  /** Extra facts only shown at the detailed level. */
  extra: Record<string, string>;
}

export interface CommentAuthor {
  name: string | null;
  anonymous: boolean;
  /** Stable random id per browser, so anonymous commenters stay distinguishable. */
  sessionId: string;
  /** The host app's own user id, when it called `identify()`. */
  userId?: string;
}

export interface PageInfo {
  /** Pathname only; query strings are dropped unless allowlisted. */
  route: string;
  title: string;
  viewport: [number, number];
}

export interface ScreenshotRef {
  /** Key of the image in this browser's IndexedDB. */
  localId?: string;
  /** Where a server stored it, once uploaded. */
  url?: string;
  width: number;
  height: number;
}

export interface GrabbyComment {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: 'open' | 'resolved';
  comment: string;
  author: CommentAuthor;
  page: PageInfo;
  target: GrabbyTarget;
  screenshot: ScreenshotRef | null;
  framework: string;
  /** Delivery to a Grabby server, when one is configured. Browser-only. */
  sync?: 'pending' | 'sent' | 'failed';
}

export interface ToolbarState {
  visible: boolean;
  themeMode: ThemeMode;
  comments: GrabbyComment[];
}

export interface GrabbyOptions {
  /** Keyboard shortcut to activate. Default: "Alt+G" (Option+G on Mac) */
  activationKey: string;
  /** Whether activation requires hold or toggle. Default: 'toggle' */
  activationMode: 'hold' | 'toggle';
  /** Milliseconds to hold before activating in hold mode. Default: 0 */
  keyHoldDuration: number;
  /** Master on/off switch. Default: true */
  enabled: boolean;
  /** Allow activation while focused in input/textarea. Default: false */
  enableInInputs: boolean;
  /** Only activate in dev mode. Default: true */
  devOnly: boolean;
  /** Show the floating mini toolbar. Default: true */
  showToolbar: boolean;
  /** Theme mode for all UI. Default: 'light' */
  themeMode: ThemeMode;
  /**
   * 'local' (default): for developers on their own machine; dev builds only.
   * 'live': for collecting feedback on a deployed site. Grabby stays hidden
   * until someone opens a feedback link (?grabby=<projectKey>), and works in
   * production builds.
   */
  mode: 'local' | 'live';
  /**
   * A grabby-server URL. Comments are saved in the browser and delivered
   * there (with retries), where you pull them or your agent reads them over
   * MCP. Locally: 'http://localhost:3456'.
   */
  server?: string;
  /** The project's public key from `grabby-server init`. Required for a public server. */
  projectKey?: string;
  /**
   * Who a comment is from. 'ask' prompts for a name (or anonymous) on the
   * first comment; 'anonymous' never asks; 'none' skips identity entirely.
   * Default: 'ask' in live mode, 'none' locally.
   */
  identity?: 'ask' | 'anonymous' | 'none';
  /** Also POST each comment as JSON to this URL (https, or http://localhost). */
  webhookUrl?: string;
  /** Persist comments across page refresh via localStorage. Default: true */
  persistHistory: boolean;
  /**
   * Also copy each comment to the clipboard as soon as it's saved. Default:
   * false: comments collect until you use Copy all.
   */
  copyOnComment: boolean;
  /** Default detail level for exports. Default: 'standard' */
  detailLevel: DetailLevel;
  /** Capture a screenshot of the commented element. Default: true */
  screenshots: boolean;
  /** Query parameters worth keeping in the recorded route, e.g. ['tab']. Default: [] */
  captureQueryParams: string[];
  /**
   * Framework adapters to try, in order. Default: every built-in adapter
   * (Angular, React, Vue, Svelte, then plain HTML), detected per element.
   */
  adapters?: FrameworkAdapter[];
  /**
   * CSP nonce for Grabby's `<style>` elements. Only used in browsers without
   * constructable stylesheets; elsewhere styles need no CSP allowance.
   */
  styleNonce?: string;
}

export interface ComponentStackEntry {
  name: string;
  filePath: string | null;
  line: number | null;
  column: number | null;
}

export interface ElementContext {
  element: Element;
  html: string;
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  componentStack: ComponentStackEntry[];
  selector: string;
  cssClasses: string[];
}

export interface PluginHooks {
  onActivate?: () => void;
  onDeactivate?: () => void;
  onElementHover?: (element: Element) => void;
  onElementSelect?: (element: Element) => void;
  /**
   * A comment was saved. Fires whether or not anything reached the clipboard,
   * so use this to persist or forward comments.
   */
  onComment?: (comment: GrabbyComment, element: Element | null) => void;
  /** A saved comment gained its screenshot (it's captured asynchronously). */
  onScreenshot?: (comment: GrabbyComment, image: Blob) => void;
  onCopySuccess?: (text: string, comments: GrabbyComment[]) => void;
  onCopyError?: (error: Error) => void;
  /** Rewrite exported text before it reaches the clipboard. */
  transformCopyContent?: (text: string, comments: GrabbyComment[]) => string;
}

export interface Theme {
  overlayBorderColor: string;
  overlayBgColor: string;
  labelBgColor: string;
  labelTextColor: string;
  toastBgColor: string;
  toastTextColor: string;
  toolbarBgColor: string;
  toolbarTextColor: string;
  toolbarAccentColor: string;
  popoverBgColor: string;
  popoverTextColor: string;
  popoverBorderColor: string;
}

export interface Plugin {
  name: string;
  hooks?: PluginHooks;
  theme?: Partial<Theme>;
  options?: Partial<GrabbyOptions>;
  setup?: (api: GrabbyAPI) => PluginCleanup | void;
}

export type PluginCleanup = () => void;

export type ComponentResolver = (element: Element) => {
  name: string | null;
  hostElement: Element | null;
  /**
   * Owning components, innermost first. An entry can carry its own location
   * when the framework knows it; otherwise it's resolved from `hostElement`.
   */
  stack?: Array<{ name: string; hostElement: Element | null; filePath?: string | null; line?: number | null }>;
} | null;

export type SourceResolver = (element: Element) => {
  filePath: string | null;
  line: number | null;
  column: number | null;
} | null;

export interface GrabbyAPI {
  activate(): void;
  deactivate(): void;
  toggle(): void;
  isActive(): boolean;
  setOptions(opts: Partial<GrabbyOptions>): void;
  registerPlugin(plugin: Plugin): void;
  unregisterPlugin(name: string): void;
  setComponentResolver(resolver: ComponentResolver): void;
  setSourceResolver(resolver: SourceResolver): void;
  showToolbar(): void;
  hideToolbar(): void;
  setThemeMode(mode: ThemeMode): void;
  /** Open comments, newest first. */
  getComments(): GrabbyComment[];
  /** Export text for the given (default: all) comments at a detail level. */
  exportComments(options?: { level?: DetailLevel; ids?: string[] }): string;
  deleteComment(id: string): void;
  clearComments(): void;
  /**
   * Tell Grabby who is signed in, so commenters aren't asked for a name.
   * Pass null on sign-out.
   */
  identify(user: { id?: string; name: string } | null): void;
  /** Show Grabby. In live mode this starts a feedback session for this tab. */
  show(): void;
  /** Hide Grabby. In live mode this ends the feedback session. */
  hide(): void;
  dispose(): void;
}
