import { describe, it, expect } from 'vitest';
import { transformAngularComponent } from '../transform';

const ROOT_DIR = '/project';

function transform(code: string, filePath = '/project/src/app/example.component.ts') {
  return transformAngularComponent(code, filePath, ROOT_DIR);
}

describe('transformAngularComponent', () => {
  it('adds host with data-ng-source to a basic component', () => {
    const input = `@Component({ selector: 'app-example', templateUrl: './example.component.html' })
export class ExampleComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }");
    expect(result!.code).toContain('@Component(');
  });

  it('merges into an existing host property', () => {
    const input = `@Component({
  selector: 'app-example',
  host: { 'class': 'block' }
})
export class ExampleComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("'class': 'block'");
    expect(result!.code).toContain("'data-ng-source': 'src/app/example.component.ts:0:0'");
  });

  it('is idempotent — skips if data-ng-source already exists', () => {
    const input = `@Component({
  selector: 'app-example',
  host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }
})
export class ExampleComponent {}`;

    const result = transform(input);
    expect(result).toBeNull();
  });

  it('handles multiple components in one file', () => {
    const input = `@Component({ selector: 'app-first' })
export class FirstComponent {}

@Component({ selector: 'app-second' })
export class SecondComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();

    // Both should have data-ng-source with correct line numbers
    expect(result!.code).toContain("'data-ng-source': 'src/app/example.component.ts:0:0'");
    expect(result!.code).toContain("'data-ng-source': 'src/app/example.component.ts:3:0'");
  });

  it('returns null when no @Component decorator is present', () => {
    const input = `export class PlainService {
  constructor() {}
}`;

    const result = transform(input);
    expect(result).toBeNull();
  });

  it('handles empty decorator object @Component({})', () => {
    const input = `@Component({})
export class EmptyComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }");
  });

  it('handles standalone component', () => {
    const input = `@Component({
  selector: 'app-standalone',
  standalone: true,
  template: '<p>hello</p>'
})
export class StandaloneComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain('standalone: true');
    expect(result!.code).toContain("host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }");
  });

  it('uses correct line numbers (0-indexed)', () => {
    const input = `import { Component } from '@angular/core';

// Some comment
@Component({ selector: 'app-offset' })
export class OffsetComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    // Decorator is on line 3 (0-indexed)
    expect(result!.code).toContain("'data-ng-source': 'src/app/example.component.ts:3:0'");
  });

  it('computes correct relative paths including nested directories', () => {
    const filePath = '/project/src/app/features/auth/login/login.component.ts';
    const input = `@Component({ selector: 'app-login', templateUrl: './login.component.html' })
export class LoginComponent {}`;

    const result = transformAngularComponent(input, filePath, ROOT_DIR);
    expect(result).not.toBeNull();
    expect(result!.code).toContain(
      "'data-ng-source': 'src/app/features/auth/login/login.component.ts:0:0'",
    );
  });

  it('handles component with inline template', () => {
    const input = `@Component({
  selector: 'app-inline',
  template: \`
    <div>
      <h1>Hello</h1>
    </div>
  \`
})
export class InlineComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }");
    // Ensure template is preserved
    expect(result!.code).toContain('<h1>Hello</h1>');
  });

  it('handles empty decorator call @Component()', () => {
    const input = `@Component()
export class EmptyCallComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("host: { 'data-ng-source': 'src/app/example.component.ts:0:0' }");
  });

  it('preserves the rest of the file content', () => {
    const input = `import { Component } from '@angular/core';

@Component({ selector: 'app-test' })
export class TestComponent {
  title = 'hello';

  greet(): string {
    return this.title;
  }
}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("title = 'hello'");
    expect(result!.code).toContain('greet(): string');
    expect(result!.code).toContain('return this.title');
  });

  it('handles existing host with empty object', () => {
    const input = `@Component({
  selector: 'app-empty-host',
  host: {}
})
export class EmptyHostComponent {}`;

    const result = transform(input);
    expect(result).not.toBeNull();
    expect(result!.code).toContain("'data-ng-source': 'src/app/example.component.ts:0:0'");
  });
});
