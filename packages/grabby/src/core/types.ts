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
  /** Auto-register MCP webhook plugin to POST grabs to localhost:3456. Default: true */
  mcpWebhook: boolean;
  /**
   * Where grabs are POSTed. Default: "http://localhost:3456/grab" (the local
   * MCP server). Point it at a same-origin endpoint to collect grabs from a
   * deployed site, where localhost isn't reachable.
   */
  webhookUrl: string;
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
  stack?: Array<{ name: string; hostElement: Element | null }>;
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
  dispose(): void;
}
