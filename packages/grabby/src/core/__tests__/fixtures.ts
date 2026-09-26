import type { GrabbyComment, GrabbyTarget } from '../types';

let seq = 0;

export function makeTarget(overrides: Partial<GrabbyTarget> = {}): GrabbyTarget {
  return {
    kind: 'action',
    tag: 'button',
    component: 'SaveButton',
    source: { file: 'src/app/save-button.tsx', line: 12, column: 4 },
    stack: [{ name: 'SaveButton', file: 'src/app/save-button.tsx', line: 12 }],
    selector: '[data-testid="save"]',
    preview: '<button class="btn" type="submit">Save</button>',
    facts: { label: 'Save', type: 'submit' },
    extra: {},
    ...overrides,
  };
}

export function makeComment(overrides: Partial<GrabbyComment> = {}): GrabbyComment {
  seq += 1;
  const createdAt = overrides.createdAt ?? 1_700_000_000_000 + seq * 1000;
  return {
    id: `c-${seq}`,
    createdAt,
    updatedAt: createdAt,
    status: 'open',
    comment: `Comment ${seq}`,
    author: { name: null, anonymous: true, sessionId: 'aaaa1111-0000-4000-8000-000000000000' },
    page: { route: '/', title: 'Test', viewport: [1280, 800] },
    target: makeTarget(),
    screenshot: null,
    framework: 'React',
    ...overrides,
  };
}
