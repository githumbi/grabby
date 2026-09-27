import type { StoredComment } from '../types';

export const SITE = 'https://shop.example';
export const PK = 'pk_testtesttesttest';
export const SK = 'sk_admintokenadmintokenadmin';

const bytes = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
export const WEBP = new Uint8Array([...bytes('RIFF'), 0, 0, 0, 0, ...bytes('WEBPVP8 '), ...new Array(20).fill(0)]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]);

let seq = 0;
export function incoming(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `cmt_${String(seq).padStart(6, '0')}_abcdef`,
    createdAt: 1_700_000_000_000 + seq,
    comment: `Make it pop ${seq}`,
    author: { name: 'Jane', anonymous: false, sessionId: 'sess_aaaaaaaaaaaa' },
    page: { route: '/pricing', title: 'Pricing', viewport: [1280, 800] as [number, number] },
    target: {
      kind: 'action' as const, tag: 'button', component: 'BuyButton',
      source: { file: 'src/Buy.tsx', line: 3, column: 1 },
      stack: [], selector: '#buy', preview: '<button id="buy">Buy</button>',
      facts: { label: 'Buy' }, extra: {},
    },
    framework: 'React',
    ...overrides,
  };
}

export function stored(overrides: Partial<StoredComment> = {}): StoredComment {
  const c = incoming();
  return {
    ...c,
    updatedAt: c.createdAt,
    status: 'open',
    screenshot: null,
    projectId: 'shop',
    receivedAt: c.createdAt,
    origin: SITE,
    ...overrides,
  } as StoredComment;
}
