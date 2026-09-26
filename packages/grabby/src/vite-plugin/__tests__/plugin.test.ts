import { describe, it, expect } from 'vitest';
import { grabbyVitePlugin } from '../index';

describe('grabbyVitePlugin', () => {
  it('returns a plugin object with the correct name', () => {
    const plugin = grabbyVitePlugin();
    expect(plugin.name).toBe('grabby-source-injector');
  });

  it('sets enforce to "pre"', () => {
    const plugin = grabbyVitePlugin();
    expect(plugin.enforce).toBe('pre');
  });

  it('sets apply to "serve"', () => {
    const plugin = grabbyVitePlugin();
    expect(plugin.apply).toBe('serve');
  });

  it('has a transform hook', () => {
    const plugin = grabbyVitePlugin();
    expect(plugin.transform).toBeDefined();
    expect(typeof plugin.transform).toBe('function');
  });

  it('accepts optional rootDir option', () => {
    const plugin = grabbyVitePlugin({ rootDir: '/custom/root' });
    expect(plugin.name).toBe('grabby-source-injector');
  });
});

describe('transform hook', () => {
  function getTransform() {
    const plugin = grabbyVitePlugin({ rootDir: '/project' });
    // The transform function is directly on the plugin
    return plugin.transform as (code: string, id: string) => any;
  }

  it('returns null for non-component TypeScript files', () => {
    const transform = getTransform();
    const result = transform('export class MyService {}', '/project/src/app/my.service.ts');
    expect(result).toBeNull();
  });

  it('returns null for .component.ts files without @Component', () => {
    const transform = getTransform();
    const result = transform('export class PlainClass {}', '/project/src/app/example.component.ts');
    expect(result).toBeNull();
  });

  it('transforms a .component.ts file with @Component decorator', () => {
    const transform = getTransform();
    const input = `@Component({ selector: 'app-example', template: '<p>hi</p>' })
export class ExampleComponent {}`;

    const result = transform(input, '/project/src/app/example.component.ts');
    expect(result).not.toBeNull();
    expect(result.code).toContain("'data-ng-source': 'src/app/example.component.ts:0:0'");
  });

  it('returns null for CSS files', () => {
    const transform = getTransform();
    const result = transform('.foo { color: red; }', '/project/src/app/styles.css');
    expect(result).toBeNull();
  });

  it('returns null for HTML template files', () => {
    const transform = getTransform();
    const result = transform('<div>hello</div>', '/project/src/app/example.component.html');
    expect(result).toBeNull();
  });

  it('is idempotent — skips if data-ng-source already present', () => {
    const transform = getTransform();
    const input = `@Component({
  selector: 'app-example',
  host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }
})
export class ExampleComponent {}`;

    const result = transform(input, '/project/src/app/example.component.ts');
    expect(result).toBeNull();
  });
});
