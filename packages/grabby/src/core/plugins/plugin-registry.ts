import type { Plugin, PluginHooks, PluginCleanup, GrabbyComment, GrabbyAPI } from '../types';

export interface PluginRegistry {
  register(plugin: Plugin, api: GrabbyAPI): void;
  unregister(name: string): void;
  callHook<K extends keyof PluginHooks>(hookName: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): void;
  callTransformHook(text: string, comments: GrabbyComment[]): string;
  getPlugins(): ReadonlyArray<Plugin>;
  dispose(): void;
}

export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<string, Plugin>();
  const cleanups = new Map<string, PluginCleanup>();

  return {
    register(plugin: Plugin, api: GrabbyAPI): void {
      if (plugins.has(plugin.name)) {
        this.unregister(plugin.name);
      }
      plugins.set(plugin.name, plugin);

      if (plugin.setup) {
        const cleanup = plugin.setup(api);
        if (cleanup) {
          cleanups.set(plugin.name, cleanup);
        }
      }
    },

    unregister(name: string): void {
      const cleanup = cleanups.get(name);
      if (cleanup) {
        cleanup();
        cleanups.delete(name);
      }
      plugins.delete(name);
    },

    callHook<K extends keyof PluginHooks>(hookName: K, ...args: Parameters<NonNullable<PluginHooks[K]>>): void {
      for (const plugin of plugins.values()) {
        const hook = plugin.hooks?.[hookName];
        if (hook) {
          try {
            (hook as (...a: any[]) => void)(...args);
          } catch (err) {
            console.warn(`[grabby] Plugin "${plugin.name}" hook "${hookName}" threw:`, err);
          }
        }
      }
    },

    callTransformHook(text: string, comments: GrabbyComment[]): string {
      let result = text;
      for (const plugin of plugins.values()) {
        const transform = plugin.hooks?.transformCopyContent;
        if (transform) {
          try {
            result = transform(result, comments);
          } catch (err) {
            console.warn(`[grabby] Plugin "${plugin.name}" transformCopyContent threw:`, err);
          }
        }
      }
      return result;
    },

    getPlugins(): ReadonlyArray<Plugin> {
      return Array.from(plugins.values());
    },

    dispose(): void {
      for (const cleanup of cleanups.values()) {
        try { cleanup(); } catch { /* ignore */ }
      }
      cleanups.clear();
      plugins.clear();
    },
  };
}
