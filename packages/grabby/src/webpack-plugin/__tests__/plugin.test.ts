import { describe, it, expect, vi } from 'vitest';
import { GrabbyWebpackPlugin } from '../plugin';

describe('GrabbyWebpackPlugin', () => {
  it('can be instantiated', () => {
    const plugin = new GrabbyWebpackPlugin();
    expect(plugin).toBeInstanceOf(GrabbyWebpackPlugin);
  });

  it('has an apply method', () => {
    const plugin = new GrabbyWebpackPlugin();
    expect(typeof plugin.apply).toBe('function');
  });

  it('adds a module rule for .component.ts files', () => {
    const plugin = new GrabbyWebpackPlugin();
    const compiler = {
      options: {
        module: {
          rules: [],
        },
      },
    };

    plugin.apply(compiler);

    expect(compiler.options.module.rules.length).toBe(1);
    const rule = compiler.options.module.rules[0] as any;
    expect(rule.test).toEqual(/\.component\.ts$/);
    expect(rule.enforce).toBe('pre');
    expect(rule.use).toBeDefined();
    expect(rule.use.length).toBe(1);
    expect(rule.use[0].loader).toContain('loader');
  });

  it('creates module.rules array when missing', () => {
    const plugin = new GrabbyWebpackPlugin();
    const compiler = {
      options: {},
    };

    plugin.apply(compiler);

    expect(compiler.options.module).toBeDefined();
    expect((compiler.options as any).module.rules.length).toBe(1);
  });

  it('appends to existing rules without removing them', () => {
    const plugin = new GrabbyWebpackPlugin();
    const existingRule = { test: /\.css$/, use: ['style-loader'] };
    const compiler = {
      options: {
        module: {
          rules: [existingRule],
        },
      },
    };

    plugin.apply(compiler);

    expect(compiler.options.module.rules.length).toBe(2);
    expect(compiler.options.module.rules[0]).toBe(existingRule);
  });
});

describe('webpack-plugin exports', () => {
  it('exports GrabbyWebpackPlugin from index', async () => {
    const mod = await import('../index');
    expect(mod.GrabbyWebpackPlugin).toBeDefined();
    expect(mod.GrabbyWebpackPlugin).toBe(GrabbyWebpackPlugin);
  });
});
