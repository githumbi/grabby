import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE_ROOT = join(__dirname, '..', '..', '..');

describe('builders.json', () => {
  const buildersJson = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'builders.json'), 'utf8'),
  );

  it('has a builders property', () => {
    expect(buildersJson.builders).toBeDefined();
    expect(typeof buildersJson.builders).toBe('object');
  });

  it('defines an application builder', () => {
    const app = buildersJson.builders.application;
    expect(app).toBeDefined();
    expect(app.implementation).toBeDefined();
    expect(app.schema).toBeDefined();
    expect(app.description).toBeDefined();
  });

  it('defines a dev-server builder', () => {
    const devServer = buildersJson.builders['dev-server'];
    expect(devServer).toBeDefined();
    expect(devServer.implementation).toBeDefined();
    expect(devServer.schema).toBeDefined();
    expect(devServer.description).toBeDefined();
  });

  it('application builder points to correct implementation path', () => {
    const app = buildersJson.builders.application;
    expect(app.implementation).toContain('builders/application');
  });

  it('dev-server builder points to correct implementation path', () => {
    const devServer = buildersJson.builders['dev-server'];
    expect(devServer.implementation).toContain('builders/dev-server');
  });
});

describe('package.json', () => {
  const packageJson = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  );

  it('declares builders field pointing to builders.json', () => {
    expect(packageJson.builders).toBe('./builders.json');
  });

  it('exports builders.json', () => {
    expect(packageJson.exports['./builders.json']).toBe('./builders.json');
  });
});

describe('schema files', () => {
  it('application schema is valid JSON', () => {
    const schema = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'src', 'builder', 'builders', 'application', 'schema.json'), 'utf8'),
    );
    expect(schema.type).toBe('object');
  });

  it('dev-server schema is valid JSON', () => {
    const schema = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'src', 'builder', 'builders', 'dev-server', 'schema.json'), 'utf8'),
    );
    expect(schema.type).toBe('object');
  });
});
