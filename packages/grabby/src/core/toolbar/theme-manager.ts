import type { ThemeMode, Theme } from '../types';
import { addStyles, removeStyles } from '../ui/root';

const STYLE_ID = 'theme-vars';
const OVERRIDE_STYLE_ID = 'theme-overrides';

const LIGHT_VARS = `
  :host {
    all: initial;
    --grabby-bg: #ffffff;
    --grabby-text: #334155;
    --grabby-text-muted: #94a3b8;
    --grabby-accent: #2563eb;
    --grabby-accent-hover: #1d4ed8;
    --grabby-surface: #f1f5f9;
    --grabby-border: #e2e8f0;
    --grabby-overlay-border: #2563eb;
    --grabby-overlay-bg: rgba(37, 99, 235, 0.08);
    --grabby-label-bg: #2563eb;
    --grabby-label-text: #fff;
    --grabby-toast-bg: #ffffff;
    --grabby-toast-text: #334155;
    --grabby-toast-title: #334155;
    --grabby-toast-label: #94a3b8;
    --grabby-toast-shadow: rgba(0, 0, 0, 0.12);
    --grabby-toolbar-bg: #ffffff;
    --grabby-toolbar-text: #64748b;
    --grabby-toolbar-hover: #f1f5f9;
    --grabby-toolbar-active: #2563eb;
    --grabby-toolbar-border: #e2e8f0;
    --grabby-toolbar-shadow: rgba(0, 0, 0, 0.12);
    --grabby-popover-bg: #ffffff;
    --grabby-popover-text: #334155;
    --grabby-popover-border: #e2e8f0;
    --grabby-popover-hover: #f1f5f9;
    --grabby-popover-shadow: rgba(0, 0, 0, 0.12);
  }
`;

/** Maps Theme interface fields to CSS variable names. */
const THEME_TO_VAR: Record<keyof Theme, string> = {
  overlayBorderColor: '--grabby-overlay-border',
  overlayBgColor: '--grabby-overlay-bg',
  labelBgColor: '--grabby-label-bg',
  labelTextColor: '--grabby-label-text',
  toastBgColor: '--grabby-toast-bg',
  toastTextColor: '--grabby-toast-text',
  toolbarBgColor: '--grabby-toolbar-bg',
  toolbarTextColor: '--grabby-toolbar-text',
  toolbarAccentColor: '--grabby-toolbar-active',
  popoverBgColor: '--grabby-popover-bg',
  popoverTextColor: '--grabby-popover-text',
  popoverBorderColor: '--grabby-popover-border',
};

export interface ThemeManager {
  apply(mode: ThemeMode): void;
  applyOverrides(theme: Partial<Theme>): void;
  clearOverrides(): void;
  dispose(): void;
}

/** Colours only: anything that could close the rule or pull in a URL is dropped. */
const SAFE_CSS_VALUE = /^[#a-zA-Z0-9\s(),.%-]+$/;

export function createThemeManager(): ThemeManager {
  return {
    apply(_mode: ThemeMode): void {
      addStyles(STYLE_ID, LIGHT_VARS);
    },
    applyOverrides(theme: Partial<Theme>): void {
      const vars: string[] = [];
      for (const [key, varName] of Object.entries(THEME_TO_VAR)) {
        const value = theme[key as keyof Theme];
        if (value && SAFE_CSS_VALUE.test(value) && !/url\s*\(/i.test(value)) {
          vars.push(`    ${varName}: ${value};`);
        }
      }
      if (vars.length === 0) { this.clearOverrides(); return; }
      addStyles(OVERRIDE_STYLE_ID, `  :host {\n${vars.join('\n')}\n  }`);
    },
    clearOverrides(): void {
      removeStyles(OVERRIDE_STYLE_ID);
    },
    dispose(): void {
      removeStyles(STYLE_ID);
      this.clearOverrides();
    },
  };
}
